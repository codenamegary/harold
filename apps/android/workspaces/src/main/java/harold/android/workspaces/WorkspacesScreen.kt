package harold.android.workspaces

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.LoadingSkeletonList

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspacesScreen(
    uiState: WorkspacesUiState,
    onBack: () -> Unit,
    onAddClick: () -> Unit,
) {
    val backContentDescription = stringResource(R.string.workspaces_back_content_description)
    val addContentDescription = stringResource(R.string.workspaces_add_content_description)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = "Workspaces") },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("workspaces_back")
                            .semantics {
                                contentDescription = backContentDescription
                            },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onAddClick,
                modifier = Modifier
                    .testTag("workspaces_add")
                    .semantics {
                        contentDescription = addContentDescription
                    },
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = null,
                )
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when (val state = uiState.loadState) {
                WorkspacesLoadState.Loading -> {
                    LoadingSkeletonList(
                        contentDescription = "Loading workspaces",
                        modifier = Modifier
                            .testTag("workspaces_loading")
                            .semantics {
                                liveRegion = LiveRegionMode.Polite
                            },
                        rows = 4,
                        rowHeight = 64.dp,
                    )
                }

                WorkspacesLoadState.Empty -> {
                    Text(
                        text = "No workspaces",
                        modifier = Modifier
                            .testTag("workspaces_empty")
                            .semantics {
                                liveRegion = LiveRegionMode.Polite
                            },
                    )
                }

                is WorkspacesLoadState.Error -> {
                    Text(
                        text = state.message,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .testTag("workspaces_error")
                            .semantics {
                                liveRegion = LiveRegionMode.Polite
                            },
                    )
                }

                is WorkspacesLoadState.Loaded -> {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 88.dp),
                        modifier = Modifier.testTag("workspaces_list"),
                    ) {
                        items(state.workspaces, key = { workspace -> workspace.id }) { workspace ->
                            WorkspaceCard(
                                workspace = workspace,
                                harold = uiState.haroldByWorkspaceId[workspace.id],
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceCard(
    workspace: Workspace,
    harold: WorkspaceHaroldBadge? = null,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("workspace_row_${workspace.id}"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (harold != null) {
                HaroldBadge(
                    colorId = harold.colorId,
                    iconId = harold.iconId,
                    size = 28.dp,
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = workspace.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = workspace.path,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = workspaceStateLabel(workspace.state),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}

private fun workspaceStateLabel(state: WorkspaceState): String =
    when (state) {
        WorkspaceState.Available -> "Available"
        WorkspaceState.Missing -> "Missing"
        WorkspaceState.Unavailable -> "Unavailable"
    }
