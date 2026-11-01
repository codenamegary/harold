package harold.android.changes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.UnfoldLess
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import harold.android.contracts.GitChangedFile
import harold.android.contracts.GitScope
import harold.android.ui.components.LoadingSkeletonList
import harold.android.ui.theme.diffColors

private val MinTouchTarget = 48.dp
private val TreeIndent = 12.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangesScreen(
    uiState: ChangesUiState,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onWorktreeClick: () -> Unit,
    onWorktreeSelect: (String) -> Unit,
    onDismissWorktreeSheet: () -> Unit,
    onScopeSelect: (GitScope) -> Unit,
    onToggleFolder: (String) -> Unit,
    onToggleAllFolders: (Set<String>) -> Unit,
    onFileClick: (GitChangedFile) -> Unit,
) {
    val tree = remember(uiState.files) { buildFileTree(uiState.files) }
    val allFolders = remember(tree) { folderKeys(tree) }
    val rows = remember(tree, uiState.collapsedFolders) {
        flattenFileTree(tree, uiState.collapsedFolders)
    }
    val allCollapsed = allFolders.isNotEmpty() &&
        uiState.collapsedFolders.containsAll(allFolders)
    val totals = uiState.activeGroup?.changes?.totals
    val showBranchScope = uiState.branchScopeAvailable
    val listState = rememberLazyListState()
    val lastListKey = rememberSaveable { mutableStateOf("") }
    LaunchedEffect(uiState.scope, uiState.selectedWorktreePath) {
        val key = "${uiState.selectedWorktreePath}|${uiState.scope}"
        if (key != lastListKey.value) {
            lastListKey.value = key
            listState.scrollToItem(0)
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            ChangesTopBar(
                allCollapsed = allCollapsed,
                onBack = onBack,
                onRefresh = onRefresh,
                onToggleAllFolders = { onToggleAllFolders(allFolders) },
            )
        },
        bottomBar = {
            if (uiState.repository != null) {
                WorktreeFooter(
                    uiState = uiState,
                    onWorktreeClick = onWorktreeClick,
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .testTag("changes_screen"),
        ) {
            ScopeHeader(
                uiState = uiState,
                showBranchScope = showBranchScope,
                fileCount = totals?.files ?: 0,
                additions = totals?.additions ?: 0,
                deletions = totals?.deletions ?: 0,
                onScopeSelect = onScopeSelect,
            )

            Box(modifier = Modifier.weight(1f)) {
                when {
                    uiState.loading && uiState.activeGroup == null -> {
                        LoadingSkeletonList(
                            contentDescription = stringResource(R.string.changes_loading),
                            modifier = Modifier
                                .padding(16.dp)
                                .testTag("changes_loading")
                                .semantics {
                                    liveRegion = LiveRegionMode.Polite
                                },
                            rows = 8,
                            rowHeight = 54.dp,
                        )
                    }

                    uiState.error != null && uiState.activeGroup == null -> {
                        ChangesErrorState(
                            message = uiState.error,
                            onRetry = onRetry,
                        )
                    }

                    else -> {
                        PullToRefreshBox(
                            isRefreshing = uiState.refreshing,
                            onRefresh = onRefresh,
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            LazyColumn(
                                state = listState,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .testTag("changes_list"),
                                contentPadding = PaddingValues(bottom = 32.dp),
                            ) {
                                if (uiState.error != null) {
                                    item(key = "inline-error") {
                                        InlineError(
                                            message = uiState.error,
                                            onRetry = onRetry,
                                        )
                                    }
                                }
                                if (rows.isEmpty()) {
                                    item(key = "empty") {
                                        ChangesEmptyState(
                                            scope = uiState.scope,
                                            branchLabel = uiState.baseBranchLabel,
                                            branchAvailable = showBranchScope,
                                            onScopeSelect = onScopeSelect,
                                        )
                                    }
                                } else {
                                    items(rows, key = { node -> node.path }) { node ->
                                        if (node.folder) {
                                            FolderRow(
                                                node = node,
                                                expanded = node.path !in uiState.collapsedFolders,
                                                onClick = { onToggleFolder(node.path) },
                                            )
                                        } else {
                                            FileRow(
                                                node = node,
                                                onClick = { node.file?.let(onFileClick) },
                                            )
                                        }
                                        HorizontalDivider(
                                            color = MaterialTheme.colorScheme.outlineVariant,
                                            thickness = 0.5.dp,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (uiState.worktreeSheetVisible) {
        WorktreeSheet(
            worktrees = uiState.worktrees,
            selectedWorktreePath = uiState.selectedWorktreePath,
            onDismiss = onDismissWorktreeSheet,
            onSelect = onWorktreeSelect,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChangesTopBar(
    allCollapsed: Boolean,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onToggleAllFolders: () -> Unit,
) {
    val backContentDescription = stringResource(R.string.changes_back_content_description)
    val refreshContentDescription = stringResource(R.string.changes_refresh_content_description)
    val collapseDescription = stringResource(
        if (allCollapsed) {
            R.string.changes_expand_all_content_description
        } else {
            R.string.changes_collapse_all_content_description
        },
    )

    TopAppBar(
        title = {
            Text(
                text = stringResource(R.string.changes_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
        },
        navigationIcon = {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .defaultMinSize(minHeight = MinTouchTarget)
                    .testTag("changes_back")
                    .semantics { contentDescription = backContentDescription },
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                )
            }
        },
        actions = {
            IconButton(
                onClick = onToggleAllFolders,
                modifier = Modifier
                    .defaultMinSize(minHeight = MinTouchTarget)
                    .testTag("changes_collapse_all")
                    .semantics { contentDescription = collapseDescription },
            ) {
                Icon(
                    imageVector = if (allCollapsed) {
                        Icons.Filled.UnfoldMore
                    } else {
                        Icons.Filled.UnfoldLess
                    },
                    contentDescription = null,
                )
            }
            IconButton(
                onClick = onRefresh,
                modifier = Modifier
                    .defaultMinSize(minHeight = MinTouchTarget)
                    .testTag("changes_refresh")
                    .semantics { contentDescription = refreshContentDescription },
            ) {
                Icon(
                    imageVector = Icons.Filled.Refresh,
                    contentDescription = null,
                )
            }
        },
    )
}

@Composable
private fun WorktreeFooter(
    uiState: ChangesUiState,
    onWorktreeClick: () -> Unit,
) {
    val worktree = uiState.selectedWorktree
    val branch = worktree?.branch ?: uiState.repository?.currentBranch ?: "detached"
    val path = worktree?.path ?: uiState.selectedWorktreePath
    val dirtyCount = worktree?.dirtyFileCount
    val worktreeDescription = stringResource(
        R.string.changes_worktree_control_content_description,
        branch,
    )
    val dirtyLabel = when {
        dirtyCount == null -> null
        dirtyCount == 0 -> stringResource(R.string.changes_worktree_clean)
        else -> stringResource(R.string.changes_worktree_dirty_short, dirtyCount)
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .navigationBarsPadding(),
    ) {
        HorizontalDivider(
            color = MaterialTheme.colorScheme.outlineVariant,
            thickness = 0.5.dp,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onWorktreeClick)
                .padding(horizontal = 16.dp, vertical = 10.dp)
                .testTag("changes_worktree_control")
                .semantics { contentDescription = worktreeDescription },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = stringResource(R.string.changes_worktree_footer_label),
                        style = MaterialTheme.typography.labelSmall.copy(
                            letterSpacing = 0.8.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (worktree?.isMain == true) {
                        Pill(
                            label = stringResource(R.string.changes_worktree_main),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    if (dirtyLabel != null) {
                        Text(
                            text = dirtyLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = if ((dirtyCount ?: 0) > 0) {
                                MaterialTheme.colorScheme.tertiary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
                Text(
                    text = branch,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (path.isNotEmpty()) {
                    LeadingEllipsisText(
                        text = path,
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontFamily = FontFamily.Monospace,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            Icon(
                imageVector = Icons.Filled.KeyboardArrowUp,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun ScopeHeader(
    uiState: ChangesUiState,
    showBranchScope: Boolean,
    fileCount: Int,
    additions: Int,
    deletions: Int,
    onScopeSelect: (GitScope) -> Unit,
) {
    val uncommittedCount = uiState.uncommitted?.changes?.totals?.files ?: 0
    val branchCount = uiState.branch?.changes?.totals?.files ?: 0
    val filesLabel = pluralStringResource(
        R.plurals.changes_file_count,
        fileCount,
        fileCount,
    )
    val diff = diffColors()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(MinTouchTarget)
                .clip(RoundedCornerShape(999.dp))
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.outline,
                    shape = RoundedCornerShape(999.dp),
                ),
        ) {
            ScopeSegment(
                selected = uiState.scope == GitScope.Uncommitted,
                label = "${stringResource(R.string.changes_scope_uncommitted)} ($uncommittedCount)",
                onClick = { onScopeSelect(GitScope.Uncommitted) },
                modifier = Modifier
                    .weight(1f)
                    .testTag("changes_segment_uncommitted"),
            )
            if (showBranchScope) {
                Box(
                    modifier = Modifier
                        .width(0.5.dp)
                        .fillMaxHeight()
                        .background(MaterialTheme.colorScheme.outline),
                )
                ScopeSegment(
                    selected = uiState.scope == GitScope.Branch,
                    label = "${stringResource(R.string.changes_scope_against, uiState.baseBranchLabel)} ($branchCount)",
                    onClick = { onScopeSelect(GitScope.Branch) },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("changes_segment_branch"),
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("changes_summary"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = filesLabel,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = "  ·  ",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            LineStats(
                additions = additions,
                deletions = deletions,
                binary = false,
                submodule = false,
            )
        }

        if (additions + deletions > 0) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                if (additions > 0) {
                    Box(
                        modifier = Modifier
                            .weight(additions.toFloat())
                            .fillMaxHeight()
                            .background(diff.additionText.copy(alpha = 0.75f)),
                    )
                }
                if (deletions > 0) {
                    Box(
                        modifier = Modifier
                            .weight(deletions.toFloat())
                            .fillMaxHeight()
                            .background(diff.deletionText.copy(alpha = 0.75f)),
                    )
                }
            }
        }
    }
}

@Composable
private fun ScopeSegment(
    selected: Boolean,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .background(
                if (selected) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                } else {
                    Color.Transparent
                },
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 10.dp),
        )
    }
}

@Composable
private fun FolderRow(
    node: FileTreeNode,
    expanded: Boolean,
    onClick: () -> Unit,
) {
    val fileLabel = pluralStringResource(
        R.plurals.changes_file_count,
        node.fileCount,
        node.fileCount,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 52.dp)
            .clickable(onClick = onClick)
            .testTag("changes_folder_${node.path}")
            .padding(
                start = 12.dp + (TreeIndent * node.depth),
                end = 16.dp,
                top = 9.dp,
                bottom = 9.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (expanded) {
                Icons.Filled.KeyboardArrowDown
            } else {
                Icons.AutoMirrored.Filled.KeyboardArrowRight
            },
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(2.dp))
        Icon(
            imageVector = Icons.Filled.Folder,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.72f),
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = compactFolderName(node.name),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = fileLabel,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.width(10.dp))
        LineStats(
            additions = node.additions,
            deletions = node.deletions,
            binary = false,
            submodule = false,
        )
    }
}

private fun compactFolderName(name: String): String {
    val segments = name.split('/')
    return if (segments.size <= 4) {
        name
    } else {
        val head = segments.take(2).joinToString("/")
        val tail = segments.takeLast(2).joinToString("/")
        "$head/…/$tail"
    }
}

@Composable
private fun FileRow(
    node: FileTreeNode,
    onClick: () -> Unit,
) {
    val file = node.file ?: return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 54.dp)
            .clickable(onClick = onClick)
            .testTag("changes_file_${node.path}")
            .padding(
                start = 34.dp + (TreeIndent * node.depth),
                end = 16.dp,
                top = 9.dp,
                bottom = 9.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatusBadge(status = file.status)
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = node.name,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (file.oldPath != null) {
                Text(
                    text = "from ${file.oldPath}",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(modifier = Modifier.width(10.dp))
        LineStats(
            additions = file.additions,
            deletions = file.deletions,
            binary = file.binary,
            submodule = file.submodule,
        )
    }
}

@Composable
private fun ChangesEmptyState(
    scope: GitScope,
    branchLabel: String,
    branchAvailable: Boolean,
    onScopeSelect: (GitScope) -> Unit,
) {
    val title = if (scope == GitScope.Branch) {
        stringResource(R.string.changes_empty_branch_title, branchLabel)
    } else {
        stringResource(R.string.changes_empty_uncommitted_title)
    }
    val body = if (scope == GitScope.Branch) {
        stringResource(R.string.changes_empty_branch_body)
    } else if (branchAvailable) {
        stringResource(R.string.changes_empty_uncommitted_body, branchLabel)
    } else {
        stringResource(R.string.changes_empty_clean_body)
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 40.dp, vertical = 64.dp)
            .testTag("changes_empty")
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (scope == GitScope.Branch) {
                    Icons.AutoMirrored.Filled.CompareArrows
                } else {
                    Icons.Filled.CheckCircle
                },
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp),
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (scope == GitScope.Uncommitted && branchAvailable) {
            Button(
                onClick = { onScopeSelect(GitScope.Branch) },
                modifier = Modifier
                    .defaultMinSize(minHeight = MinTouchTarget)
                    .testTag("changes_empty_branch_link"),
            ) {
                Text(text = stringResource(R.string.changes_scope_against, branchLabel))
            }
        }
    }
}

@Composable
private fun ChangesErrorState(
    message: String,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp)
            .testTag("changes_error")
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.ErrorOutline,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(40.dp),
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.changes_error_title),
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = onRetry,
            modifier = Modifier
                .defaultMinSize(minHeight = MinTouchTarget)
                .testTag("changes_retry"),
        ) {
            Text(text = stringResource(R.string.changes_retry))
        }
    }
}

@Composable
private fun InlineError(
    message: String,
    onRetry: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.ErrorOutline,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = stringResource(R.string.changes_retry),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .clickable(onClick = onRetry)
                .padding(horizontal = 6.dp, vertical = 4.dp),
        )
    }
}
