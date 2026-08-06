package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import server.agent.android.contracts.ToolCallStatus

@Composable
fun ChatTranscript(
    rows: List<TranscriptRow>,
    showProgress: Boolean,
    emptyMessage: String?,
    modifier: Modifier = Modifier,
) {
    when {
        rows.isNotEmpty() -> {
            LazyColumn(
                modifier = modifier.testTag("chat_transcript"),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                itemsIndexed(rows, key = { index, row -> transcriptRowKey(row, index) }) { _, row ->
                    TranscriptRowView(row = row)
                }
            }
        }

        showProgress -> {
            Column(
                modifier = modifier
                    .fillMaxWidth()
                    .testTag("chat_progress"),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CircularProgressIndicator()
                Text(text = "Session running…")
            }
        }

        emptyMessage != null -> {
            Text(
                text = emptyMessage,
                style = MaterialTheme.typography.bodyLarge,
                modifier = modifier.testTag("chat_placeholder"),
            )
        }
    }
}

@Composable
private fun TranscriptRowView(row: TranscriptRow) {
    when (row) {
        is TranscriptUserRow -> {
            Text(
                text = row.text,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("transcript_user"),
            )
        }

        is TranscriptThinkingRow -> {
            Text(
                text = row.text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("transcript_thinking"),
            )
        }

        is TranscriptAssistantRow -> {
            Text(
                text = row.text,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("transcript_assistant"),
            )
        }

        is TranscriptToolRow -> {
            val statusLabel = when (row.status) {
                ToolCallStatus.Pending,
                ToolCallStatus.InProgress,
                -> "running"
                ToolCallStatus.Completed -> "completed"
                ToolCallStatus.Failed -> "failed"
            }
            Text(
                text = "${row.toolName} · $statusLabel",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("transcript_tool"),
            )
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

private fun transcriptRowKey(row: TranscriptRow, index: Int): String =
    when (row) {
        is TranscriptUserRow,
        is TranscriptThinkingRow,
        is TranscriptAssistantRow,
        -> "${row::class.simpleName}-${row.turnId}-$index"
        is TranscriptToolRow -> "tool-${row.toolCallId}"
        is TranscriptTurnStatusRow -> "turn-status-${row.turnId}-$index"
    }
