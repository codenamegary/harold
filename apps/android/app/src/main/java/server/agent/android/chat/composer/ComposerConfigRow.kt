package server.agent.android.chat.composer

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import server.agent.android.R
import server.agent.android.contracts.ConfigOptionValue
import server.agent.android.contracts.SelectOption
import server.agent.android.ui.theme.Body
import server.agent.android.ui.theme.Dim
import server.agent.android.ui.theme.Lime
import server.agent.android.ui.theme.Line
import server.agent.android.ui.theme.LineInput

/**
 * The composer's reserved config controls: model, mode and thinking stepper.
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
    val isEmpty = model == null && mode == null && thinking == null

    var modelSheetVisible by remember { mutableStateOf(false) }

    // 2-second non-intrusive saving timer triggered on interactions
    var localSavingActive by remember { mutableStateOf(false) }
    LaunchedEffect(localSavingActive) {
        if (localSavingActive) {
            delay(2000)
            localSavingActive = false
        }
    }
    val triggerSaving: () -> Unit = {
        localSavingActive = true
    }
    val isSaving = config.saving || localSavingActive

    // 3-second auto-dismissing toast state for thinking changes
    var toastMessage by remember { mutableStateOf<String?>(null) }
    var toastActive by remember { mutableStateOf(false) }
    LaunchedEffect(toastMessage) {
        if (toastMessage != null) {
            delay(3000)
            toastMessage = null
        }
    }

    Box(
        modifier = modifier.testTag("composer_config_row"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (isEmpty) {
                    // Empty state: provider/model | mode | <0/4 thinking display>
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(horizontal = 12.dp)
                            .testTag("composer_config_model_placeholder"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.AutoAwesome,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                            modifier = Modifier.size(14.dp),
                        )
                        Text(
                            text = stringResource(R.string.composer_config_model_placeholder),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Icon(
                            imageVector = Icons.Default.ArrowDropDown,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                            modifier = Modifier.size(16.dp),
                        )
                    }

                    VerticalDivider(
                        modifier = Modifier
                            .width(1.dp)
                            .fillMaxHeight(),
                        color = MaterialTheme.colorScheme.outlineVariant,
                    )

                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .padding(horizontal = 14.dp)
                            .testTag("composer_config_mode_placeholder"),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.composer_config_mode_placeholder),
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.Normal,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            maxLines = 1,
                        )
                    }

                    VerticalDivider(
                        modifier = Modifier
                            .width(1.dp)
                            .fillMaxHeight(),
                        color = MaterialTheme.colorScheme.outlineVariant,
                    )

                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .padding(horizontal = 12.dp)
                            .testTag("composer_config_thinking_placeholder"),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.testTag("composer_config_thinking_stepper_placeholder"),
                        ) {
                            for (i in 0 until 4) {
                                Box(
                                    modifier = Modifier
                                        .size(width = 3.dp, height = 14.dp)
                                        .clip(RoundedCornerShape(1.dp))
                                        .background(LineInput.copy(alpha = 0.45f))
                                        .testTag("composer_config_thinking_placeholder_bar_$i"),
                                )
                            }
                        }
                    }
                } else {
                    // Section 1: Model
                    model?.let { option ->
                        val modelDescription = stringResource(
                            R.string.composer_config_model_content_description,
                            option.currentLabel(),
                        )
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .clickable { modelSheetVisible = true }
                                .padding(horizontal = 12.dp)
                                .semantics {
                                    this.contentDescription = modelDescription
                                }
                                .testTag("composer_config_model_chip"),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.AutoAwesome,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = option.currentLabel(),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                            Icon(
                                imageVector = Icons.Default.ArrowDropDown,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }

                    // Divider between Model and Mode (or Thinking)
                    if (model != null && (mode != null || thinking != null)) {
                        VerticalDivider(
                            modifier = Modifier
                                .width(1.dp)
                                .fillMaxHeight(),
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }

                    // Section 2: Mode
                    mode?.let { option ->
                        val modeColor = modeColorOf(option.currentValue)
                            ?: MaterialTheme.colorScheme.primary
                        val modeDescription = stringResource(
                            R.string.composer_config_mode_content_description,
                            option.currentLabel(),
                            nextOptionValue(option)?.name ?: option.currentLabel(),
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .background(modeColor.copy(alpha = 0.16f))
                                .clickable {
                                    triggerSaving()
                                    nextOptionValue(option)?.let(configActions.onModeCycle)
                                }
                                .padding(horizontal = 14.dp)
                                .semantics {
                                    this.contentDescription = modeDescription
                                }
                                .testTag("composer_config_mode_chip"),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = option.currentLabel().uppercase(),
                                style = MaterialTheme.typography.labelMedium.copy(
                                    fontWeight = FontWeight.SemiBold,
                                    letterSpacing = 0.5.sp,
                                ),
                                color = modeColor,
                                maxLines = 1,
                            )
                        }
                    }

                    // Divider between Mode and Thinking
                    if (mode != null && thinking != null) {
                        VerticalDivider(
                            modifier = Modifier
                                .width(1.dp)
                                .fillMaxHeight(),
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }

                    // Section 3: Thinking Stepper
                    thinking?.let { option ->
                        if (option.options.isNotEmpty()) {
                            val totalBars = option.options.size
                            val currentIndex = option.options.indexOfFirst { it.value == option.currentValue }
                            val isOff = currentIndex < 0 ||
                                option.currentValue.equals("off", ignoreCase = true) ||
                                option.currentValue.equals("none", ignoreCase = true) ||
                                option.options.getOrNull(currentIndex)?.name?.equals("off", ignoreCase = true) == true
                            val litCount = if (isOff) 0 else currentIndex + 1

                            val currentLabel = stripThinkingPrefix(option.currentLabel())
                            val nextOption = nextOptionValue(option)
                            val nextLabel = nextOption?.let { stripThinkingPrefix(it.name) } ?: currentLabel
                            val thinkingDescription = stringResource(
                                R.string.composer_config_thinking_content_description,
                                currentLabel,
                                nextLabel,
                            )
                            val nextToast = nextOption?.let { next ->
                                stringResource(
                                    R.string.composer_config_thinking_toast,
                                    stripThinkingPrefix(next.name),
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .clickable {
                                        nextOption?.let { next ->
                                            triggerSaving()
                                            toastMessage = nextToast
                                            val nextIndex = option.options.indexOfFirst { it.value == next.value }
                                            val nextIsOff = nextIndex < 0 ||
                                                next.value.equals("off", ignoreCase = true) ||
                                                next.value.equals("none", ignoreCase = true) ||
                                                next.name.equals("off", ignoreCase = true)
                                            toastActive = !nextIsOff
                                            configActions.onThinkingCycle(next)
                                        }
                                    }
                                    .padding(horizontal = 12.dp)
                                    .semantics {
                                        this.contentDescription = thinkingDescription
                                    }
                                    .testTag("composer_config_thinking_chip"),
                                contentAlignment = Alignment.Center,
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.testTag("composer_config_thinking_stepper"),
                                ) {
                                    for (i in 0 until totalBars) {
                                        val isLit = i < litCount
                                        Box(
                                            modifier = Modifier
                                                .size(width = 3.dp, height = 14.dp)
                                                .clip(RoundedCornerShape(1.dp))
                                                .background(if (isLit) Lime else LineInput.copy(alpha = 0.45f))
                                                .testTag("composer_config_thinking_bar_$i"),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            config.error?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                        .testTag("composer_config_error"),
                )
            }

            // Fixed 1dp Seam: static divider or animated gradient beam
            if (isSaving) {
                SavingBeam()
            } else {
                HorizontalDivider(
                    thickness = 1.dp,
                    color = MaterialTheme.colorScheme.outlineVariant,
                    modifier = Modifier.testTag("composer_config_seam_divider"),
                )
            }
        }

        // Floating toast pill
        if (toastMessage != null) {
            Popup(
                alignment = Alignment.TopCenter,
                offset = IntOffset(0, -120),
                properties = PopupProperties(focusable = false),
            ) {
                ThinkingToast(
                    message = toastMessage!!,
                    active = toastActive,
                )
            }
        }
    }

    if (modelSheetVisible && model != null) {
        ModelPickerSheet(
            option = model,
            onPick = { value ->
                modelSheetVisible = false
                triggerSaving()
                configActions.onModelPick(value)
            },
            onDismiss = { modelSheetVisible = false },
        )
    }
}

@Composable
private fun SavingBeam(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "saving_beam")
    val progress by transition.animateFloat(
        initialValue = -0.5f,
        targetValue = 1.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "saving_beam_progress",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outlineVariant)
            .testTag("composer_config_saving_beam"),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .drawBehind {
                    val beamWidth = size.width * 0.5f
                    val startX = (size.width + beamWidth) * progress - beamWidth
                    val brush = Brush.horizontalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Lime.copy(alpha = 0.2f),
                            Lime,
                            Lime.copy(alpha = 0.2f),
                            Color.Transparent,
                        ),
                        startX = startX,
                        endX = startX + beamWidth,
                    )
                    drawRect(brush = brush)
                },
        )
    }
}

@Composable
private fun ThinkingToast(
    message: String,
    active: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .testTag("composer_thinking_toast")
            .zIndex(100f),
        shape = RoundedCornerShape(20.dp),
        color = Color(0xFF1C222C),
        border = BorderStroke(1.dp, Line),
        shadowElevation = 8.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(if (active) Lime else Dim),
            )
            Text(
                text = message,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                ),
                color = Body,
                maxLines = 1,
            )
        }
    }
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
