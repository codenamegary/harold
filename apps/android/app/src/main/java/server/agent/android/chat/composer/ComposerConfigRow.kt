package server.agent.android.chat.composer

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import server.agent.android.R
import server.agent.android.contracts.ConfigOptionValue
import server.agent.android.contracts.SelectOption

/**
 * The composer's reserved config controls: model, mode and thinking chips.
 * Only select options render; boolean and unknown options stay hidden,
 * matching the web. The row renders nothing when no reserved option exists.
 */
@Composable
fun ComposerConfigRow(
    config: ComposerConfigUi,
    configActions: ComposerConfigActions,
    modifier: Modifier = Modifier,
) {
    val model = config.model as? SelectOption
    val mode = config.mode as? SelectOption
    val thinking = config.thinking as? SelectOption
    if (model == null && mode == null && thinking == null) {
        return
    }

    var modelSheetVisible by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.testTag("composer_config_row"),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            model?.let { option ->
                ConfigChip(
                    label = option.currentLabel(),
                    contentDescription = stringResource(
                        R.string.composer_config_model_content_description,
                        option.currentLabel(),
                    ),
                    saving = config.saving,
                    labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .testTag("composer_config_model_chip")
                        .widthIn(max = 200.dp),
                    onClick = { modelSheetVisible = true },
                )
            }
            mode?.let { option ->
                ConfigChip(
                    label = option.currentLabel(),
                    contentDescription = stringResource(
                        R.string.composer_config_mode_content_description,
                        option.currentLabel(),
                        nextOptionValue(option)?.name ?: option.currentLabel(),
                    ),
                    saving = config.saving,
                    labelColor = modeColorOf(option.currentValue)
                        ?: MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("composer_config_mode_chip"),
                    onClick = { nextOptionValue(option)?.let(configActions.onModeCycle) },
                )
            }
            thinking?.let { option ->
                val label = stripThinkingPrefix(option.currentLabel())
                ConfigChip(
                    label = label,
                    contentDescription = stringResource(
                        R.string.composer_config_thinking_content_description,
                        label,
                        nextOptionValue(option)?.let { next -> stripThinkingPrefix(next.name) }
                            ?: label,
                    ),
                    saving = config.saving,
                    labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("composer_config_thinking_chip"),
                    onClick = { nextOptionValue(option)?.let(configActions.onThinkingCycle) },
                )
            }
        }
        config.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("composer_config_error"),
            )
        }
    }

    if (modelSheetVisible && model != null) {
        ModelPickerSheet(
            option = model,
            onPick = { value ->
                modelSheetVisible = false
                configActions.onModelPick(value)
            },
            onDismiss = { modelSheetVisible = false },
        )
    }
}

@Composable
private fun ConfigChip(
    label: String,
    contentDescription: String,
    saving: Boolean,
    labelColor: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val alpha = savingAlpha(saving)
    AssistChip(
        onClick = onClick,
        enabled = !saving,
        label = {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.alpha(alpha),
            )
        },
        shape = RoundedCornerShape(50),
        colors = AssistChipDefaults.assistChipColors(
            containerColor = Color.Transparent,
            labelColor = labelColor,
        ),
        border = AssistChipDefaults.assistChipBorder(
            enabled = !saving,
            borderColor = MaterialTheme.colorScheme.outlineVariant,
        ),
        modifier = modifier.semantics { this.contentDescription = contentDescription },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ModelPickerSheet(
    option: SelectOption,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(option.options, query) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            option.options
        } else {
            option.options.filter { value ->
                value.name.contains(trimmed, ignoreCase = true) ||
                    value.value.contains(trimmed, ignoreCase = true)
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .testTag("composer_config_model_sheet"),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(R.string.composer_config_model_title),
                style = MaterialTheme.typography.titleMedium,
            )
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                placeholder = { Text(stringResource(R.string.composer_config_search_hint)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("composer_config_model_search"),
            )
            LazyColumn(modifier = Modifier.heightIn(max = 320.dp)) {
                items(filtered, key = { value -> value.value }) { value ->
                    val selected = value.value == option.currentValue
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(value.value) }
                            .padding(vertical = 12.dp)
                            .testTag("composer_config_model_option_${value.value}"),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = value.name,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        if (selected) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun savingAlpha(saving: Boolean): Float {
    if (!saving) {
        return 1f
    }
    val transition = rememberInfiniteTransition(label = "config_saving")
    val alpha by transition.animateFloat(
        initialValue = 0.45f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(durationMillis = 550), RepeatMode.Reverse),
        label = "config_saving_alpha",
    )
    return alpha
}

private val THINKING_PREFIX = Regex("^thinking\\s*:\\s*", RegexOption.IGNORE_CASE)
private val THINKING_SPACE_PREFIX = Regex("^thinking\\s+", RegexOption.IGNORE_CASE)

internal fun stripThinkingPrefix(label: String): String =
    label.replace(THINKING_PREFIX, "").replace(THINKING_SPACE_PREFIX, "")

private fun SelectOption.currentLabel(): String =
    options.firstOrNull { value -> value.value == currentValue }?.name ?: currentValue

private fun nextOptionValue(option: SelectOption): ConfigOptionValue? {
    if (option.options.isEmpty()) {
        return null
    }
    val index = option.options.indexOfFirst { value -> value.value == option.currentValue }
    return option.options[(index + 1).mod(option.options.size)]
}
