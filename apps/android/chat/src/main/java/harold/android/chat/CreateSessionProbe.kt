package harold.android.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import harold.android.ui.debug.Probe
import harold.android.ui.debug.ScreenProbe

/**
 * Debug control plane adapter for the new-session form.
 *
 * This file is compiled into every build because [CreateSessionScreen] and this
 * probe share a module, but it does nothing unless the debug build's
 * initializer sets [Probe.enabled]. Release builds install no probe, so the
 * registry stays empty.
 */
@Composable
fun CreateSessionProbeEffect(
    viewModel: CreateSessionViewModel,
    onBack: () -> Unit = {},
) {
    DisposableEffect(viewModel) {
        if (!Probe.enabled) {
            return@DisposableEffect onDispose {}
        }
        val probe = CreateSessionProbe(
            CreateSessionViewModelProbeHost(viewModel = viewModel, onBack = onBack),
        )
        Probe.install(probe)
        onDispose { Probe.uninstall(probe) }
    }
}

/** The slice of the form the probe drives, so dispatch is testable without Hilt. */
internal interface CreateSessionProbeHost {
    fun state(): CreateSessionUiState

    fun pickWorkspace(id: String?)

    fun pickAgent(agentId: String?)

    fun submit()

    fun back()
}

internal class CreateSessionProbe(
    private val host: CreateSessionProbeHost,
) : ScreenProbe {

    override val name: String = "create_session"

    override fun facts(): Map<String, String> = createSessionProbeFacts(host.state())

    override fun actions(): List<String> = createSessionProbeActions()

    override fun settled(): Boolean = createSessionProbeSettled(host.state())

    override fun perform(action: String, args: Map<String, String>): Boolean = when (action) {
        "pick_workspace" -> {
            host.pickWorkspace(args["id"])
            true
        }
        "pick_agent" -> {
            host.pickAgent(args["agentId"])
            true
        }
        "submit" -> {
            host.submit()
            true
        }
        "back" -> {
            host.back()
            true
        }
        else -> false
    }
}

/** The tag on one agent row inside the agent dropdown. */
internal fun createSessionAgentOptionTag(agentId: String): String =
    "create_session_agent_option_$agentId"

/** The tag on one workspace row inside the workspace dropdown. */
internal fun createSessionWorkspaceOptionTag(workspaceId: String): String =
    "create_session_workspace_option_$workspaceId"

/**
 * Which workspaces and agents are offered, which one of each is selected, and
 * whether the form can be sent, all as flat strings.
 */
internal fun createSessionProbeFacts(state: CreateSessionUiState): Map<String, String> {
    val workspace = state.workspaces.firstOrNull { row -> row.id == state.selectedWorkspaceId }
    val agent = state.agents.firstOrNull { row -> row.id == state.selectedAgentId }
    return mapOf(
        "workspaceId" to state.selectedWorkspaceId,
        "workspaceLabel" to workspace?.pickerLabel().orEmpty(),
        "workspaceCount" to state.workspaces.size.toString(),
        "workspaceIds" to state.workspaces.joinToString("|") { row -> row.id },
        "workspaceLabels" to state.workspaces.joinToString("|") { row -> row.pickerLabel() },
        "agentId" to state.selectedAgentId.orEmpty(),
        "agentLabel" to agent?.displayName.orEmpty(),
        "agentCount" to state.agents.size.toString(),
        "agentIds" to state.agents.joinToString("|") { option -> option.id },
        "agentLabels" to state.agents.joinToString("|") { option -> option.displayName },
        "submitEnabled" to createSessionSubmitEnabled(state).toString(),
        "submitting" to state.submitting.toString(),
        "error" to state.error.orEmpty(),
    )
}

/**
 * `open_workspace_menu` and `open_agent_menu` are deliberately absent: the
 * dropdowns expand from composable-local state, so the driver taps the field
 * tag and then the option tag, both of which register their bounds.
 */
internal fun createSessionProbeActions(): List<String> = listOf(
    "pick_workspace",
    "pick_agent",
    "submit",
    "back",
)

/** True only when the create request has landed. */
internal fun createSessionProbeSettled(state: CreateSessionUiState): Boolean = !state.submitting

/**
 * The same preconditions `CreateSessionViewModel.submit` checks before it
 * calls the host: a selected workspace that exists, and a selected agent.
 */
internal fun createSessionSubmitEnabled(state: CreateSessionUiState): Boolean =
    !state.submitting &&
        state.workspaces.any { row -> row.id == state.selectedWorkspaceId } &&
        state.agents.any { option -> option.id == state.selectedAgentId }

internal class CreateSessionViewModelProbeHost(
    private val viewModel: CreateSessionViewModel,
    private val onBack: () -> Unit,
) : CreateSessionProbeHost {

    override fun state(): CreateSessionUiState = viewModel.uiState.value

    override fun pickWorkspace(id: String?) {
        if (!id.isNullOrEmpty()) {
            viewModel.onWorkspaceChanged(id)
        }
    }

    override fun pickAgent(agentId: String?) {
        if (!agentId.isNullOrEmpty()) {
            viewModel.onAgentChanged(agentId)
        }
    }

    override fun submit() = viewModel.submit()

    override fun back() = onBack()
}
