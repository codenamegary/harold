package server.agent.android.chat

import kotlinx.serialization.serializer
import server.agent.android.contracts.AgentServerJson
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType
import server.agent.android.contracts.OutputCompletePayload
import server.agent.android.contracts.OutputDeltaPayload
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.SessionStatePayload
import server.agent.android.contracts.ThoughtDeltaPayload
import server.agent.android.contracts.ToolCallStatus
import server.agent.android.contracts.ToolCompletedPayload
import server.agent.android.contracts.ToolStartedPayload
import server.agent.android.contracts.TurnCancelledPayload
import server.agent.android.contracts.TurnCompletedPayload
import server.agent.android.contracts.TurnFailedPayload
import server.agent.android.contracts.TurnStartedPayload

enum class TurnTerminalStatus {
    Completed,
    Failed,
    Cancelled,
}

sealed interface TranscriptRow {
    val turnId: String
}

data class TranscriptUserRow(
    override val turnId: String,
    val text: String,
) : TranscriptRow

data class TranscriptThinkingRow(
    override val turnId: String,
    val text: String,
) : TranscriptRow

data class TranscriptAssistantRow(
    override val turnId: String,
    val text: String,
) : TranscriptRow

data class TranscriptToolRow(
    override val turnId: String,
    val toolCallId: String,
    val toolName: String,
    val toolKind: server.agent.android.contracts.ToolKind,
    val status: ToolCallStatus,
) : TranscriptRow

data class TranscriptTurnStatusRow(
    override val turnId: String,
    val status: TurnTerminalStatus,
    val failureCode: String? = null,
) : TranscriptRow

data class TranscriptState(
    val rows: List<TranscriptRow> = emptyList(),
    val cursor: Long = 0,
    val sessionState: SessionState? = null,
)

val emptyTranscript = TranscriptState()

fun foldTranscriptEvents(
    state: TranscriptState,
    events: List<EventEnvelope>,
    sessionId: String,
): TranscriptState = events.fold(state) { current, event ->
    foldTranscriptEvent(current, event, sessionId)
}

fun foldTranscriptEvent(
    state: TranscriptState,
    event: EventEnvelope,
    sessionId: String,
): TranscriptState {
    if (event.sessionId != null && event.sessionId != sessionId) {
        return state
    }

    val eventCursor = event.cursor.toLongOrNull() ?: 0L
    if (eventCursor <= state.cursor && state.cursor > 0L) {
        return state
    }

    val withCursor = state.copy(cursor = eventCursor)

    return when (event.type) {
        EventType.TurnStarted -> {
            val payload = decodePayload<TurnStartedPayload>(event) ?: return withCursor
            withCursor.copy(
                rows = withCursor.rows + TranscriptUserRow(
                    turnId = payload.turnId,
                    text = payload.text,
                ),
            )
        }

        EventType.SessionThoughtDelta -> {
            val payload = decodePayload<ThoughtDeltaPayload>(event) ?: return withCursor
            val existing = withCursor.rows.findLast {
                it is TranscriptThinkingRow && it.turnId == payload.turnId
            } as? TranscriptThinkingRow

            if (existing == null) {
                withCursor.copy(
                    rows = withCursor.rows + TranscriptThinkingRow(
                        turnId = payload.turnId,
                        text = payload.text,
                    ),
                )
            } else {
                withCursor.copy(
                    rows = updateLastMatching(
                        withCursor.rows,
                        { row -> row is TranscriptThinkingRow && row.turnId == payload.turnId },
                    ) { row ->
                        (row as TranscriptThinkingRow).copy(text = row.text + payload.text)
                    },
                )
            }
        }

        EventType.SessionOutputDelta -> {
            val payload = decodePayload<OutputDeltaPayload>(event) ?: return withCursor
            val existing = withCursor.rows.findLast {
                it is TranscriptAssistantRow && it.turnId == payload.turnId
            } as? TranscriptAssistantRow

            if (existing == null) {
                withCursor.copy(
                    rows = withCursor.rows + TranscriptAssistantRow(
                        turnId = payload.turnId,
                        text = payload.text,
                    ),
                )
            } else {
                withCursor.copy(
                    rows = updateLastMatching(
                        withCursor.rows,
                        { row -> row is TranscriptAssistantRow && row.turnId == payload.turnId },
                    ) { row ->
                        (row as TranscriptAssistantRow).copy(text = row.text + payload.text)
                    },
                )
            }
        }

        EventType.SessionOutputComplete -> {
            val payload = decodePayload<OutputCompletePayload>(event) ?: return withCursor
            val existing = withCursor.rows.findLast {
                it is TranscriptAssistantRow && it.turnId == payload.turnId
            } as? TranscriptAssistantRow

            if (existing == null) {
                withCursor.copy(
                    rows = withCursor.rows + TranscriptAssistantRow(
                        turnId = payload.turnId,
                        text = payload.text,
                    ),
                )
            } else {
                withCursor.copy(
                    rows = updateLastMatching(
                        withCursor.rows,
                        { row -> row is TranscriptAssistantRow && row.turnId == payload.turnId },
                    ) { row ->
                        (row as TranscriptAssistantRow).copy(text = payload.text)
                    },
                )
            }
        }

        EventType.SessionToolStarted -> {
            val payload = decodePayload<ToolStartedPayload>(event) ?: return withCursor
            withCursor.copy(
                rows = withCursor.rows + TranscriptToolRow(
                    turnId = payload.turnId,
                    toolCallId = payload.toolCallId,
                    toolName = payload.toolName,
                    toolKind = payload.toolKind,
                    status = ToolCallStatus.Pending,
                ),
            )
        }

        EventType.SessionToolCompleted -> {
            val payload = decodePayload<ToolCompletedPayload>(event) ?: return withCursor
            withCursor.copy(
                rows = updateLastMatching(
                    withCursor.rows,
                    { row -> row is TranscriptToolRow && row.toolCallId == payload.toolCallId },
                ) { row ->
                    (row as TranscriptToolRow).copy(
                        toolName = payload.toolName,
                        toolKind = payload.toolKind,
                        status = payload.status,
                    )
                },
            )
        }

        EventType.SessionState -> {
            val payload = decodePayload<SessionStatePayload>(event) ?: return withCursor
            if (payload.sessionId != sessionId) {
                return withCursor
            }
            withCursor.copy(sessionState = payload.state)
        }

        EventType.TurnCompleted -> {
            val payload = decodePayload<TurnCompletedPayload>(event) ?: return withCursor
            if (payload.sessionId != sessionId) {
                return withCursor
            }
            withCursor.copy(
                rows = withCursor.rows + TranscriptTurnStatusRow(
                    turnId = payload.turnId,
                    status = TurnTerminalStatus.Completed,
                ),
            )
        }

        EventType.TurnFailed -> {
            val payload = decodePayload<TurnFailedPayload>(event) ?: return withCursor
            if (payload.sessionId != sessionId) {
                return withCursor
            }
            withCursor.copy(
                rows = withCursor.rows + TranscriptTurnStatusRow(
                    turnId = payload.turnId,
                    status = TurnTerminalStatus.Failed,
                    failureCode = payload.failureCode.name,
                ),
            )
        }

        EventType.TurnCancelled -> {
            val payload = decodePayload<TurnCancelledPayload>(event) ?: return withCursor
            if (payload.sessionId != sessionId) {
                return withCursor
            }
            withCursor.copy(
                rows = withCursor.rows + TranscriptTurnStatusRow(
                    turnId = payload.turnId,
                    status = TurnTerminalStatus.Cancelled,
                ),
            )
        }

        else -> withCursor
    }
}

private inline fun <reified T> decodePayload(event: EventEnvelope): T? =
    runCatching {
        AgentServerJson.decodeFromJsonElement(serializer<T>(), event.payload)
    }.getOrNull()

private fun updateLastMatching(
    rows: List<TranscriptRow>,
    match: (TranscriptRow) -> Boolean,
    update: (TranscriptRow) -> TranscriptRow,
): List<TranscriptRow> {
    val index = rows.indexOfLast(match)
    if (index < 0) {
        return rows
    }

    val row = rows[index]
    return rows.toMutableList().apply {
        this[index] = update(row)
    }
}
