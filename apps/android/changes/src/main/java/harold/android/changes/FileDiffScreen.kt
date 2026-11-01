package harold.android.changes

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import harold.android.contracts.GitDiffHunk
import harold.android.contracts.GitDiffLine
import harold.android.contracts.GitDiffLineKind
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitScope
import harold.android.ui.components.HaroldCard
import harold.android.ui.components.LoadingSkeletonList
import harold.android.ui.theme.DiffColors
import harold.android.ui.theme.diffColors

private val MinTouchTarget = 48.dp
private val GutterWidth = 54.dp
private val DiffLineHeight = 22.dp
private val CodeCharWidth = 7.3.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FileDiffScreen(
    uiState: FileDiffUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
) {
    val diff = uiState.diff
    val path = diff?.path ?: uiState.filePath
    val parentPath = parentDirectory(path)
    val backContentDescription = stringResource(R.string.file_diff_back_content_description)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text(
                            text = path.substringAfterLast('/'),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (parentPath.isNotEmpty()) {
                            LeadingEllipsisText(
                                text = parentPath,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontFamily = FontFamily.Monospace,
                                ),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MinTouchTarget)
                            .testTag("file_diff_back")
                            .semantics { contentDescription = backContentDescription },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                        )
                    }
                },
                actions = {
                    if (diff != null) {
                        Row(
                            modifier = Modifier.padding(end = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            StatusBadge(status = diff.status)
                            LineStats(
                                additions = uiState.additions,
                                deletions = uiState.deletions,
                                binary = diff.binary,
                                submodule = diff.submodule,
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .testTag("file_diff_screen"),
        ) {
            when {
                uiState.loading -> {
                    LoadingSkeletonList(
                        contentDescription = stringResource(R.string.file_diff_loading),
                        modifier = Modifier
                            .padding(16.dp)
                            .testTag("file_diff_loading")
                            .semantics { liveRegion = LiveRegionMode.Polite },
                        rows = 10,
                        rowHeight = 18.dp,
                    )
                }

                uiState.error != null || diff == null -> {
                    FileDiffErrorState(
                        message = uiState.error ?: stringResource(R.string.file_diff_error_title),
                        onRetry = onRetry,
                    )
                }

                diff.binary -> {
                    DiffNotice(
                        icon = Icons.Filled.Image,
                        title = stringResource(R.string.file_diff_binary_notice),
                        body = stringResource(R.string.file_diff_binary_body),
                        testTag = "file_diff_binary",
                        scope = uiState.scope,
                    )
                }

                diff.submodule -> {
                    DiffNotice(
                        icon = Icons.Filled.AccountTree,
                        title = stringResource(R.string.file_diff_submodule_notice),
                        body = stringResource(R.string.file_diff_submodule_body),
                        testTag = "file_diff_submodule",
                        scope = uiState.scope,
                    )
                }

                else -> {
                    DiffHunks(
                        diff = diff,
                        scope = uiState.scope,
                    )
                }
            }
        }
    }
}

@Composable
private fun DiffHunks(
    diff: GitFileDiff,
    scope: GitScope,
) {
    val colors = diffColors()
    val maxLineLength = remember(diff) {
        diff.hunks.flatMap { hunk -> hunk.lines }
            .maxOfOrNull { line -> line.text.length + 2 } ?: 0
    }
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val viewportWidth = maxWidth
        val codeViewportWidth = viewportWidth - GutterWidth
        val codeContentWidth = maxOf(
            codeViewportWidth,
            (maxLineLength * CodeCharWidth.value).dp,
            420.dp,
        )
        val horizontalScroll = rememberScrollState()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            DiffMetaBar(scope = scope)
            if (diff.hunks.isEmpty()) {
                Text(
                    text = stringResource(R.string.file_diff_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp)
                        .testTag("file_diff_empty"),
                    textAlign = TextAlign.Center,
                )
            }
            diff.hunks.forEachIndexed { index, hunk ->
                HunkHeader(hunk = hunk)
                Row(modifier = Modifier.fillMaxWidth()) {
                    DiffGutter(hunk = hunk, colors = colors)
                    Box(
                        modifier = Modifier
                            .width(codeViewportWidth)
                            .horizontalScroll(horizontalScroll)
                            .testTag("diff_horizontal_scroll_$index"),
                    ) {
                        Column(modifier = Modifier.width(codeContentWidth)) {
                            hunk.lines.forEach { line ->
                                DiffCodeLine(line = line, colors = colors)
                            }
                        }
                    }
                }
            }
            if (diff.truncated) {
                TruncationNotice()
            }
        }
    }
}

@Composable
private fun DiffMetaBar(scope: GitScope) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = stringResource(
                if (scope == GitScope.Uncommitted) {
                    R.string.file_diff_scope_uncommitted
                } else {
                    R.string.file_diff_scope_branch
                },
            ),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
        )
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 0.5.dp)
}

@Composable
private fun HunkHeader(hunk: GitDiffHunk) {
    Text(
        text = hunk.header,
        style = MaterialTheme.typography.labelSmall.copy(
            fontFamily = FontFamily.Monospace,
        ),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun DiffGutter(
    hunk: GitDiffHunk,
    colors: DiffColors,
) {
    Column(
        modifier = Modifier
            .width(GutterWidth)
            .background(colors.gutterBackground)
            .testTag("diff_gutter"),
    ) {
        hunk.lines.forEach { line ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(DiffLineHeight)
                    .background(lineBackground(line, colors)),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = line.oldLineNumber?.toString().orEmpty(),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 10.sp,
                    ),
                    color = colors.gutterText.copy(alpha = 0.72f),
                    textAlign = TextAlign.End,
                    maxLines = 1,
                    modifier = Modifier.width(24.dp),
                )
                Text(
                    text = line.newLineNumber?.toString().orEmpty(),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 10.sp,
                    ),
                    color = colors.gutterText.copy(alpha = 0.72f),
                    textAlign = TextAlign.End,
                    maxLines = 1,
                    modifier = Modifier.width(26.dp),
                )
                Spacer(modifier = Modifier.width(4.dp))
            }
        }
    }
}

@Composable
private fun DiffCodeLine(
    line: GitDiffLine,
    colors: DiffColors,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(DiffLineHeight)
            .background(lineBackground(line.kind, colors))
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = when (line.kind) {
                GitDiffLineKind.Addition -> "+"
                GitDiffLineKind.Deletion -> "-"
                GitDiffLineKind.Context -> " "
            },
            style = MaterialTheme.typography.labelSmall.copy(
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
            ),
            color = lineTextColor(line.kind, colors),
            modifier = Modifier.width(10.dp),
        )
        Text(
            text = line.text.ifEmpty { " " },
            style = MaterialTheme.typography.labelSmall.copy(
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            ),
            color = lineTextColor(line.kind, colors),
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Clip,
        )
    }
}

@Composable
private fun lineBackground(
    line: GitDiffLine,
    colors: DiffColors,
): Color = lineBackground(line.kind, colors)

@Composable
private fun lineBackground(
    kind: GitDiffLineKind,
    colors: DiffColors,
): Color = when (kind) {
    GitDiffLineKind.Addition -> colors.additionBackground
    GitDiffLineKind.Deletion -> colors.deletionBackground
    GitDiffLineKind.Context -> Color.Transparent
}

@Composable
private fun lineTextColor(
    kind: GitDiffLineKind,
    colors: DiffColors,
): Color = when (kind) {
    GitDiffLineKind.Addition -> colors.additionText
    GitDiffLineKind.Deletion -> colors.deletionText
    GitDiffLineKind.Context -> colors.contextText.copy(alpha = 0.8f)
}

@Composable
private fun TruncationNotice() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .testTag("file_diff_truncated"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.ContentCut,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.tertiary,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = stringResource(R.string.file_diff_truncated),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.tertiary,
        )
    }
}

@Composable
private fun DiffNotice(
    icon: ImageVector,
    title: String,
    body: String,
    testTag: String,
    scope: GitScope,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
    ) {
        DiffMetaBar(scope = scope)
        HaroldCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .testTag(testTag),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(22.dp),
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = body,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun FileDiffErrorState(
    message: String,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp)
            .testTag("file_diff_error")
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
            text = stringResource(R.string.file_diff_error_title),
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
                .testTag("file_diff_retry"),
        ) {
            Text(text = stringResource(R.string.file_diff_retry))
        }
    }
}
