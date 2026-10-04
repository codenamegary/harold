package harold.android.chat

import harold.android.contracts.SessionState
import harold.android.contracts.ToolKind

data class AcpTranscriptState(
    val rows: List<TranscriptRow> = emptyList(),
    val sessionState: SessionState? = null,
    val currentTurnId: String = "replay",
    val live: Boolean = false,
)

val emptyAcpTranscript = AcpTranscriptState()

fun beginUserTurn(
    state: AcpTranscriptState,
    turnId: String,
    text: String,
    attachmentNames: List<String> = emptyList(),
): AcpTranscriptState = state.copy(
    rows = state.rows + TranscriptUserRow(
        turnId = turnId,
        text = text,
        attachmentNames = attachmentNames,
    ),
    sessionState = SessionState.Running,
    currentTurnId = turnId,
)

fun foldAcpUpdate(
    state: AcpTranscriptState,
    parsed: ParsedAcpUpdate,
): AcpTranscriptState {
    val turnId = state.currentTurnId

    return when (parsed) {
        ParsedAcpUpdate.Ignored -> state
        is ParsedAcpUpdate.UserMessageChunk -> {
            if (turnHasAgentContent(state.rows, turnId) && turnHasUserRow(state.rows, turnId)) {
                val nextTurnId = nextReplayTurnId(turnId)
                withLiveRunning(
                    state.copy(
                        currentTurnId = nextTurnId,
                        rows = state.rows + TranscriptUserRow(
                            turnId = nextTurnId,
                            text = parsed.text,
                        ),
                    ),
                )
            } else if (turnHasUserRow(state.rows, turnId)) {
                withLiveRunning(
                    state.copy(
                        rows = updateLastMatching(
                            rows = state.rows,
                            match = { row -> row is TranscriptUserRow && row.turnId == turnId },
                            update = { row ->
                                (row as TranscriptUserRow).copy(text = row.text + parsed.text)
                            },
                        ),
                    ),
                )
            } else {
                withLiveRunning(
                    state.copy(
                        rows = state.rows + TranscriptUserRow(turnId = turnId, text = parsed.text),
                    ),
                )
            }
        }
        is ParsedAcpUpdate.AgentThoughtChunk -> {
            val existing = state.rows.findLast { row ->
                row is TranscriptThinkingRow && row.turnId == turnId
            }
            if (existing == null) {
                withLiveRunning(
                    state.copy(
                        rows = state.rows + TranscriptThinkingRow(turnId = turnId, text = parsed.text),
                    ),
                )
            } else {
                withLiveRunning(
                    state.copy(
                        rows = updateLastMatching(
                            rows = state.rows,
                            match = { row -> row is TranscriptThinkingRow && row.turnId == turnId },
                            update = { row ->
                                (row as TranscriptThinkingRow).copy(text = row.text + parsed.text)
                            },
                        ),
                    ),
                )
            }
        }
        is ParsedAcpUpdate.AgentMessageChunk -> {
            val existing = state.rows.findLast { row ->
                row is TranscriptAssistantRow && row.turnId == turnId
            }
            if (existing == null) {
                withLiveRunning(
                    state.copy(
                        rows = state.rows + TranscriptAssistantRow(turnId = turnId, text = parsed.text),
                    ),
                )
            } else {
                withLiveRunning(
                    state.copy(
                        rows = updateLastMatching(
                            rows = state.rows,
                            match = { row -> row is TranscriptAssistantRow && row.turnId == turnId },
                            update = { row ->
                                (row as TranscriptAssistantRow).copy(text = row.text + parsed.text)
                            },
                        ),
                    ),
                )
            }
        }
        is ParsedAcpUpdate.ToolCall -> withLiveRunning(
            state.copy(
                rows = state.rows + TranscriptToolRow(
                    turnId = turnId,
                    toolCallId = parsed.toolCallId,
                    toolName = parsed.toolName,
                    toolKind = parsed.toolKind,
                    status = parsed.status,
                    detail = parsed.detail,
                ),
            ),
        )
        is ParsedAcpUpdate.ToolCallUpdate -> {
            val existing = state.rows.findLast { row ->
                row is TranscriptToolRow && row.toolCallId == parsed.toolCallId
            }
            if (existing == null) {
                val toolName = parsed.toolName ?: return state
                withLiveRunning(
                    state.copy(
                        rows = state.rows + TranscriptToolRow(
                            turnId = turnId,
                            toolCallId = parsed.toolCallId,
                            toolName = toolName,
                            toolKind = parsed.toolKind ?: ToolKind.Execute,
                            status = parsed.status,
                            detail = parsed.detail,
                        ),
                    ),
                )
            } else {
                withLiveRunning(
                    state.copy(
                        rows = updateLastMatching(
                            rows = state.rows,
                            match = { row ->
                                row is TranscriptToolRow && row.toolCallId == parsed.toolCallId
                            },
                            update = { row ->
                                val tool = row as TranscriptToolRow
                                tool.copy(
                                    toolName = parsed.toolName ?: tool.toolName,
                                    toolKind = parsed.toolKind ?: tool.toolKind,
                                    detail = parsed.detail ?: tool.detail,
                                    status = parsed.status,
                                )
                            },
                        ),
                    ),
                )
            }
        }
    }
}

fun applyPromptComplete(state: AcpTranscriptState): AcpTranscriptState =
    state.copy(sessionState = SessionState.Idle)

fun applyCancelled(state: AcpTranscriptState): AcpTranscriptState =
    state.copy(sessionState = SessionState.Idle)

fun applyPermissionRequested(state: AcpTranscriptState): AcpTranscriptState =
    state.copy(sessionState = SessionState.AwaitingPermission)

fun applyPermissionResolved(state: AcpTranscriptState): AcpTranscriptState =
    state.copy(sessionState = SessionState.Running)

fun applyStreamError(state: AcpTranscriptState): AcpTranscriptState =
    state.copy(sessionState = SessionState.Error)

fun applyReconnect(): AcpTranscriptState = AcpTranscriptState(
    rows = emptyList(),
    sessionState = SessionState.Offline,
    currentTurnId = "replay",
    live = false,
)

fun applySubscribed(state: AcpTranscriptState): AcpTranscriptState {
    val nextState =
        if (
            state.sessionState == SessionState.Running ||
            state.sessionState == SessionState.AwaitingPermission
        ) {
            state.sessionState
        } else {
            SessionState.Idle
        }

    return state.copy(live = true, sessionState = nextState)
}

private fun withLiveRunning(state: AcpTranscriptState): AcpTranscriptState {
    if (!state.live) {
        return state
    }

    return state.copy(sessionState = SessionState.Running)
}

private fun turnHasUserRow(rows: List<TranscriptRow>, turnId: String): Boolean =
    rows.any { row -> row is TranscriptUserRow && row.turnId == turnId }

private fun turnHasAgentContent(rows: List<TranscriptRow>, turnId: String): Boolean =
    rows.any { row ->
        row.turnId == turnId &&
            (row is TranscriptAssistantRow || row is TranscriptThinkingRow || row is TranscriptToolRow)
    }

private fun nextReplayTurnId(current: String): String {
    val match = Regex("^replay(?:-(\\d+))?$").matchEntire(current)
        ?: return "$current-2"
    val serialGroup = match.groupValues[1]
    val serial = if (serialGroup.isEmpty()) 2 else serialGroup.toInt() + 1
    return "replay-$serial"
}

private fun updateLastMatching(
    rows: List<TranscriptRow>,
    match: (TranscriptRow) -> Boolean,
    update: (TranscriptRow) -> TranscriptRow,
): List<TranscriptRow> {
    val index = rows.indexOfLast(match)
    if (index < 0) {
        return rows
    }

    return rows.toMutableList().also { list ->
        list[index] = update(list[index])
    }
}
