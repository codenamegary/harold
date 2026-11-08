package harold.android.connections

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.session.ConnectionStatus
import harold.android.ui.components.HaroldAppearanceEditor
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldCard
import harold.android.ui.components.SwipeToDeleteListItem

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionsScreen(
    uiState: ConnectionsUiState,
    onBack: () -> Unit,
    onAdd: () -> Unit,
    onEdit: (String) -> Unit,
    onRemove: (String) -> Unit,
    onNameChanged: (String) -> Unit,
    onColorSelected: (String) -> Unit,
    onIconSelected: (String) -> Unit,
    onSave: () -> Unit,
    onCancelEdit: () -> Unit,
    onOpenSettings: (String) -> Unit = {},
    onOpenAgents: (String) -> Unit = {},
) {
    val addContentDescription = stringResource(R.string.connections_add)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.connections_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("connections_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.connections_back),
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onAdd,
                modifier = Modifier
                    .testTag("connections_add")
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (uiState.rows.isEmpty()) {
                HaroldCard(
                    modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                    shape = RoundedCornerShape(20.dp),
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Dns,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(28.dp),
                            )
                        }
                        Text(
                            text = stringResource(R.string.connections_empty_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center,
                        )
                        Text(
                            text = stringResource(R.string.connections_empty_body),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        HaroldButton(
                            text = stringResource(R.string.connections_add),
                            onClick = onAdd,
                            variant = HaroldButtonVariant.Primary,
                            modifier = Modifier.fillMaxWidth().testTag("connections_empty_add"),
                        )
                    }
                }
            }

            uiState.rows.forEach { row ->
                val isEditing = uiState.editingOrigin == row.connectionId
                SwipeToDeleteListItem(
                    rowTag = row.connectionId,
                    deleteLabel = stringResource(R.string.connections_remove),
                    onDelete = { onRemove(row.connectionId) },
                    enabled = !isEditing,
                    shape = RoundedCornerShape(16.dp),
                    deleteActionTag = "connection_remove_${row.connectionId}",
                    confirmationTitle = stringResource(R.string.connections_remove_confirm_title),
                    confirmationText = stringResource(R.string.connections_remove_confirm_body),
                ) {
                    HaroldCard(
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("connection_${row.connectionId}"),
                    ) {
                        if (isEditing) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(16.dp),
                            ) {
                                HaroldAppearanceEditor(
                                    name = uiState.name,
                                    colorId = uiState.colorId,
                                    iconId = uiState.iconId,
                                    onNameChanged = onNameChanged,
                                    onColorSelected = onColorSelected,
                                    onIconSelected = onIconSelected,
                                    nameLabel = stringResource(R.string.connections_name_label),
                                    colorLabel = stringResource(R.string.connections_color_label),
                                    iconLabel = stringResource(R.string.connections_icon_label),
                                    nameFieldTag = "connection_name",
                                    colorTagPrefix = "connection_color_",
                                    iconTagPrefix = "connection_icon_",
                                    endpointSubtitle = row.endpoint,
                                )

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    HaroldButton(
                                        text = stringResource(R.string.connections_cancel),
                                        onClick = onCancelEdit,
                                        variant = HaroldButtonVariant.Secondary,
                                        modifier = Modifier
                                            .weight(1f)
                                            .testTag("connection_cancel"),
                                    )
                                    HaroldButton(
                                        text = stringResource(R.string.connections_save),
                                        onClick = onSave,
                                        variant = HaroldButtonVariant.Primary,
                                        modifier = Modifier
                                            .weight(1f)
                                            .testTag("connection_save"),
                                    )
                                }
                            }
                        } else {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 14.dp, end = 10.dp, top = 12.dp, bottom = 8.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    HaroldBadge(
                                        colorId = row.colorId,
                                        iconId = row.iconId,
                                        size = 44.dp,
                                        modifier = Modifier.testTag("connection_badge_${row.connectionId}"),
                                    )
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(2.dp),
                                    ) {
                                        Text(
                                            text = row.name,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Text(
                                            text = row.endpoint,
                                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    ConnectionStatusPill(
                                        status = row.status,
                                        modifier = Modifier.testTag("connection_status_${row.connectionId}"),
                                    )
                                }

                                HorizontalDivider(
                                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                                )

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Surface(
                                        onClick = { onOpenAgents(row.connectionId) },
                                        shape = RoundedCornerShape(10.dp),
                                        color = MaterialTheme.colorScheme.surfaceContainerHighest,
                                        modifier = Modifier
                                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                            .testTag("connection_agents_${row.connectionId}"),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            Icon(
                                                imageVector = Icons.AutoMirrored.Filled.ListAlt,
                                                contentDescription = stringResource(R.string.connections_open_agents),
                                                tint = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier.size(18.dp),
                                            )
                                            Text(
                                                text = stringResource(R.string.connections_open_agents),
                                                style = MaterialTheme.typography.labelMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                color = MaterialTheme.colorScheme.onSurface,
                                            )
                                        }
                                    }

                                    IconButton(
                                        onClick = { onOpenSettings(row.connectionId) },
                                        modifier = Modifier
                                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                            .testTag("connection_settings_${row.connectionId}"),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Filled.Settings,
                                            contentDescription = stringResource(R.string.connections_open_settings),
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(88.dp))
        }
    }
}

@Composable
private fun ConnectionStatusPill(
    status: ConnectionStatus,
    modifier: Modifier = Modifier,
) {
    val (containerColor, contentColor, dotColor) = when (status) {
        ConnectionStatus.Connected -> Triple(
            MaterialTheme.colorScheme.primaryContainer,
            MaterialTheme.colorScheme.onPrimaryContainer,
            MaterialTheme.colorScheme.primary,
        )
        ConnectionStatus.Connecting -> Triple(
            MaterialTheme.colorScheme.tertiaryContainer,
            MaterialTheme.colorScheme.onTertiaryContainer,
            MaterialTheme.colorScheme.tertiary,
        )
        ConnectionStatus.Unreachable -> Triple(
            MaterialTheme.colorScheme.errorContainer,
            MaterialTheme.colorScheme.onErrorContainer,
            MaterialTheme.colorScheme.error,
        )
        ConnectionStatus.Closed -> Triple(
            MaterialTheme.colorScheme.surfaceContainerHighest,
            MaterialTheme.colorScheme.onSurfaceVariant,
            MaterialTheme.colorScheme.outline,
        )
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = containerColor,
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .background(dotColor, CircleShape),
            )
            Text(
                text = statusLabel(status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = contentColor,
            )
        }
    }
}

private fun statusLabel(status: ConnectionStatus): String = when (status) {
    ConnectionStatus.Connecting -> "Connecting"
    ConnectionStatus.Connected -> "Connected"
    ConnectionStatus.Unreachable -> "Unreachable"
    ConnectionStatus.Closed -> "Offline"
}
