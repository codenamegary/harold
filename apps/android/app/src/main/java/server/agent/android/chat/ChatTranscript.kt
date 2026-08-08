package server.agent.android.chat

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun ChatTranscript(
    rows: List<TranscriptRow>,
    isRunning: Boolean,
    showWelcome: Boolean,
    modifier: Modifier = Modifier,
) {
    val blocks = groupTranscriptRows(rows)
    val listState = rememberLazyListState()
    val activeTurnId = latestTurnId(rows)
    val showWaitingIndicator =
        isRunning
            && (
                rows.isEmpty()
                    || (activeTurnId != null && !turnHasAssistant(rows, activeTurnId))
                )
    val waitingWithoutThought =
        showWaitingIndicator && rows.none { it is TranscriptThinkingRow }

    LaunchedEffect(blocks.size, waitingWithoutThought, rows) {
        val lastIndex = blocks.size - 1 + if (waitingWithoutThought) 1 else 0
        if (lastIndex >= 0) {
            listState.animateScrollToItem(lastIndex)
        }
    }

    when {
        rows.isNotEmpty() || waitingWithoutThought -> {
            LazyColumn(
                state = listState,
                modifier = modifier
                    .fillMaxSize()
                    .testTag("chat_transcript"),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                itemsIndexed(
                    items = blocks,
                    key = { _, block -> transcriptBlockKey(block) },
                ) { _, block ->
                    when (block) {
                        is TranscriptBlock.Tools -> {
                            ToolCallGroup(tools = block.tools)
                        }

                        is TranscriptBlock.Row -> {
                            TranscriptBlockRow(
                                row = block.row,
                                index = block.index,
                                rows = rows,
                                isRunning = isRunning,
                                activeTurnId = activeTurnId,
                            )
                        }
                    }
                }

                if (waitingWithoutThought) {
                    item(key = "thinking-indicator") {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .testTag("chat_progress"),
                        ) {
                            ThinkingIndicator()
                        }
                    }
                }
            }
        }

        showWelcome -> {
            WelcomeMessage(modifier = modifier)
        }
    }
}

@Composable
private fun TranscriptBlockRow(
    row: TranscriptRow,
    index: Int,
    rows: List<TranscriptRow>,
    isRunning: Boolean,
    activeTurnId: String?,
) {
    when (row) {
        is TranscriptUserRow -> {
            Text(
                text = row.text,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.outlineVariant,
                        shape = RoundedCornerShape(8.dp),
                    )
                    .padding(horizontal = 14.dp, vertical = 12.dp)
                    .testTag("transcript_user"),
            )
        }

        is TranscriptThinkingRow -> {
            val isActiveThought =
                isRunning
                    && activeTurnId == row.turnId
                    && !turnHasAssistant(rows, row.turnId)
                    && rows.indexOfLast { it is TranscriptThinkingRow } == index

            ThinkingSection(
                text = row.text,
                isActive = isActiveThought,
            )
        }

        is TranscriptAssistantRow -> {
            MarkdownMessage(
                text = row.text,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp)
                    .testTag("transcript_assistant"),
            )
        }

        is TranscriptToolRow -> {
            // Consecutive tools are grouped; a lone tool still goes through ToolCallGroup.
            ToolCallGroup(tools = listOf(row))
        }

        is TranscriptTurnStatusRow -> {
            val label = when (row.status) {
                TurnTerminalStatus.Completed -> "Turn completed"
                TurnTerminalStatus.Failed -> row.failureCode?.let { code ->
                    "Turn failed ($code)"
                } ?: "Turn failed"
                TurnTerminalStatus.Cancelled -> "Turn canceled"
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("transcript_turn_status"),
            )
        }
    }
}

private fun latestTurnId(rows: List<TranscriptRow>): String? =
    rows.lastOrNull { it is TranscriptUserRow }?.turnId

private fun turnHasAssistant(rows: List<TranscriptRow>, turnId: String): Boolean =
    rows.any { it is TranscriptAssistantRow && it.turnId == turnId }

private fun transcriptBlockKey(block: TranscriptBlock): String =
    when (block) {
        is TranscriptBlock.Tools ->
            "tools-${block.startIndex}-${block.tools.firstOrNull()?.toolCallId ?: "empty"}"
        is TranscriptBlock.Row -> transcriptRowKey(block.row, block.index)
    }

private fun transcriptRowKey(row: TranscriptRow, index: Int): String =
    when (row) {
        is TranscriptUserRow,
        is TranscriptThinkingRow,
        is TranscriptAssistantRow,
        -> "${row::class.simpleName}-${row.turnId}-$index"
        is TranscriptToolRow -> "tool-${row.toolCallId}"
        is TranscriptTurnStatusRow -> "turn-status-${row.turnId}-$index"
    }
