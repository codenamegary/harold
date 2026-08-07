package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.ToolCallStatus
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

class TranscriptReducerTest {
    @Test
    fun turnStartedAppendsUserRow() {
        val next = foldTranscriptEvent(
            emptyTranscript,
            turnStarted(cursor = "1", text = "Explain auth"),
            sessionId = SESSION_ID,
        )

        assertEquals(1, next.rows.size)
        assertTrue(next.rows[0] is TranscriptUserRow)
        assertEquals("Explain auth", (next.rows[0] as TranscriptUserRow).text)
        assertEquals(1L, next.cursor)
    }

    @Test
    fun thoughtAndOutputDeltasAccumulate() {
        val next = foldTranscriptEvents(
            emptyTranscript,
            listOf(
                turnStarted(cursor = "1"),
                thoughtDelta(cursor = "2", text = "Hmm"),
                thoughtDelta(cursor = "3", text = " more"),
                outputDelta(cursor = "4", text = "Hi"),
                outputDelta(cursor = "5", text = " there"),
            ),
            sessionId = SESSION_ID,
        )

        assertEquals(3, next.rows.size)
        assertEquals("Hmm more", (next.rows[1] as TranscriptThinkingRow).text)
        assertEquals("Hi there", (next.rows[2] as TranscriptAssistantRow).text)
    }

    @Test
    fun toolStartedAndCompletedUpdateToolRow() {
        val next = foldTranscriptEvents(
            emptyTranscript,
            listOf(
                turnStarted(cursor = "1"),
                toolStarted(cursor = "2"),
                toolCompleted(cursor = "3"),
            ),
            sessionId = SESSION_ID,
        )

        val tool = next.rows[1] as TranscriptToolRow
        assertEquals("read", tool.toolName)
        assertEquals(ToolCallStatus.Completed, tool.status)
    }

    @Test
    fun statusOnlyToolCompletedKeepsStartedToolName() {
        val next = foldTranscriptEvents(
            emptyTranscript,
            listOf(
                turnStarted(cursor = "1"),
                toolStarted(cursor = "2"),
                toolCompletedStatusOnly(cursor = "3"),
            ),
            sessionId = SESSION_ID,
        )

        val tool = next.rows[1] as TranscriptToolRow
        assertEquals("read", tool.toolName)
        assertEquals(ToolCallStatus.Completed, tool.status)
    }

    @Test
    fun sessionStateUpdatesRunningFlag() {
        val running = foldTranscriptEvent(
            emptyTranscript,
            sessionState(cursor = "6", state = SessionState.Running),
            sessionId = SESSION_ID,
        )
        assertEquals(SessionState.Running, running.sessionState)

        val idle = foldTranscriptEvent(
            running,
            sessionState(cursor = "7", state = SessionState.Idle),
            sessionId = SESSION_ID,
        )
        assertEquals(SessionState.Idle, idle.sessionState)
    }

    @Test
    fun ignoresEventsFromOtherSessions() {
        val next = foldTranscriptEvents(
            emptyTranscript,
            listOf(
                turnStarted(cursor = "1", text = "mine", sessionId = SESSION_ID),
                turnStarted(cursor = "2", text = "other", sessionId = "sess_other"),
            ),
            sessionId = SESSION_ID,
        )

        assertEquals(1, next.rows.size)
        assertEquals("mine", (next.rows[0] as TranscriptUserRow).text)
    }

    @Test
    fun duplicateCursorDoesNotDoubleApply() {
        val first = foldTranscriptEvent(
            emptyTranscript,
            turnStarted(cursor = "1", text = "once"),
            sessionId = SESSION_ID,
        )
        val duplicate = foldTranscriptEvent(
            first,
            turnStarted(cursor = "1", text = "once"),
            sessionId = SESSION_ID,
        )

        assertEquals(1, duplicate.rows.size)
    }

    @Test
    fun replayFromEmptyRebuildsTranscript() {
        val replayed = foldTranscriptEvents(
            emptyTranscript,
            listOf(
                turnStarted(cursor = "1"),
                thoughtDelta(cursor = "2", text = "plan"),
                toolStarted(cursor = "3"),
                outputDelta(cursor = "4", text = "done"),
                toolCompleted(cursor = "5"),
                sessionState(cursor = "6", state = SessionState.Idle),
            ),
            sessionId = SESSION_ID,
        )

        assertEquals(
            listOf("user", "thinking", "tool", "assistant"),
            replayed.rows.map { row ->
                when (row) {
                    is TranscriptUserRow -> "user"
                    is TranscriptThinkingRow -> "thinking"
                    is TranscriptToolRow -> "tool"
                    is TranscriptAssistantRow -> "assistant"
                    is TranscriptTurnStatusRow -> "turn-status"
                }
            },
        )
        assertEquals(SessionState.Idle, replayed.sessionState)
        assertEquals(6L, replayed.cursor)
    }

    @Test
    fun turnTerminalStatesAreVisible() {
        val completed = foldTranscriptEvent(
            emptyTranscript,
            turnCompleted(cursor = "1"),
            sessionId = SESSION_ID,
        )
        assertTrue(completed.rows[0] is TranscriptTurnStatusRow)
        assertEquals(TurnTerminalStatus.Completed, (completed.rows[0] as TranscriptTurnStatusRow).status)

        val failed = foldTranscriptEvent(
            emptyTranscript,
            turnFailed(cursor = "1"),
            sessionId = SESSION_ID,
        )
        assertEquals(TurnTerminalStatus.Failed, (failed.rows[0] as TranscriptTurnStatusRow).status)

        val cancelled = foldTranscriptEvent(
            emptyTranscript,
            turnCancelled(cursor = "1"),
            sessionId = SESSION_ID,
        )
        assertEquals(TurnTerminalStatus.Cancelled, (cancelled.rows[0] as TranscriptTurnStatusRow).status)
    }

    @Test
    fun multipleTurnsStayInOrder() {
        val next = foldTranscriptEvents(
            emptyTranscript,
            listOf(
                turnStarted(cursor = "1", text = "first", turnId = TURN_A),
                outputDelta(cursor = "2", text = "one", turnId = TURN_A),
                sessionState(cursor = "3", state = SessionState.Idle),
                turnStarted(cursor = "4", text = "second", turnId = TURN_B),
                outputDelta(cursor = "5", text = "two", turnId = TURN_B),
            ),
            sessionId = SESSION_ID,
        )

        assertEquals(4, next.rows.size)
        assertEquals("first", (next.rows[0] as TranscriptUserRow).text)
        assertEquals("second", (next.rows[2] as TranscriptUserRow).text)
    }

    @Test
    fun interleavedSessionsOnlyFoldTargetSession() {
        val next = foldTranscriptEvents(
            emptyTranscript,
            listOf(
                turnStarted(cursor = "1", text = "a", sessionId = "sess_a"),
                turnStarted(cursor = "2", text = "b", sessionId = SESSION_ID),
                outputDelta(cursor = "3", text = "only-b", sessionId = SESSION_ID, turnId = TURN_B),
                outputDelta(cursor = "4", text = "only-a", sessionId = "sess_a", turnId = TURN_A),
            ),
            sessionId = SESSION_ID,
        )

        assertEquals(2, next.rows.size)
        assertEquals("b", (next.rows[0] as TranscriptUserRow).text)
        assertEquals("only-b", (next.rows[1] as TranscriptAssistantRow).text)
    }

    private companion object {
        const val SESSION_ID = "sess_01"
        const val TURN_A = "turn_01JFC8C7E77NQCFH0RF9Z22JHH"
        const val TURN_B = "turn_01JFC8C7E77NQCFH0RF9Z23JHH"
    }
}
