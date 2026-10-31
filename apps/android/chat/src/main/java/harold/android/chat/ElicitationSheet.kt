package harold.android.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import harold.android.live.Elicitation
import harold.android.live.ElicitationDraft
import harold.android.live.ElicitationKind
import harold.android.live.ElicitationQuestion
import harold.android.live.OTHER_OPTION_VALUE
import harold.android.live.analyzeElicitationUrl
import harold.android.live.answerSummary
import harold.android.live.isQuestionValid

private val MIN_TOUCH_TARGET = 48.dp

/**
 * The modal wizard for one agent question. Closing keeps [state]'s draft; the
 * view model owns the draft, so reopening always shows the previous answers.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ElicitationSheet(
    state: ElicitationUiState,
    request: Elicitation?,
    agentName: String,
    onClose: () -> Unit,
    onRawToggle: () -> Unit,
    onTextChanged: (String, String) -> Unit,
    onSingleSelected: (String, String) -> Unit,
    onMultiToggled: (String, String) -> Unit,
    onBooleanChanged: (String, Boolean) -> Unit,
    onOtherToggled: (String, Boolean) -> Unit,
    onOtherTextChanged: (String, String) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
    onEditStep: (Int) -> Unit,
    onSubmit: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    onOpenUrl: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!state.showSheet || request == null || request is Elicitation.Unsupported) {
        return
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheetState,
        modifier = modifier,
    ) {
        when (request) {
            is Elicitation.Form -> FormSheet(
                state = state,
                request = request,
                agentName = agentName,
                onClose = onClose,
                onRawToggle = onRawToggle,
                onTextChanged = onTextChanged,
                onSingleSelected = onSingleSelected,
                onMultiToggled = onMultiToggled,
                onBooleanChanged = onBooleanChanged,
                onOtherToggled = onOtherToggled,
                onOtherTextChanged = onOtherTextChanged,
                onBack = onBack,
                onNext = onNext,
                onEditStep = onEditStep,
                onSubmit = onSubmit,
                onDecline = onDecline,
                onCancel = onCancel,
            )

            is Elicitation.Url -> UrlSheet(
                state = state,
                request = request,
                agentName = agentName,
                onClose = onClose,
                onRawToggle = onRawToggle,
                onDecline = onDecline,
                onCancel = onCancel,
                onOpenUrl = onOpenUrl,
            )

            is Elicitation.Unsupported -> Unit
        }
        Spacer(modifier = Modifier.height(20.dp))
    }
}

/**
 * Convenience entry point for callers that own the whole screen state. The
 * active request and sheet visibility are derived from [uiState].
 */
@Composable
fun ElicitationSheet(
    uiState: ChatUiState,
    agentName: String,
    onClose: () -> Unit,
    onRawToggle: () -> Unit,
    onTextChanged: (String, String) -> Unit,
    onSingleSelected: (String, String) -> Unit,
    onMultiToggled: (String, String) -> Unit,
    onBooleanChanged: (String, Boolean) -> Unit,
    onOtherToggled: (String, Boolean) -> Unit,
    onOtherTextChanged: (String, String) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
    onEditStep: (Int) -> Unit,
    onSubmit: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    onOpenUrl: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ElicitationSheet(
        state = uiState.elicitationUiState,
        request = uiState.activeElicitation,
        agentName = agentName,
        onClose = onClose,
        onRawToggle = onRawToggle,
        onTextChanged = onTextChanged,
        onSingleSelected = onSingleSelected,
        onMultiToggled = onMultiToggled,
        onBooleanChanged = onBooleanChanged,
        onOtherToggled = onOtherToggled,
        onOtherTextChanged = onOtherTextChanged,
        onBack = onBack,
        onNext = onNext,
        onEditStep = onEditStep,
        onSubmit = onSubmit,
        onDecline = onDecline,
        onCancel = onCancel,
        onOpenUrl = onOpenUrl,
        modifier = modifier,
    )
}

@Composable
private fun FormSheet(
    state: ElicitationUiState,
    request: Elicitation.Form,
    agentName: String,
    onClose: () -> Unit,
    onRawToggle: () -> Unit,
    onTextChanged: (String, String) -> Unit,
    onSingleSelected: (String, String) -> Unit,
    onMultiToggled: (String, String) -> Unit,
    onBooleanChanged: (String, Boolean) -> Unit,
    onOtherToggled: (String, Boolean) -> Unit,
    onOtherTextChanged: (String, String) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
    onEditStep: (Int) -> Unit,
    onSubmit: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
) {
    val questions = request.questions
    var touchedKeys by remember(request.requestId) { mutableStateOf(emptySet<String>()) }

    fun touch(key: String) {
        touchedKeys = touchedKeys + key
    }

    val total = questions.size
    val currentStep = if (total == 0) 0 else state.stepIndex.coerceIn(0, total - 1)
    val currentQuestion = if (total == 0) 0 else currentStep + 1
    val progress = if (state.review) 1f else if (total == 0) 0f else currentQuestion.toFloat() / total

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .testTag("elicitation_sheet"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SheetHeader(
            agentName = agentName,
            currentQuestion = currentQuestion,
            totalQuestions = total,
            progress = progress,
            onClose = onClose,
            onCancel = onCancel,
            onRawToggle = onRawToggle,
        )

        if (state.rawExpanded) {
            Text(
                text = request.raw.toString(),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.testTag("elicitation_raw_text"),
            )
        }

        if (questions.isEmpty()) {
            Text(
                text = "This question has no answer fields.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    onClick = onSubmit,
                    enabled = !state.submitting,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_empty_accept"),
                ) {
                    Text(text = "Accept")
                }
                TextButton(
                    onClick = onDecline,
                    enabled = !state.submitting,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_empty_decline"),
                ) {
                    Text(text = "Decline")
                }
                TextButton(
                    onClick = onCancel,
                    enabled = !state.submitting,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_empty_cancel"),
                ) {
                    Text(text = "Cancel")
                }
            }
            state.error?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("elicitation_error"),
                )
            }
            return@Column
        }

        if (state.review && questions.size > 1) {
            ReviewAnswers(
                questions = questions,
                draft = state.draft,
                onEditStep = onEditStep,
            )
        } else {
            val question = questions[currentStep]
            QuestionField(
                question = question,
                draft = state.draft,
                touched = question.key in touchedKeys,
                onTouch = { touch(question.key) },
                onTextChanged = onTextChanged,
                onSingleSelected = onSingleSelected,
                onMultiToggled = onMultiToggled,
                onBooleanChanged = onBooleanChanged,
                onOtherToggled = onOtherToggled,
                onOtherTextChanged = onOtherTextChanged,
            )
        }

        state.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("elicitation_error"),
            )
        }

        FormFooter(
            state = state,
            request = request,
            onBack = onBack,
            onNext = onNext,
            onSubmit = onSubmit,
            onDecline = onDecline,
        )
    }
}

@Composable
private fun SheetHeader(
    agentName: String,
    onClose: () -> Unit,
    onCancel: () -> Unit,
    onRawToggle: () -> Unit,
    currentQuestion: Int = 0,
    totalQuestions: Int = 0,
    progress: Float = 0f,
) {
    var menuExpanded by remember { mutableStateOf(false) }

    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = agentName.ifBlank { "Agent" },
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f),
            )
            if (totalQuestions > 1) {
                Text(
                    text = "$currentQuestion/$totalQuestions",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(end = 4.dp)
                        .testTag("elicitation_question_counter"),
                )
            }
            Box {
                IconButton(
                    onClick = { menuExpanded = true },
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_sheet_overflow"),
                ) {
                    Icon(
                        imageVector = Icons.Filled.MoreVert,
                        contentDescription = null,
                    )
                }
                DropdownMenu(
                    expanded = menuExpanded,
                    onDismissRequest = { menuExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text(text = "Cancel question") },
                        onClick = {
                            menuExpanded = false
                            onCancel()
                        },
                        modifier = Modifier.testTag("elicitation_cancel"),
                    )
                    DropdownMenuItem(
                        text = { Text(text = "Show raw request") },
                        onClick = {
                            menuExpanded = false
                            onRawToggle()
                        },
                        modifier = Modifier.testTag("elicitation_raw"),
                    )
                }
            }
            IconButton(
                onClick = onClose,
                modifier = Modifier
                    .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                    .testTag("elicitation_sheet_close"),
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Close question",
                )
            }
        }

        if (totalQuestions > 1) {
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp)
                    .testTag("elicitation_progress"),
            )
        }
    }
}

@Composable
private fun QuestionField(
    question: ElicitationQuestion,
    draft: ElicitationDraft,
    touched: Boolean,
    onTouch: () -> Unit,
    onTextChanged: (String, String) -> Unit,
    onSingleSelected: (String, String) -> Unit,
    onMultiToggled: (String, String) -> Unit,
    onBooleanChanged: (String, Boolean) -> Unit,
    onOtherToggled: (String, Boolean) -> Unit,
    onOtherTextChanged: (String, String) -> Unit,
) {
    val valid = draft.isQuestionValid(question)
    val hasInput = hasInput(question, draft)
    val showError = !valid && (touched || hasInput)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = question.title,
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.testTag("elicitation_question_title"),
            )
            if (question.required) {
                Text(
                    text = "Required",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("elicitation_required"),
                )
            }
        }
        question.description?.takeIf { it.isNotBlank() }?.let { description ->
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        when (val kind = question.kind) {
            is ElicitationKind.Text -> {
                OutlinedTextField(
                    value = draft.textFor(question.key),
                    onValueChange = {
                        onTouch()
                        onTextChanged(question.key, it)
                    },
                    isError = showError,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("elicitation_field_${question.key}"),
                    label = { Text(text = question.title) },
                    minLines = 1,
                    maxLines = 4,
                    singleLine = kind.maxLength == 1,
                )
            }

            is ElicitationKind.SingleSelect -> {
                Column(
                    modifier = Modifier.testTag("elicitation_field_${question.key}"),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    kind.options.forEach { option ->
                        SelectableRow(
                            selected = draft.singleFor(question.key) == option.value,
                            text = option.title,
                            testTag = "elicitation_option_${question.key}_${option.value}",
                            onClick = {
                                onTouch()
                                onOtherToggled(question.key, false)
                                onSingleSelected(question.key, option.value)
                            },
                        )
                    }
                    if (question.otherKey != null) {
                        SelectableRow(
                            selected = draft.singleFor(question.key) == OTHER_OPTION_VALUE,
                            text = "Other",
                            testTag = "elicitation_other_toggle_${question.key}",
                            optionTestTag = "elicitation_option_${question.key}_OTHER",
                            onClick = {
                                onTouch()
                                onOtherToggled(question.key, true)
                                onSingleSelected(question.key, OTHER_OPTION_VALUE)
                            },
                        )
                        if (draft.singleFor(question.key) == OTHER_OPTION_VALUE) {
                            OutlinedTextField(
                                value = draft.otherTextFor(question.key),
                                onValueChange = {
                                    onTouch()
                                    onOtherTextChanged(question.key, it)
                                },
                                isError = showError,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("elicitation_other_text_${question.key}"),
                                label = { Text(text = "Other answer") },
                                singleLine = true,
                            )
                        }
                    }
                }
            }

            is ElicitationKind.MultiSelect -> {
                Column(
                    modifier = Modifier.testTag("elicitation_field_${question.key}"),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    kind.options.forEach { option ->
                        SelectableRow(
                            selected = option.value in draft.multiFor(question.key),
                            text = option.title,
                            testTag = "elicitation_option_${question.key}_${option.value}",
                            onClick = {
                                onTouch()
                                onMultiToggled(question.key, option.value)
                            },
                            checkbox = true,
                        )
                    }
                    if (question.otherKey != null) {
                        SelectableRow(
                            selected = draft.isOtherSelected(question.key),
                            text = "Other",
                            testTag = "elicitation_other_toggle_${question.key}",
                            optionTestTag = "elicitation_option_${question.key}_OTHER",
                            onClick = {
                                onTouch()
                                onOtherToggled(
                                    question.key,
                                    !draft.isOtherSelected(question.key),
                                )
                            },
                            checkbox = true,
                        )
                        if (draft.isOtherSelected(question.key)) {
                            OutlinedTextField(
                                value = draft.otherTextFor(question.key),
                                onValueChange = {
                                    onTouch()
                                    onOtherTextChanged(question.key, it)
                                },
                                isError = showError,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("elicitation_other_text_${question.key}"),
                                label = { Text(text = "Other answer") },
                                singleLine = true,
                            )
                        }
                    }
                }
            }

            is ElicitationKind.NumberField -> {
                OutlinedTextField(
                    value = draft.textFor(question.key),
                    onValueChange = {
                        onTouch()
                        onTextChanged(question.key, it)
                    },
                    isError = showError,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("elicitation_field_${question.key}"),
                    label = { Text(text = question.title) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (kind.integer) {
                            KeyboardType.Number
                        } else {
                            KeyboardType.Decimal
                        },
                    ),
                )
            }

            ElicitationKind.BooleanField -> {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Switch(
                        checked = draft.booleanFor(question.key),
                        onCheckedChange = {
                            onTouch()
                            onBooleanChanged(question.key, it)
                        },
                        modifier = Modifier.testTag("elicitation_field_${question.key}"),
                    )
                    Text(
                        text = if (draft.booleanFor(question.key)) "Yes" else "No",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        if (showError) {
            Text(
                text = validationMessage(question, draft),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("elicitation_field_error_${question.key}"),
            )
        }
    }
}

@Composable
private fun SelectableRow(
    selected: Boolean,
    text: String,
    testTag: String,
    onClick: () -> Unit,
    optionTestTag: String? = null,
    checkbox: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp)
            .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val controlModifier = optionTestTag?.let {
            Modifier
                .testTag(it)
                .clickable(onClick = onClick)
        } ?: Modifier
        if (checkbox) {
            Checkbox(
                checked = selected,
                onCheckedChange = null,
                modifier = controlModifier,
            )
        } else {
            RadioButton(
                selected = selected,
                onClick = null,
                modifier = controlModifier,
            )
        }
        Text(text = text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ReviewAnswers(
    questions: List<ElicitationQuestion>,
    draft: ElicitationDraft,
    onEditStep: (Int) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("elicitation_review"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        questions.forEachIndexed { index, question ->
            val answer = draft.answerSummary(listOf(question)).firstOrNull()?.second
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = question.title,
                        style = MaterialTheme.typography.labelMedium,
                    )
                    Text(
                        text = answer ?: "Not answered",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(
                    onClick = { onEditStep(index) },
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_review_edit_$index"),
                ) {
                    Text(text = "Edit")
                }
            }
            if (index != questions.lastIndex) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

@Composable
private fun FormFooter(
    state: ElicitationUiState,
    request: Elicitation.Form,
    onBack: () -> Unit,
    onNext: () -> Unit,
    onSubmit: () -> Unit,
    onDecline: () -> Unit,
) {
    val action = state.footerAction(request)
    val submitEnabled = state.canAdvance(request) && !state.submitting

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        TextButton(
            onClick = onBack,
            modifier = Modifier
                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                .testTag("elicitation_back"),
        ) {
            Text(text = "Back")
        }
        TextButton(
            onClick = onDecline,
            enabled = !state.submitting,
            modifier = Modifier
                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                .testTag("elicitation_decline"),
        ) {
            Text(text = "Decline")
        }
        Spacer(modifier = Modifier.weight(1f))
        val isSubmit = action == ElicitationFooter.Submit
        Button(
            onClick = { if (isSubmit) onSubmit() else onNext() },
            enabled = if (isSubmit) submitEnabled else !state.submitting,
            modifier = Modifier
                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                .testTag(if (isSubmit) "elicitation_submit" else "elicitation_next"),
        ) {
            Text(
                text = when {
                    state.submitting -> "Sending…"
                    action == ElicitationFooter.Review -> "Review"
                    isSubmit -> "Submit"
                    else -> "Next"
                },
            )
        }
    }
}

@Composable
private fun UrlSheet(
    state: ElicitationUiState,
    request: Elicitation.Url,
    agentName: String,
    onClose: () -> Unit,
    onRawToggle: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    onOpenUrl: () -> Unit,
) {
    val safety = analyzeElicitationUrl(request.url)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .testTag("elicitation_sheet"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SheetHeader(
            agentName = agentName,
            onClose = onClose,
            onCancel = onCancel,
            onRawToggle = onRawToggle,
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("elicitation_url"),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            request.message?.takeIf { it.isNotBlank() }?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.testTag("elicitation_message"),
                )
            }
            Text(
                text = request.url,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.testTag("elicitation_url_full"),
            )
            Text(
                text = request.host,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("elicitation_url_host"),
            )
            if (safety?.insecure == true) {
                UrlWarning(text = "This link is not HTTPS.")
            }
            if (safety?.punycode == true) {
                UrlWarning(text = "This link uses a Punycode domain.")
            }
            state.urlOpenError?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("elicitation_url_error"),
                )
            }
            if (state.rawExpanded) {
                Text(
                    text = request.raw.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.testTag("elicitation_raw_text"),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onOpenUrl,
                    enabled = !state.submitting,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_open_link"),
                ) {
                    Text(text = if (state.urlOpenError != null) "Retry" else "Open link")
                }
                TextButton(
                    onClick = onDecline,
                    enabled = !state.submitting,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_decline"),
                ) {
                    Text(text = "Decline")
                }
            }
        }

        state.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("elicitation_error"),
            )
        }
    }
}

@Composable
private fun UrlWarning(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.testTag("elicitation_url_warning"),
    )
}

private fun hasInput(question: ElicitationQuestion, draft: ElicitationDraft): Boolean =
    when (question.kind) {
        is ElicitationKind.Text -> draft.textFor(question.key).isNotEmpty()
        is ElicitationKind.SingleSelect ->
            draft.singleFor(question.key) != null || draft.otherTextFor(question.key).isNotBlank()
        is ElicitationKind.MultiSelect ->
            draft.multiFor(question.key).isNotEmpty() || draft.isOtherSelected(question.key)
        is ElicitationKind.NumberField -> draft.textFor(question.key).isNotBlank()
        ElicitationKind.BooleanField -> false
    }

private fun validationMessage(
    question: ElicitationQuestion,
    draft: ElicitationDraft,
): String = when (val kind = question.kind) {
    is ElicitationKind.Text -> {
        if (question.required && draft.textFor(question.key).isEmpty()) {
            "This field is required."
        } else {
            "Check the format and length."
        }
    }

    is ElicitationKind.SingleSelect -> {
        if (draft.singleFor(question.key) == null) {
            "Choose an option."
        } else {
            "Enter an answer."
        }
    }

    is ElicitationKind.MultiSelect -> {
        val maxItems = kind.maxItems
        val count = draft.multiFor(question.key).count { value ->
            kind.options.any { it.value == value }
        } + if (draft.isOtherSelected(question.key) &&
            draft.otherTextFor(question.key).isNotBlank()
        ) {
            1
        } else {
            0
        }
        when {
            question.required && count == 0 -> "Choose at least one option."
            maxItems != null && count > maxItems -> "Choose fewer options."
            else -> "Choose more options."
        }
    }

    is ElicitationKind.NumberField -> {
        if (question.required && draft.textFor(question.key).isBlank()) {
            "This field is required."
        } else {
            "Enter a valid number."
        }
    }

    ElicitationKind.BooleanField -> ""
}
