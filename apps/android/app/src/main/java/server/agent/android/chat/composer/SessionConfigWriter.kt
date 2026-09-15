package server.agent.android.chat.composer

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.BooleanOption
import server.agent.android.contracts.ConfigOption
import server.agent.android.contracts.ConfigValue
import server.agent.android.contracts.SelectOption
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.network.SessionConfigApi

/**
 * Owns the composer config value and its write semantics. A pick flips the
 * option in place and PUTs immediately; a newer pick aborts the stale request;
 * a failed PUT rolls back and surfaces the Problem detail; the session_config
 * echo settles the value and clears the overlay. The ViewModel only forwards
 * snapshots in and actions through.
 */
class SessionConfigWriter(
    private val api: SessionConfigApi,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(ComposerConfigUi())
    val state: StateFlow<ComposerConfigUi> = _state.asStateFlow()

    private var target: Target? = null
    private var options: List<ConfigOption> = emptyList()
    private var pending: Pending? = null
    private var job: Job? = null
    private var error: String? = null

    fun onSnapshot(
        serverOrigin: String?,
        agentId: AgentId?,
        sessionId: String?,
        configOptions: List<ConfigOption>,
    ) {
        val nextTarget = if (serverOrigin != null && agentId != null && !sessionId.isNullOrEmpty()) {
            Target(serverOrigin, agentId, sessionId)
        } else {
            null
        }
        if (nextTarget != target) {
            job?.cancel()
            job = null
            pending = null
            error = null
        }
        target = nextTarget
        options = configOptions
        val settling = pending
        if (settling != null && options.currentValue(settling.configId) == settling.value) {
            pending = null
            error = null
        }
        emit()
    }

    fun set(configId: String, value: ConfigValue) {
        val target = target ?: return
        job?.cancel()
        val write = Pending(configId = configId, value = value)
        pending = write
        error = null
        emit()
        job = scope.launch {
            val result = api.setConfigOption(
                serverOrigin = target.serverOrigin,
                agentId = target.agentId,
                sessionId = target.sessionId,
                configId = configId,
                value = value,
            )
            result.onFailure { cause ->
                if (cause is CancellationException) {
                    return@onFailure
                }
                if (pending !== write) {
                    return@onFailure
                }
                pending = null
                error = detailOf(cause)
                emit()
            }
        }
    }

    private fun emit() {
        val overlay = pending
        val projected = if (overlay == null) {
            options
        } else {
            options.map { option ->
                if (option.id == overlay.configId) option.withValue(overlay.value) else option
            }
        }
        _state.value = composerConfigOf(projected).copy(
            saving = pending != null,
            error = error,
        )
    }

    private fun List<ConfigOption>.currentValue(configId: String): ConfigValue? =
        firstOrNull { option -> option.id == configId }?.let { option ->
            when (option) {
                is SelectOption -> ConfigValue.Text(option.currentValue)
                is BooleanOption -> ConfigValue.Toggle(option.currentValue)
            }
        }

    private fun ConfigOption.withValue(value: ConfigValue): ConfigOption = when {
        this is SelectOption && value is ConfigValue.Text -> copy(currentValue = value.value)
        this is BooleanOption && value is ConfigValue.Toggle -> copy(currentValue = value.value)
        else -> this
    }

    private fun detailOf(cause: Throwable): String {
        val apiError = (cause as? AgentApiException)?.error
        val detail = when (apiError) {
            is AgentApiError.Problem -> apiError.detail
            is AgentApiError.Unauthorized -> apiError.detail
            else -> null
        }
        return detail ?: "Setting the config option failed"
    }

    private data class Target(
        val serverOrigin: String,
        val agentId: AgentId,
        val sessionId: String,
    )

    private data class Pending(
        val configId: String,
        val value: ConfigValue,
    )
}
