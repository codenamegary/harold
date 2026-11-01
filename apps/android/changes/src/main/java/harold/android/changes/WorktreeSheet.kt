package harold.android.changes

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.contracts.GitWorktree

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun WorktreeSheet(
    worktrees: List<GitWorktree>,
    selectedWorktreePath: String,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier.testTag("changes_worktree_sheet"),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            worktrees.forEach { worktree ->
                WorktreeRow(
                    worktree = worktree,
                    selected = worktree.path == selectedWorktreePath,
                    onClick = { onSelect(worktree.path) },
                )
            }
        }
    }
}

@Composable
private fun WorktreeRow(
    worktree: GitWorktree,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val branch = worktree.branch ?: "detached @ ${worktree.headSha.take(7)}"
    val dirtyCount = worktree.dirtyFileCount
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("changes_worktree_row_${worktree.branch ?: worktree.headSha}"),
        shape = RoundedCornerShape(14.dp),
        border = if (selected) {
            BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.55f))
        } else {
            null
        },
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.07f)
            } else {
                MaterialTheme.colorScheme.surfaceContainerHigh
            },
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = branch,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                LeadingEllipsisText(
                    text = worktree.path,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = when {
                            dirtyCount == null -> "—"
                            dirtyCount == 0 -> stringResource(R.string.changes_worktree_clean)
                            else -> pluralStringResource(
                                R.plurals.changes_dirty_file_count,
                                dirtyCount,
                                dirtyCount,
                            )
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = when {
                            dirtyCount == null -> MaterialTheme.colorScheme.onSurfaceVariant
                            dirtyCount == 0 -> MaterialTheme.colorScheme.onSurfaceVariant
                            else -> MaterialTheme.colorScheme.tertiary
                        },
                    )
                    if (worktree.isMain) {
                        Pill(
                            label = stringResource(R.string.changes_worktree_main),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    if (worktree.isCurrent) {
                        Pill(
                            label = stringResource(R.string.changes_worktree_current),
                            color = MaterialTheme.colorScheme.secondary,
                        )
                    }
                    if (selected && !worktree.isCurrent) {
                        Pill(
                            label = stringResource(R.string.changes_worktree_viewing),
                            color = MaterialTheme.colorScheme.secondary,
                        )
                    }
                }
            }

            Icon(
                imageVector = if (selected) {
                    Icons.Filled.Check
                } else {
                    Icons.Filled.ChevronRight
                },
                contentDescription = null,
                tint = if (selected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
