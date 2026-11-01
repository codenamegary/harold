package harold.android.live

import harold.android.contracts.SessionState
import harold.android.contracts.ToolKind

data class AcpTranscriptState(
    val rows: List<TranscriptRow> = emptyList(),
    val sessionState: SessionState? = null,
    val currentTurnId: String = "replay",
    val live: Boolean = false,
    /** Set when a permission prompt interrupts the turn, so the next chunk starts a segment. */
    val segmentBoundary: Boolean = false,
    /** Latest context usage. Null until the agent sends its first `usage_update`. */
    val usage: ContextUsage? = null,
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
    segmentBoundary = false,
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
                        segmentBoundary = false,
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
                        segmentBoundary = false,
                    ),
                )
            } else {
                withLiveRunning(
                    state.copy(
                        rows = state.rows + TranscriptUserRow(turnId = turnId, text = parsed.text),
                        segmentBoundary = false,
                    ),
                )
            }
        }
        is ParsedAcpUpdate.AgentThoughtChunk -> {
            val lastInTurn = state.rows.lastOrNull { row -> row.turnId == turnId }
            val extendsCurrentSegment =
                !state.segmentBoundary && lastInTurn is TranscriptThinkingRow
            val rows = if (extendsCurrentSegment) {
                updateLastMatching(
                    rows = state.rows,
                    match = { row -> row is TranscriptThinkingRow && row.turnId == turnId },
                    update = { row ->
                        (row as TranscriptThinkingRow).copy(text = row.text + parsed.text)
                    },
                )
            } else {
                state.rows + TranscriptThinkingRow(turnId = turnId, text = parsed.text)
            }
            withLiveRunning(state.copy(rows = rows, segmentBoundary = false))
        }
        is ParsedAcpUpdate.AgentMessageChunk -> {
            val lastInTurn = state.rows.lastOrNull { row -> row.turnId == turnId }
            val extendsCurrentSegment =
                !state.segmentBoundary && lastInTurn is TranscriptAssistantRow
            val rows = if (extendsCurrentSegment) {
                updateLastMatching(
                    rows = state.rows,
                    match = { row -> row is TranscriptAssistantRow && row.turnId == turnId },
                    update = { row ->
                        (row as TranscriptAssistantRow).copy(text = row.text + parsed.text)
                    },
                )
            } else {
                state.rows + TranscriptAssistantRow(turnId = turnId, text = parsed.text)
            }
            withLiveRunning(state.copy(rows = rows, segmentBoundary = false))
        }
        // Usage is bookkeeping, not transcript content. It must not add a row
        // or move the session state; it can arrive after PromptComplete.
        is ParsedAcpUpdate.Usage -> state.copy(usage = parsed.usage)
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
    state.copy(
        sessionState = SessionState.AwaitingPermission,
        segmentBoundary = true,
    )

fun applyPermissionResolved(state: AcpTranscriptState): AcpTranscriptState =
    state.copy(sessionState = SessionState.Running)

fun applyElicitationRequested(state: AcpTranscriptState): AcpTranscriptState =
    state.copy(
        sessionState = SessionState.AwaitingAnswer,
        segmentBoundary = true,
    )

fun applyElicitationResolved(
    state: AcpTranscriptState,
    hasPending: Boolean,
): AcpTranscriptState =
    if (hasPending) {
        state.copy(sessionState = SessionState.AwaitingAnswer)
    } else {
        state.copy(sessionState = SessionState.Running)
    }

/** Adds a resolved question row once per request. */
fun appendTranscriptQuestion(
    state: AcpTranscriptState,
    requestId: String,
    title: String,
    answers: List<Pair<String, String>>,
    toolCallId: String? = null,
): AcpTranscriptState {
    if (state.rows.any { row -> row is TranscriptQuestionRow && row.requestId == requestId }) {
        return state
    }
    val row = TranscriptQuestionRow(
        turnId = state.currentTurnId,
        requestId = requestId,
        title = title,
        answers = answers,
        toolCallId = toolCallId,
    )
    val toolIndex = toolCallId?.let { id ->
        state.rows.indexOfLast { candidate ->
            candidate is TranscriptToolRow &&
                candidate.turnId == state.currentTurnId &&
                candidate.toolCallId == id
        }
    } ?: -1
    val rows = if (toolIndex >= 0) {
        state.rows.toMutableList().also { list -> list[toolIndex] = row }
    } else {
        state.rows + row
    }
    return state.copy(rows = rows)
}

fun applyStreamError(state: AcpTranscriptState): AcpTranscriptState =
    state.copy(sessionState = SessionState.Error)

fun applyReconnect(): AcpTranscriptState = AcpTranscriptState(
    rows = emptyList(),
    sessionState = SessionState.Offline,
    currentTurnId = "replay",
    live = false,
)

fun applySubscribed(state: AcpTranscriptState): AcpTranscriptState {
    val waitingForInput =
        state.sessionState == SessionState.AwaitingPermission ||
            state.sessionState == SessionState.AwaitingAnswer
    val latestTurnId = state.rows.lastOrNull { row -> row is TranscriptUserRow }?.turnId
    val lastInLatestTurn =
        latestTurnId?.let { turnId ->
            state.rows.lastOrNull { row -> row.turnId == turnId && row !is TranscriptQuestionRow }
        }
    val staleReply =
        state.sessionState == SessionState.Running &&
            lastInLatestTurn is TranscriptAssistantRow
    val nextState =
        if (
            waitingForInput ||
            (state.sessionState == SessionState.Running && !staleReply)
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
