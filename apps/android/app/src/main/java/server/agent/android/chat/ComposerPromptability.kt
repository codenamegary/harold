package server.agent.android.chat

import server.agent.android.contracts.SessionState

fun resolveEffectiveSessionState(
    sessionId: String,
    transcriptSessionState: SessionState?,
    listSessionState: SessionState?,
): SessionState? {
    if (sessionId.isEmpty()) {
        return null
    }

    return transcriptSessionState ?: listSessionState
}

fun isComposerPromptable(
    workspaceId: String,
    agentId: server.agent.android.contracts.AgentId?,
    sessionId: String,
    sessionState: SessionState?,
): Boolean {
    if (workspaceId.isEmpty() || agentId == null) {
        return false
    }

    if (sessionId.isEmpty()) {
        return true
    }

    return sessionState == SessionState.Idle
}

fun composerBlockedMessage(sessionState: SessionState?): String? =
    when (sessionState) {
        SessionState.Starting ->
            "Session is starting. Wait until it is idle."
        SessionState.AwaitingPermission ->
            "Waiting for permission. Prompts unlock when it is idle."
        SessionState.Stopping ->
            "Session is stopping. Wait for it to finish."
        SessionState.Offline ->
            "Session reconnecting. Prompts unlock when it is idle again."
        SessionState.Error ->
            "Session ended with an error. Start a new session to continue."
        SessionState.Archived ->
            "Session archived. Select another session."
        else -> null
    }

fun showComposerCancel(sessionState: SessionState?): Boolean =
    sessionState == SessionState.Running ||
        sessionState == SessionState.Starting ||
        sessionState == SessionState.AwaitingPermission

fun isSessionRunning(sessionState: SessionState?): Boolean =
    sessionState == SessionState.Running ||
        sessionState == SessionState.Starting ||
        sessionState == SessionState.AwaitingPermission ||
        sessionState == SessionState.Stopping
