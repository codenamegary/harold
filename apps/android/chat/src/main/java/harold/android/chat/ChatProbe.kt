package harold.android.chat

import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalFocusManager
import harold.android.chat.composer.ComposerConfigUi
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.SelectOption
import harold.android.contracts.SessionState
import harold.android.live.Elicitation
import harold.android.live.ElicitationKind
import harold.android.live.ElicitationQuestion
import harold.android.live.TranscriptAssistantRow
import harold.android.ui.debug.Probe
import harold.android.ui.debug.ScreenProbe

/**
 * Debug control plane adapter for the chat screen.
 *
 * The chat surface owns several overlays: the session dropdown, the composer,
 * the pending attachment chips, the agent-question card and its modal sheet.
 * `Probe.install` clears the control map and only one probe is live at a time,
 * so every one of those surfaces is reachable through this single probe rather
 * than a second registration.
 *
 * This file is compiled into every build because [ChatScreen] and this probe
 * share a module, but it does nothing unless the debug build's initializer sets
 * [Probe.enabled]. Release builds install no probe, so the registry stays empty.
 */
@Composable
fun ChatProbeEffect(
    viewModel: ChatViewModel,
    onNewSession: () -> Unit = {},
    onSeeAllSessions: () -> Unit = {},
    onOpenChanges: () -> Unit = {},
    onBack: () -> Unit = {},
) {
    val focusManager = LocalFocusManager.current
    DisposableEffect(viewModel) {
        if (!Probe.enabled) {
            return@DisposableEffect onDispose {}
        }
        val probe = ChatProbe(
            ChatViewModelProbeHost(
                viewModel = viewModel,
                onNewSession = onNewSession,
                onSeeAllSessions = onSeeAllSessions,
                onOpenChanges = onOpenChanges,
                onBack = onBack,
                onDismissKeyboard = { focusManager.clearFocus() },
            ),
        )
        Probe.install(probe)
        onDispose { Probe.uninstall(probe) }
    }
}

/**
 * Everything the probe needs from the screen, behind one narrow port so the
 * probe's dispatch can be tested without a Hilt graph or a compose runtime.
 */
internal interface ChatProbeHost {
    fun state(): ChatUiState

    fun showSessionMenu()

    fun hideSessionMenu()

    fun selectSession(row: SessionRow)

    fun newSession()

    fun seeAllSessions()

    fun setMode(value: String)

    fun setComposerText(text: String)

    fun sendPrompt()

    fun cancelRun()

    fun removeAttachment(localId: String)

    fun openElicitation()

    fun closeElicitation()

    fun selectElicitationOption(questionKey: String, optionValue: String)

    fun submitElicitation()

    fun declineElicitation()

    fun openChanges()

    fun dismissKeyboard()

    fun back()

    /** Debug-only fixture picks, or null when this build carries no fixture seam. */
    fun fixturePicks(): List<AttachmentPick>?

    /** The same intake the system pickers use, so the chips and uploads are real. */
    fun attachPicks(picks: List<AttachmentPick>)
}

/**
 * Commands map onto the same ViewModel methods the screen calls, so the app's
 * own state machine decides what is allowed. Typing is per character on this
 * thread with a real gap, so the field repaints glyph by glyph exactly as it
 * does for a person.
 */
internal class ChatProbe(
    private val host: ChatProbeHost,
) : ScreenProbe {

    override val name: String = "chat"

    override fun facts(): Map<String, String> = chatProbeFacts(host.state())

    override fun actions(): List<String> = chatProbeActions(hasFixture = host.fixturePicks() != null)

    override fun settled(): Boolean = chatProbeSettled(host.state())

    override fun perform(action: String, args: Map<String, String>): Boolean = when (action) {
        "open_session_menu" -> {
            host.showSessionMenu()
            true
        }
        "close_session_menu" -> {
            host.hideSessionMenu()
            true
        }
        "pick_session" -> pickSession(args["id"])
        "open_new_session" -> {
            host.newSession()
            true
        }
        "see_all_sessions" -> {
            host.seeAllSessions()
            true
        }
        "set_mode" -> setMode(args["value"])
        "set_text" -> {
            host.setComposerText(args["text"].orEmpty())
            true
        }
        "type" -> type(args)
        "send" -> {
            host.sendPrompt()
            true
        }
        "cancel" -> {
            host.cancelRun()
            true
        }
        "remove_attachment" -> removeAttachment(args["name"])
        "attach_fixture" -> attachFixture()
        "open_elicitation" -> {
            host.openElicitation()
            true
        }
        "select_option" -> selectOption(args["questionKey"], args["optionValue"])
        "submit_elicitation" -> {
            host.submitElicitation()
            true
        }
        "decline_elicitation" -> {
            host.declineElicitation()
            true
        }
        "close_elicitation" -> {
            host.closeElicitation()
            true
        }
        "open_changes" -> {
            host.openChanges()
            true
        }
        "dismiss_keyboard" -> {
            host.dismissKeyboard()
            true
        }
        "back" -> {
            host.back()
            true
        }
        else -> false
    }

    private fun pickSession(id: String?): Boolean {
        if (id.isNullOrEmpty()) {
            return false
        }
        val state = host.state()
        val row = state.sessions.firstOrNull { session -> session.id == id }
            ?: state.recentSessions.firstOrNull { session -> session.id == id }
            ?: return false
        host.selectSession(row)
        return true
    }

    private fun setMode(value: String?): Boolean {
        if (value.isNullOrEmpty()) {
            return false
        }
        val mode = host.state().composerConfig.mode as? SelectOption ?: return false
        if (mode.options.none { option -> option.value == value }) {
            return false
        }
        host.setMode(value)
        return true
    }

    private fun type(args: Map<String, String>): Boolean {
        val text = args["text"] ?: return false
        val gapMs = args["gapMs"]?.toLongOrNull() ?: DEFAULT_GAP_MS
        if (args["append"] != "true") {
            host.setComposerText("")
        }
        for (character in text) {
            Probe.mark("key")
            host.setComposerText(host.state().composerText + character)
            if (gapMs > 0) {
                Thread.sleep(gapMs)
            }
        }
        Probe.mark("keys_done")
        return true
    }

    private fun removeAttachment(name: String?): Boolean {
        if (name.isNullOrEmpty()) {
            return false
        }
        val attachment = host.state().pendingAttachments
            .firstOrNull { pending -> pending.name == name }
            ?: return false
        host.removeAttachment(attachment.localId)
        return true
    }

    /**
     * The driver never films a system picker. This seam feeds the same intake
     * the pickers use, so the chips and uploads are the app's real ones, and it
     * refuses everything unless the debug control plane is running.
     */
    private fun attachFixture(): Boolean {
        if (!Probe.enabled) {
            return false
        }
        val picks = host.fixturePicks() ?: return false
        if (picks.isEmpty()) {
            return false
        }
        host.attachPicks(picks)
        return true
    }

    private fun selectOption(questionKey: String?, optionValue: String?): Boolean {
        if (questionKey.isNullOrEmpty() || optionValue.isNullOrEmpty()) {
            return false
        }
        host.selectElicitationOption(questionKey, optionValue)
        return true
    }

    internal companion object {
        /** Matches the driver's floor. Slow enough to read on video. */
        const val DEFAULT_GAP_MS = 30L
    }
}

/** The tag on one session row inside the header dropdown. */
internal fun sessionMenuRowTag(sessionId: String): String = "session_menu_row_$sessionId"

/** The tag on one option row inside the agent-question sheet. */
internal fun elicitationOptionTag(questionKey: String, optionValue: String): String =
    "elicitation_option_${questionKey}_$optionValue"

/**
 * Flat strings only, derived from the one state the screen renders. Nothing
 * here reads a compose tree, so it is safe to call from the control-plane thread.
 */
internal fun chatProbeFacts(state: ChatUiState): Map<String, String> {
    val active = state.activeElicitation
    val usage = state.contextUsage
    val mode = state.composerConfig.mode as? SelectOption
    return mapOf(
        "sessionId" to state.selectedSession?.sessionId.orEmpty(),
        "sessionName" to state.selectedSession?.name.orEmpty(),
        "sessionState" to chatSessionStateFact(state),
        "sessionMenuOpen" to state.pickerVisible.toString(),
        "sessionMenuCount" to state.recentSessions.size.toString(),
        "mode" to mode?.currentValue.orEmpty(),
        "modeOptions" to mode?.options.orEmpty().joinToString(",") { option -> option.value },
        "model" to composerModelLabel(state.composerConfig),
        "composerText" to state.composerText,
        "composerEnabled" to state.composerEnabled.toString(),
        "sendEnabled" to state.submitEnabled.toString(),
        "attachmentCount" to state.pendingAttachments.size.toString(),
        "attachmentNames" to state.pendingAttachments.joinToString("|") { pending -> pending.name },
        "usage" to usage?.let(::formatContextUsage).orEmpty(),
        "usageCost" to usage?.cost?.let(::formatUsageCost).orEmpty(),
        "changesBadgeCount" to state.changesBadgeCount.toString(),
        "elicitationPending" to (active != null).toString(),
        "elicitationRequestId" to active?.requestId.orEmpty(),
        "elicitationSheetOpen" to (active != null && state.elicitationUiState.showSheet).toString(),
        "elicitationTitle" to active?.cardTitle().orEmpty(),
        "elicitationQuestionCount" to (active?.questionCount() ?: 0).toString(),
        "elicitationOptions" to elicitationOptionsFact(active),
        "elicitationDraftValid" to
            (active != null && state.elicitationUiState.canAdvance(active)).toString(),
        "elicitationSubmitting" to state.elicitationUiState.submitting.toString(),
        "lastAssistantText" to lastAssistantText(state),
        "running" to state.showProgress.toString(),
        "composerSubmitting" to state.composerSubmitting.toString(),
        "error" to (state.composerError ?: state.cancelError).orEmpty(),
    )
}

/**
 * `attach_fixture` is listed only when this build actually carries the debug
 * fixture seam. Release builds register no source, so the driver can tell a
 * refusal from a missing feature by reading [chatProbeActions].
 */
internal fun chatProbeActions(hasFixture: Boolean): List<String> = buildList {
    add("open_session_menu")
    add("close_session_menu")
    add("pick_session")
    add("open_new_session")
    add("see_all_sessions")
    add("set_mode")
    add("set_text")
    add("type")
    add("send")
    add("cancel")
    add("remove_attachment")
    if (hasFixture) {
        add("attach_fixture")
    }
    add("open_elicitation")
    add("select_option")
    add("submit_elicitation")
    add("decline_elicitation")
    add("close_elicitation")
    add("open_changes")
    add("dismiss_keyboard")
    add("back")
}

/** True only when no turn, prompt or question reply is in flight. */
internal fun chatProbeSettled(state: ChatUiState): Boolean =
    !state.showProgress &&
        !state.composerSubmitting &&
        !state.elicitationUiState.submitting

/** The three values the storyboard uses: idle, running, waiting. */
internal fun chatSessionStateFact(state: ChatUiState): String = when {
    state.activeElicitation != null || state.activePermissionRequest != null -> "waiting"
    state.showProgress || state.effectiveSessionState == SessionState.Running -> "running"
    else -> "idle"
}

/**
 * `questionKey=optionValue:optionTitle` triples, pipe separated, for every
 * choice the active question exposes.
 */
internal fun elicitationOptionsFact(request: Elicitation?): String {
    val form = request as? Elicitation.Form ?: return ""
    return form.questions
        .flatMap { question -> question.choiceFacts() }
        .joinToString("|")
}

private fun ElicitationQuestion.choiceFacts(): List<String> = when (val kind = this.kind) {
    is ElicitationKind.SingleSelect ->
        kind.options.map { option -> "$key=${option.value}:${option.title}" }
    is ElicitationKind.MultiSelect ->
        kind.options.map { option -> "$key=${option.value}:${option.title}" }
    is ElicitationKind.Text,
    is ElicitationKind.NumberField,
    ElicitationKind.BooleanField,
    -> emptyList()
}

private fun composerModelLabel(config: ComposerConfigUi): String {
    val model = config.model as? SelectOption ?: return ""
    return model.options.firstOrNull { option -> option.value == model.currentValue }?.name
        ?: model.currentValue
}

private fun lastAssistantText(state: ChatUiState): String =
    state.transcript.rows.filterIsInstance<TranscriptAssistantRow>().lastOrNull()?.text.orEmpty()

/**
 * The production host. Every call lands on the ViewModel method the screen
 * already uses; navigation lambdas are the same ones the entry builder hands
 * the screen.
 */
internal class ChatViewModelProbeHost(
    private val viewModel: ChatViewModel,
    private val onNewSession: () -> Unit,
    private val onSeeAllSessions: () -> Unit,
    private val onOpenChanges: () -> Unit,
    private val onBack: () -> Unit,
    private val onDismissKeyboard: () -> Unit,
) : ChatProbeHost {

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun state(): ChatUiState = viewModel.uiState.value

    override fun showSessionMenu() = viewModel.showPicker()

    override fun hideSessionMenu() = viewModel.hidePicker()

    override fun selectSession(row: SessionRow) = viewModel.selectSession(row)

    override fun newSession() {
        viewModel.hidePicker()
        onNewSession()
    }

    override fun seeAllSessions() {
        viewModel.hidePicker()
        onSeeAllSessions()
    }

    override fun setMode(value: String) {
        val mode = viewModel.uiState.value.composerConfig.mode as? SelectOption ?: return
        val label = mode.options.firstOrNull { option -> option.value == value }?.name ?: value
        viewModel.onModeCycle(ConfigOptionValue(value = value, name = label))
    }

    override fun setComposerText(text: String) = viewModel.onComposerTextChanged(text)

    override fun sendPrompt() = viewModel.submitComposerPrompt()

    override fun cancelRun() = viewModel.submitCancel()

    override fun removeAttachment(localId: String) = viewModel.removeAttachment(localId)

    override fun openElicitation() = viewModel.openElicitationSheet()

    override fun closeElicitation() = viewModel.closeElicitationSheet()

    override fun selectElicitationOption(questionKey: String, optionValue: String) =
        viewModel.onElicitationSingleSelected(questionKey, optionValue)

    override fun submitElicitation() = viewModel.submitElicitation()

    override fun declineElicitation() = viewModel.declineElicitation()

    override fun openChanges() = onOpenChanges()

    /** Focus changes belong on the main thread; the control plane runs off it. */
    override fun dismissKeyboard() {
        mainHandler.post(onDismissKeyboard)
    }

    override fun back() = onBack()

    override fun fixturePicks(): List<AttachmentPick>? = ChatProbeAttachmentFixtures.source?.invoke()

    override fun attachPicks(picks: List<AttachmentPick>) = viewModel.onAttachmentsPicked(picks)
}
