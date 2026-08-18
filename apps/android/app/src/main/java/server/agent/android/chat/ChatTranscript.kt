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
    hasPendingPermission: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val blocks = groupTranscriptRows(rows)
    val listState = rememberLazyListState()
    val activity = deriveActivityStatus(
        rows = rows,
        isRunning = isRunning,
        hasPendingPermission = hasPendingPermission,
    )
    val showActivity = activity != null

    LaunchedEffect(blocks.size, showActivity, rows, activity?.label) {
        val lastIndex = blocks.size - 1 + if (showActivity) 1 else 0
        if (lastIndex >= 0) {
            listState.animateScrollToItem(lastIndex)
        }
    }

    when {
        rows.isNotEmpty() || showActivity -> {
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
                            )
                        }
                    }
                }

                if (activity != null) {
                    item(key = "activity-status") {
                        ActivityStatusLine(
                            label = activity.label,
                            subtitle = activity.subtitle,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                        )
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
            ThinkingSection(text = row.text)
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
            ToolCallGroup(tools = listOf(row))
        }
    }
}

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
    }
