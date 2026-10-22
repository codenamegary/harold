package harold.android.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.ui.components.HaroldAppearanceEditor
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavedHaroldsScreen(
    uiState: SavedHaroldsUiState,
    onBack: () -> Unit,
    onEdit: (String) -> Unit,
    onRemove: (String) -> Unit,
    onNameChanged: (String) -> Unit,
    onColorSelected: (String) -> Unit,
    onIconSelected: (String) -> Unit,
    onSave: () -> Unit,
    onCancelEdit: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.saved_harolds_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("saved_harolds_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.saved_harolds_back),
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            uiState.rows.forEach { row ->
                val isEditing = uiState.editingOrigin == row.serverOrigin
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("saved_harold_${row.serverOrigin}"),
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
                                nameLabel = stringResource(R.string.pairing_name_label),
                                colorLabel = stringResource(R.string.pairing_color_label),
                                iconLabel = stringResource(R.string.pairing_icon_label),
                                nameFieldTag = "saved_harold_name",
                                colorTagPrefix = "saved_harold_color_",
                                iconTagPrefix = "saved_harold_icon_",
                                endpointSubtitle = row.serverOrigin,
                            )

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                HaroldButton(
                                    text = stringResource(R.string.pairing_cancel),
                                    onClick = onCancelEdit,
                                    variant = HaroldButtonVariant.Secondary,
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("saved_harold_cancel"),
                                )
                                HaroldButton(
                                    text = stringResource(R.string.saved_harolds_save),
                                    onClick = onSave,
                                    variant = HaroldButtonVariant.Primary,
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("saved_harold_save"),
                                )
                            }
                        }
                    } else {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            HaroldBadge(
                                colorId = row.colorId,
                                iconId = row.iconId,
                                size = 40.dp,
                                modifier = Modifier.testTag("saved_harold_badge_${row.serverOrigin}"),
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
                                    text = row.serverOrigin,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                IconButton(
                                    onClick = { onEdit(row.serverOrigin) },
                                    modifier = Modifier
                                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                        .testTag("saved_harold_edit_${row.serverOrigin}"),
                                ) {
                                    Icon(
                                        imageVector = Icons.Filled.Edit,
                                        contentDescription = stringResource(R.string.saved_harolds_edit),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                IconButton(
                                    onClick = { onRemove(row.serverOrigin) },
                                    modifier = Modifier
                                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                        .testTag("saved_harold_remove_${row.serverOrigin}"),
                                ) {
                                    Icon(
                                        imageVector = Icons.Filled.Delete,
                                        contentDescription = stringResource(R.string.saved_harolds_remove),
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}
