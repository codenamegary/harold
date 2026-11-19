package harold.android.chat

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.LoadingSkeletonList

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspaceChooserScreen(
    uiState: WorkspaceChooserUiState,
    onBack: () -> Unit,
    onSearchChanged: (String) -> Unit,
    onWorkspaceSelected: (WorkspaceRow) -> Unit,
) {
    val backContentDescription = stringResource(R.string.workspace_chooser_back_content_description)
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.workspace_chooser_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("workspace_chooser_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = backContentDescription,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
                .testTag("workspace_chooser_screen"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = uiState.search,
                onValueChange = onSearchChanged,
                singleLine = true,
                label = { Text(text = stringResource(R.string.workspace_chooser_search_label)) },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("workspace_chooser_search"),
            )

            uiState.error?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("workspace_chooser_error"),
                )
            }

            when {
                uiState.visibleWorkspaces.isEmpty() && (uiState.loading || !uiState.hasLoaded) -> {
                    LoadingSkeletonList(
                        contentDescription = stringResource(R.string.workspace_chooser_loading),
                        modifier = Modifier.testTag("workspace_chooser_loading"),
                        rows = 4,
                        rowHeight = 64.dp,
                    )
                }
                uiState.visibleWorkspaces.isEmpty() -> {
                    Text(
                        text = stringResource(R.string.workspace_chooser_empty),
                        modifier = Modifier.testTag("workspace_chooser_empty"),
                    )
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("workspace_chooser_list"),
                        contentPadding = PaddingValues(bottom = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(uiState.visibleWorkspaces, key = { row -> row.id }) { row ->
                            WorkspaceChooserRow(
                                row = row,
                                onClick = { onWorkspaceSelected(row) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceChooserRow(
    row: WorkspaceRow,
    onClick: () -> Unit,
) {
    val hasBadge = row.connectionColorId.isNotEmpty() ||
        row.connectionIconId.isNotEmpty() ||
        row.connectionName.isNotEmpty()
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("workspace_chooser_row_${row.id}")
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (hasBadge) {
                HaroldBadge(
                    colorId = row.connectionColorId,
                    iconId = row.connectionIconId,
                    size = 28.dp,
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = row.pickerLabel(),
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = row.path,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
