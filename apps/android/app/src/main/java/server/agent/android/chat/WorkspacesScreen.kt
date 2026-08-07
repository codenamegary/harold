package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import server.agent.android.R
import server.agent.android.contracts.WorkspaceState

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspacesScreen(
    uiState: WorkspacesUiState,
    onBack: () -> Unit,
) {
    val backContentDescription = stringResource(R.string.workspaces_back_content_description)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(text = "Workspaces") },
                navigationIcon = {
                    TextButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .semantics {
                                contentDescription = backContentDescription
                            },
                    ) {
                        Text(text = stringResource(R.string.workspaces_back))
                    }
                },
            )
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
                    Text(
                        text = "Loading workspaces…",
                        modifier = Modifier
                            .testTag("workspaces_loading")
                            .semantics {
                                liveRegion = LiveRegionMode.Polite
                            },
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
                        modifier = Modifier.testTag("workspaces_list"),
                    ) {
                        items(state.workspaces, key = { workspace -> workspace.id }) { workspace ->
                            WorkspaceCard(workspace = workspace)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceCard(workspace: WorkspaceRow) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("workspace_row_${workspace.id}"),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = workspace.name, style = MaterialTheme.typography.titleMedium)
            Text(
                text = workspace.path,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = workspaceStateLabel(workspace.state),
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

private fun workspaceStateLabel(state: WorkspaceState): String =
    when (state) {
        WorkspaceState.Available -> "Available"
        WorkspaceState.Missing -> "Missing"
        WorkspaceState.Unavailable -> "Unavailable"
    }
