package harold.android.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind
import harold.android.live.TranscriptToolRow

private val DetailMaxHeight = 240.dp
private val GenericToolNames = setOf(
    "read",
    "read_file",
    "readfile",
    "view",
    "cat",
    "edit",
    "write",
    "write_file",
    "patch",
    "shell",
    "bash",
    "exec",
    "execute",
    "run",
    "terminal",
    "grep",
    "search",
    "glob",
    "find",
    "list",
    "ls",
)

/**
 * One uninterrupted tool run. Completed calls fold into a single summary; active and failed
 * calls stay visible. The run is one container, never a border per item.
 */
@Composable
fun ToolCallGroup(
    tools: List<TranscriptToolRow>,
    modifier: Modifier = Modifier,
) {
    if (tools.isEmpty()) {
        return
    }

    val completed = tools.filter { tool -> tool.status == ToolCallStatus.Completed }
    val completedKey = "completed-${completed.firstOrNull()?.toolCallId ?: tools.first().toolCallId}"
    var completedExpanded by rememberSaveable(completedKey) { mutableStateOf(false) }
    var summaryRendered = false

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .testTag("tool_call_run"),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        tools.forEach { tool ->
            if (tool.status == ToolCallStatus.Completed) {
                if (!summaryRendered) {
                    summaryRendered = true
                    CompletedToolsSummary(
                        count = completed.size,
                        expanded = completedExpanded,
                        onToggle = { completedExpanded = !completedExpanded },
                    )
                    AnimatedVisibility(visible = completedExpanded) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            completed.forEach { completedTool ->
                                ToolCallItem(tool = completedTool)
                            }
                        }
                    }
                }
            } else {
                ToolCallItem(tool = tool)
            }
        }
    }
}

@Composable
private fun CompletedToolsSummary(
    count: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .testTag("tool_call_group_summary"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = if (expanded) "▾" else "▸",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = chatTextRoles().meta,
        )
        Text(
            text = "$count completed",
            style = chatTextRoles().meta,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.testTag("completed_tools_summary"),
        )
    }
}

@Composable
private fun ToolCallItem(tool: TranscriptToolRow) {
    val failed = tool.status == ToolCallStatus.Failed
    var expanded by rememberSaveable(tool.toolCallId, failed) { mutableStateOf(failed) }
    val roles = chatTextRoles()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("tool_call_item"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .testTag("tool_call_row"),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ToolStatusDot(status = tool.status)
            Text(
                text = friendlyToolLabel(tool),
                style = roles.meta,
                color = if (failed) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f)
                    .testTag("tool_call_label"),
            )
            Text(
                text = if (expanded) "▾" else "▸",
                style = roles.meta,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        AnimatedVisibility(visible = expanded) {
            ToolCallDetail(tool = tool)
        }
    }
}

@Composable
private fun ToolStatusDot(status: ToolCallStatus) {
    val color = when (status) {
        ToolCallStatus.Pending,
        ToolCallStatus.InProgress,
        -> MaterialTheme.colorScheme.primary
        ToolCallStatus.Completed -> MaterialTheme.colorScheme.onSurfaceVariant
        ToolCallStatus.Failed -> MaterialTheme.colorScheme.error
    }
    Box(
        modifier = Modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(color)
            .semantics { contentDescription = toolStatusDescription(status) }
            .testTag("tool_status_dot"),
    )
}

@Composable
private fun ToolCallDetail(tool: TranscriptToolRow) {
    var showAll by rememberSaveable(tool.toolCallId, "detail") { mutableStateOf(false) }
    var truncated by remember(tool.toolCallId) { mutableStateOf(false) }
    val body = toolDetailBody(tool)
    val roles = chatTextRoles()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 28.dp, end = 12.dp, bottom = 10.dp)
            .testTag("tool_call_detail"),
    ) {
        Text(
            text = body,
            style = roles.meta,
            color = if (tool.status == ToolCallStatus.Failed) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurface
            },
            maxLines = if (showAll) Int.MAX_VALUE else 12,
            overflow = TextOverflow.Ellipsis,
            onTextLayout = { result ->
                if (!showAll) {
                    truncated = result.hasVisualOverflow
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = if (showAll) Dp.Unspecified else DetailMaxHeight)
                .clipToBounds()
                .testTag("tool_call_item_body"),
        )

        if (truncated || showAll || body.length > 600) {
            TextButton(
                onClick = { showAll = !showAll },
                modifier = Modifier.testTag("tool_detail_show_all"),
            ) {
                Text(
                    text = if (showAll) "Show less" else "Show all",
                    style = roles.meta,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

internal fun isActiveToolStatus(status: ToolCallStatus): Boolean =
    status == ToolCallStatus.Pending || status == ToolCallStatus.InProgress

internal fun toolStatusDescription(status: ToolCallStatus): String =
    when (status) {
        ToolCallStatus.Pending,
        ToolCallStatus.InProgress,
        -> "Running"
        ToolCallStatus.Completed -> "Completed"
        ToolCallStatus.Failed -> "Failed"
    }

/** Friendly row headline, e.g. `Read ChatTranscript.kt`, `Run bun test`, `Edit Theme.kt`. */
internal fun friendlyToolLabel(tool: TranscriptToolRow): String {
    val verb = friendlyToolVerb(tool)
    val target = toolTarget(tool)
    if (target.isEmpty()) {
        return verb
    }
    if (target.lowercase().startsWith(verb.lowercase())) {
        return target
    }
    return "$verb $target"
}

internal fun friendlyToolVerb(tool: TranscriptToolRow): String {
    val tokens = tool.toolName.lowercase().split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }
    return when {
        tokens.any { it in setOf("grep", "search", "find", "glob") } -> "Search"
        tokens.any { it in setOf("read", "view", "cat") } -> "Read"
        tokens.any { it in setOf("edit", "write", "patch", "replace") } -> "Edit"
        tokens.any { it in setOf("shell", "bash", "exec", "execute", "run", "terminal") } -> "Run"
        else -> when (tool.toolKind) {
            ToolKind.Read -> "Read"
            ToolKind.Edit -> "Edit"
            ToolKind.Execute -> "Run"
        }
    }
}

internal fun toolTarget(tool: TranscriptToolRow): String {
    val detailLine = tool.detail
        ?.lineSequence()
        ?.map { line -> line.trim() }
        ?.firstOrNull { line -> line.isNotEmpty() }
    if (!detailLine.isNullOrEmpty()) {
        return truncateLabel(compactTarget(detailLine), 80)
    }

    val name = tool.toolName.trim().trim('`').lineSequence().firstOrNull()?.trim().orEmpty()
    if (name.isEmpty() || name.lowercase() in GenericToolNames) {
        return ""
    }
    return truncateLabel(name, 80)
}

internal fun toolDetailBody(tool: TranscriptToolRow): String {
    val detail = tool.detail?.trim()
    return if (detail.isNullOrEmpty()) tool.toolName.trim() else detail
}

private fun compactTarget(value: String): String =
    if (!value.contains(' ') && value.contains('/')) {
        value.substringAfterLast('/')
    } else {
        value
    }

private fun truncateLabel(value: String, maxChars: Int): String =
    if (value.length <= maxChars) value else "${value.take(maxChars - 1)}…"
