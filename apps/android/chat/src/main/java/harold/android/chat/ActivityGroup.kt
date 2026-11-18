package harold.android.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.live.TranscriptRow
import harold.android.live.TranscriptThinkingRow
import harold.android.live.TranscriptToolRow

/**
 * One uninterrupted stretch of thinking and tool calls. Collapsed by default.
 * The live run opens while the agent works and folds once the run is complete.
 */
@Composable
fun ActivityGroup(
    run: TranscriptBlock.ActivityRun,
    active: Boolean,
    modifier: Modifier = Modifier,
) {
    if (run.rows.isEmpty()) {
        return
    }

    var expanded by rememberSaveable(
        run.startIndex,
        run.rows.firstOrNull()?.turnId,
        active,
        run.hasFailure,
    ) {
        mutableStateOf(active || run.hasFailure)
    }
    val roles = chatTextRoles()

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .testTag("activity_group"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 12.dp, vertical = 10.dp)
                .semantics {
                    stateDescription = if (expanded) "Expanded" else "Collapsed"
                }
                .testTag("activity_group_summary"),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = if (expanded) "▾" else "▸",
                style = roles.meta,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = activitySummary(run = run, active = active),
                style = roles.meta,
                color = if (run.hasFailure) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f)
                    .testTag("activity_group_label"),
            )
            if (run.failedCount > 0) {
                Text(
                    text = "${run.failedCount} failed",
                    style = roles.meta,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("activity_group_failed"),
                )
            }
        }

        AnimatedVisibility(visible = expanded) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp)
                    .testTag("activity_group_body"),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                run.rows.forEach { row ->
                    when (row) {
                        is TranscriptThinkingRow -> {
                            ActivityThinkingBody(text = row.text)
                        }

                        is TranscriptToolRow -> {
                            ToolCallItem(tool = row)
                        }

                        else -> Unit
                    }
                }
            }
        }
    }
}

internal fun activitySummary(
    run: TranscriptBlock.ActivityRun,
    active: Boolean,
): String {
    val tools = run.tools
    val thinking = run.thinking

    return when {
        active && tools.any { tool -> isActiveToolStatus(tool.status) } -> "Using tools"
        active -> "Thinking..."
        tools.isEmpty() -> "Thinking"
        thinking.isEmpty() && tools.size == 1 -> "1 tool"
        thinking.isEmpty() -> "${tools.size} tools"
        tools.size == 1 -> "Thought, 1 tool"
        else -> "Thought, ${tools.size} tools"
    }
}

@Composable
private fun ActivityThinkingBody(text: String) {
    if (text.isBlank()) {
        return
    }

    Text(
        text = text,
        style = chatTextRoles().thinking,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .testTag("activity_group_thinking"),
    )
}
