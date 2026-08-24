package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.SessionState

class ComposerPromptabilityTest {
    @Test
    fun enablesComposerForDraftNewSession() {
        assertTrue(
            isComposerPromptable(
                workspaceId = "ws_01",
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
                workspaceId = "ws_01",
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
                workspaceId = "ws_01",
                agentId = "cursor",
                sessionId = "sess_01",
                sessionState = SessionState.Running,
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
