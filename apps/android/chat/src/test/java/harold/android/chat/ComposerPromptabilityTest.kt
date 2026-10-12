package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.contracts.AgentId
import harold.android.contracts.SessionState

class ComposerPromptabilityTest {
    @Test
    fun blocksComposerUntilTheSessionExists() {
        assertFalse(
            isComposerPromptable(
                agentId = "cursor",
                sessionId = "",
                sessionState = null,
            ),
        )
    }

    @Test
    fun enablesComposerWhenSessionIdle() {
        assertTrue(
            isComposerPromptable(
                agentId = "cursor",
                sessionId = "sess_01",
                sessionState = SessionState.Idle,
            ),
        )
    }

    @Test
    fun blocksComposerWhileRunning() {
        assertFalse(
            isComposerPromptable(
                agentId = "cursor",
                sessionId = "sess_01",
                sessionState = SessionState.Running,
            ),
        )
    }

    @Test
    fun blocksComposerWithoutAnAgent() {
        assertFalse(
            isComposerPromptable(
                agentId = null,
                sessionId = "sess_01",
                sessionState = SessionState.Idle,
            ),
        )
    }

    @Test
    fun showsOfflineMessage() {
        assertEquals(
            "Session reconnecting. Prompts unlock when it is idle again.",
            composerBlockedMessage(SessionState.Offline),
        )
    }

    @Test
    fun resolvesEffectiveSessionStateFromTranscriptFirst() {
        assertEquals(
            SessionState.Running,
            resolveEffectiveSessionState(
                sessionId = "sess_01",
                transcriptSessionState = SessionState.Running,
                listSessionState = SessionState.Idle,
            ),
        )
    }

    @Test
    fun returnsNullWhenNoSessionSelected() {
        assertNull(
            resolveEffectiveSessionState(
                sessionId = "",
                transcriptSessionState = SessionState.Idle,
                listSessionState = SessionState.Idle,
            ),
        )
    }
}
