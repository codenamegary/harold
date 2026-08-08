package server.agent.android.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.border
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import server.agent.android.contracts.ToolCallStatus

@Composable
fun ToolCallGroup(
    tools: List<TranscriptToolRow>,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(8.dp)
    val borderColor = MaterialTheme.colorScheme.outlineVariant
    val activeCount = tools.count { isActiveToolStatus(it.status) }
    val summary = if (activeCount > 0) {
        "${toolCallLabel(tools.size)} · $activeCount running"
    } else {
        toolCallLabel(tools.size)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .border(width = 1.dp, color = borderColor, shape = shape)
            .testTag("tool_call_group"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 12.dp, vertical = 10.dp)
                .testTag("tool_call_group_summary"),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = if (expanded) "▾" else "▸",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = summary,
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        AnimatedVisibility(visible = expanded) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                tools.forEach { tool ->
                    ToolCallItem(tool = tool)
                }
            }
        }
    }
}

@Composable
private fun ToolCallItem(tool: TranscriptToolRow) {
    var expanded by remember(tool.toolCallId) { mutableStateOf(false) }
    val borderColor = MaterialTheme.colorScheme.outlineVariant
    val statusLabel = toolStatusLabel(tool.status)
    val summary = "${shortToolLabel(tool)} · $statusLabel"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(width = 1.dp, color = borderColor.copy(alpha = 0.8f), shape = RoundedCornerShape(6.dp))
            .testTag("tool_call_item"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = if (expanded) "▾" else "▸",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = summary,
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }

        AnimatedVisibility(visible = expanded) {
            Text(
                text = toolDetailBody(tool),
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 8.dp)
                    .testTag("tool_call_item_body"),
            )
        }
    }
}

internal fun toolCallLabel(count: Int): String =
    if (count == 1) "1 tool call" else "$count tool calls"

internal fun isActiveToolStatus(status: ToolCallStatus): Boolean =
    status == ToolCallStatus.Pending || status == ToolCallStatus.InProgress

internal fun toolStatusLabel(status: ToolCallStatus): String =
    when (status) {
        ToolCallStatus.Pending -> "pending"
        ToolCallStatus.InProgress -> "in_progress"
        ToolCallStatus.Completed -> "completed"
        ToolCallStatus.Failed -> "failed"
    }

internal fun shortToolLabel(tool: TranscriptToolRow): String {
    val name = tool.toolName.trim()
    if (name.startsWith("`")) {
        val firstLine = name.trimStart('`').lineSequence().firstOrNull()?.trim().orEmpty()
        return truncateLabel(firstLine.ifEmpty { name }, 72)
    }

    val detailLine = tool.detail?.lineSequence()?.firstOrNull()?.trim()
    if (!detailLine.isNullOrEmpty()) {
        return "$name · ${truncateLabel(detailLine, 56)}"
    }

    return name
}

internal fun toolDetailBody(tool: TranscriptToolRow): String {
    val parts = mutableListOf(tool.toolName.trim())
    val detail = tool.detail?.trim()
    if (!detail.isNullOrEmpty()) {
        parts.add(detail)
    }
    parts.add("status: ${toolStatusLabel(tool.status)}")
    return parts.joinToString("\n\n")
}

private fun truncateLabel(value: String, maxChars: Int): String =
    if (value.length <= maxChars) value else "${value.take(maxChars - 1)}…"
