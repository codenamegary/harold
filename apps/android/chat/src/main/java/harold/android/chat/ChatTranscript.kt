package harold.android.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import harold.android.live.TranscriptAssistantRow
import harold.android.live.TranscriptRow
import harold.android.live.TranscriptThinkingRow
import harold.android.live.TranscriptToolRow
import harold.android.live.TranscriptUserRow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch

private const val TailScrollOffset = 1_000_000
private val TurnSpacing = 28.dp
private val RowSpacing = 12.dp

internal fun liveAssistantRowIndex(
    rows: List<TranscriptRow>,
    isRunning: Boolean,
): Int {
    if (!isRunning) {
        return -1
    }

    val turnId = rows.lastOrNull()?.turnId ?: return -1
    return rows.indexOfLast { row ->
        row is TranscriptAssistantRow && row.turnId == turnId
    }
}

internal fun liveThinkingRowIndex(
    rows: List<TranscriptRow>,
    isRunning: Boolean,
): Int {
    if (!isRunning) {
        return -1
    }

    val turnId = rows.lastOrNull()?.turnId ?: return -1
    val lastInTurn = rows.lastOrNull { row -> row.turnId == turnId } ?: return -1
    if (lastInTurn !is TranscriptThinkingRow) {
        return -1
    }
    return rows.indexOfLast { row ->
        row is TranscriptThinkingRow && row.turnId == turnId
    }
}

internal fun measuredTailSize(listState: LazyListState): Int? {
    val info = listState.layoutInfo
    val last = info.visibleItemsInfo.lastOrNull() ?: return null
    if (last.index != info.totalItemsCount - 1) {
        return null
    }

    return last.size
}

/** True while the tail is visible and within about one screen of the viewport bottom. */
internal fun isNearTranscriptTail(listState: LazyListState): Boolean {
    val info = listState.layoutInfo
    if (info.totalItemsCount == 0 || info.viewportSize.height == 0) {
        return true
    }
    val last = info.visibleItemsInfo.lastOrNull() ?: return true
    if (last.index != info.totalItemsCount - 1) {
        return false
    }

    val distance = info.viewportEndOffset - (last.offset + last.size)
    return distance <= info.viewportSize.height
}

internal fun transcriptBlockTopSpacing(
    block: TranscriptBlock,
    index: Int,
): Dp = when {
    index == 0 -> 0.dp
    block is TranscriptBlock.TurnHeader -> TurnSpacing
    else -> RowSpacing
}

private data class TranscriptScrollSignal(
    val scrolling: Boolean,
    val backward: Boolean,
)

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
    val scope = rememberCoroutineScope()
    val activity = deriveActivityStatus(
        rows = rows,
        isRunning = isRunning,
        hasPendingPermission = hasPendingPermission,
    )
    val showActivity = activity != null
    val streamingRowIndex = liveAssistantRowIndex(rows = rows, isRunning = isRunning)
    val thinkingRowIndex = liveThinkingRowIndex(rows = rows, isRunning = isRunning)
    var followLatest by remember { mutableStateOf(true) }
    var showJumpToLatest by remember { mutableStateOf(false) }
    val lastIndex = blocks.size - 1 + if (showActivity) 1 else 0

    // requestScrollToItem applies on the next measure pass. scrollToItem forces
    // a remeasure, which throws when the layoutInfo collector resumes mid-layout.
    LaunchedEffect(blocks.size, showActivity, activity?.label) {
        if (followLatest && lastIndex >= 0) {
            listState.requestScrollToItem(lastIndex, scrollOffset = TailScrollOffset)
        }
    }

    LaunchedEffect(listState) {
        snapshotFlow { measuredTailSize(listState) }
            .filterNotNull()
            .distinctUntilChanged()
            .collect {
                if (followLatest) {
                    val tailIndex = listState.layoutInfo.totalItemsCount - 1
                    if (tailIndex >= 0) {
                        listState.requestScrollToItem(tailIndex, scrollOffset = TailScrollOffset)
                    }
                }
            }
    }

    LaunchedEffect(listState, blocks.isEmpty()) {
        if (blocks.isEmpty()) {
            followLatest = true
            showJumpToLatest = false
        }
        snapshotFlow {
            TranscriptScrollSignal(
                scrolling = listState.isScrollInProgress,
                backward = listState.lastScrolledBackward,
            )
        }
            .distinctUntilChanged()
            .collect { signal ->
                if (signal.scrolling && signal.backward) {
                    followLatest = false
                    showJumpToLatest = blocks.isNotEmpty()
                } else if (!signal.scrolling) {
                    val near = isNearTranscriptTail(listState)
                    followLatest = near
                    showJumpToLatest = !near && blocks.isNotEmpty()
                }
            }
    }

    when {
        rows.isNotEmpty() || showActivity -> {
            Box(modifier = modifier.fillMaxSize()) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("chat_transcript"),
                ) {
                    itemsIndexed(
                        items = blocks,
                        key = { _, block -> transcriptBlockKey(block) },
                    ) { index, block ->
                        Box(
                            modifier = Modifier.padding(
                                top = transcriptBlockTopSpacing(block = block, index = index),
                            ),
                        ) {
                            when (block) {
                                is TranscriptBlock.TurnHeader -> {
                                    TranscriptTurnHeader(row = block.row)
                                }

                                is TranscriptBlock.ToolRun -> {
                                    ToolCallGroup(tools = block.tools)
                                }

                                is TranscriptBlock.Row -> {
                                    TranscriptBlockRow(
                                        row = block.row,
                                        index = block.index,
                                        streaming = block.index == streamingRowIndex,
                                        thinkingActive = block.index == thinkingRowIndex,
                                    )
                                }
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
                                    .padding(top = RowSpacing)
                                    .padding(vertical = 4.dp),
                            )
                        }
                    }
                }

                AnimatedVisibility(
                    visible = showJumpToLatest,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(16.dp),
                ) {
                    Surface(
                        onClick = {
                            followLatest = true
                            showJumpToLatest = false
                            if (lastIndex >= 0) {
                                scope.launch {
                                    listState.animateScrollToItem(lastIndex)
                                }
                            }
                        },
                        shape = RoundedCornerShape(50),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.testTag("jump_to_latest"),
                    ) {
                        Text(
                            text = "Jump to latest",
                            style = chatTextRoles().meta,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
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
    streaming: Boolean,
    thinkingActive: Boolean,
) {
    when (row) {
        is TranscriptUserRow -> {
            TranscriptTurnHeader(row = row)
        }

        is TranscriptThinkingRow -> {
            ThinkingSection(text = row.text, active = thinkingActive)
        }

        is TranscriptAssistantRow -> {
            MarkdownMessage(
                text = row.text,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp)
                    .testTag("transcript_assistant"),
                streaming = streaming,
            )
        }

        is TranscriptToolRow -> {
            ToolCallGroup(tools = listOf(row))
        }
    }
}

private fun transcriptBlockKey(block: TranscriptBlock): String =
    when (block) {
        is TranscriptBlock.ToolRun ->
            "tools-${block.startIndex}-${block.tools.firstOrNull()?.toolCallId ?: "empty"}"
        is TranscriptBlock.TurnHeader -> "turn-${block.row.turnId}"
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
