package harold.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.contracts.FilesystemDirectory
import harold.android.design.R

private val MIN_TOUCH_TARGET = 48.dp
private val FOLDER_LIST_MAX_HEIGHT = 240.dp

/**
 * Shared remote folder browser. The caller owns loading and selection state;
 * this composable only renders it and reports taps. Test tags are built from
 * [testTagPrefix] so each screen keeps stable, distinct selectors.
 */
@Composable
fun RemoteFolderBrowser(
    path: String,
    parent: String?,
    folders: List<FilesystemDirectory>,
    loading: Boolean,
    error: String?,
    enabled: Boolean,
    query: String,
    selectedPath: String?,
    testTagPrefix: String,
    modifier: Modifier = Modifier,
    showNewFolder: Boolean = true,
    onOpenFolder: (String) -> Unit,
    onUp: () -> Unit,
    onQueryChanged: (String) -> Unit,
    onUseCurrent: () -> Unit,
    onNewFolder: () -> Unit = {},
) {
    HaroldCard(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = stringResource(R.string.harold_remote_browser_path),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface,
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AgentButton(
                        onClick = onUp,
                        enabled = enabled && parent != null,
                        variant = AgentButtonVariant.Secondary,
                        size = AgentButtonSize.Small,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                        modifier = Modifier.testTag("${testTagPrefix}_browser_up"),
                    ) {
                        Text(text = stringResource(R.string.harold_remote_browser_up))
                    }
                    if (showNewFolder) {
                        AgentButton(
                            onClick = onNewFolder,
                            enabled = enabled && path.isNotEmpty(),
                            variant = AgentButtonVariant.Frosted,
                            size = AgentButtonSize.Small,
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Filled.CreateNewFolder,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                            },
                            modifier = Modifier.testTag("${testTagPrefix}_new_folder"),
                        ) {
                            Text(text = stringResource(R.string.harold_remote_browser_new_folder))
                        }
                    }
                }
            }

            Surface(
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.6f),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.FolderOpen,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = path.ifEmpty { "—" },
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag("${testTagPrefix}_browser_path"),
                    )
                }
            }

            when {
                loading -> {
                    LoadingSkeletonList(
                        contentDescription = stringResource(R.string.harold_remote_browser_loading),
                        rows = 3,
                        rowHeight = 52.dp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("${testTagPrefix}_folders_loading"),
                    )
                }

                error != null -> {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.35f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.ErrorOutline,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(
                                text = error,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.testTag("${testTagPrefix}_browser_error"),
                            )
                        }
                    }
                }

                else -> {
                    OutlinedTextField(
                        value = query,
                        onValueChange = onQueryChanged,
                        enabled = enabled,
                        label = { Text(text = stringResource(R.string.harold_remote_browser_filter)) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.Search,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        trailingIcon = if (query.isNotEmpty()) {
                            {
                                IconButton(onClick = { onQueryChanged("") }) {
                                    Icon(
                                        imageVector = Icons.Filled.Clear,
                                        contentDescription = stringResource(R.string.harold_remote_browser_clear_search),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        } else {
                            null
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("${testTagPrefix}_folder_search"),
                    )

                    val needle = query.trim()
                    val filtered = if (needle.isEmpty()) {
                        folders
                    } else {
                        folders.filter { folder ->
                            folder.name.contains(needle, ignoreCase = true) ||
                                folder.path.contains(needle, ignoreCase = true)
                        }
                    }

                    if (folders.isEmpty()) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceContainerLowest,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = stringResource(R.string.harold_remote_browser_empty),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier
                                    .padding(16.dp)
                                    .testTag("${testTagPrefix}_folders_empty"),
                            )
                        }
                    } else if (filtered.isEmpty()) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceContainerLowest,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = stringResource(R.string.harold_remote_browser_no_match),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier
                                    .padding(16.dp)
                                    .testTag("${testTagPrefix}_folder_search_empty"),
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = FOLDER_LIST_MAX_HEIGHT)
                                .clip(RoundedCornerShape(10.dp))
                                .testTag("${testTagPrefix}_folder_list"),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            items(filtered, key = { folder -> folder.path }) { folder ->
                                RemoteFolderRow(
                                    folder = folder,
                                    isSelected = folder.path == selectedPath,
                                    enabled = enabled,
                                    testTag = "${testTagPrefix}_folder_${folder.name}",
                                    onClick = { onOpenFolder(folder.path) },
                                )
                            }
                        }
                    }

                    HaroldButton(
                        text = stringResource(R.string.harold_remote_browser_use_current),
                        onClick = onUseCurrent,
                        enabled = enabled,
                        variant = HaroldButtonVariant.Secondary,
                        size = HaroldButtonSize.Small,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.Check,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("${testTagPrefix}_use_current"),
                    )
                }
            }
        }
    }
}

@Composable
private fun RemoteFolderRow(
    folder: FilesystemDirectory,
    isSelected: Boolean,
    enabled: Boolean,
    testTag: String,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (isSelected) {
            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
        } else {
            MaterialTheme.colorScheme.surfaceContainerLowest
        },
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
            .clickable(enabled = enabled, onClick = onClick)
            .testTag(testTag),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Folder,
                contentDescription = null,
                tint = if (isSelected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.7f)
                },
                modifier = Modifier.size(22.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = folder.name,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = folder.path,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.size(18.dp),
            )
        }
    }
}
