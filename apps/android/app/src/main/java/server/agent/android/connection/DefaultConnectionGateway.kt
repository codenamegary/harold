package server.agent.android.connection

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import server.agent.android.events.ConnectionSignal
import server.agent.android.events.ConnectionState
import server.agent.android.events.ConnectionStatus
import server.agent.android.events.EventStreamFactory
import server.agent.android.events.ReconnectPolicy
import server.agent.android.events.StreamEvent
import server.agent.android.events.reduce

/**
 * Owns the stream lifecycle while the device is paired. The cursor lives here for
 * the life of the process, so a live reconnect resumes where the fold left off and
 * a fresh process cold starts at zero.
 */
class DefaultConnectionGateway(
    private val streamFactory: EventStreamFactory,
    private val scope: CoroutineScope,
) : ConnectionGateway {
    private val _state = MutableStateFlow(ConnectionState())
    override val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private var loop: Job? = null
    private var serverOrigin: String? = null

    override fun connect(serverOrigin: String) {
        this.serverOrigin = serverOrigin
        loop?.cancel()
        loop = scope.launch { run(serverOrigin) }
    }

    override fun retry() {
        val origin = serverOrigin ?: return

        connect(origin)
    }

    override fun disconnect() {
        loop?.cancel()
        loop = null
        _state.update { current -> current.copy(status = ConnectionStatus.Idle) }
    }

    private suspend fun run(serverOrigin: String) {
        val stream = streamFactory.create(serverOrigin)

        while (currentCoroutineContext().isActive) {
            apply(ConnectionSignal.ConnectRequested)

            stream.connect(_state.value.cursor).collect { event ->
                when (event) {
                    StreamEvent.Open -> apply(ConnectionSignal.Connected)
                    is StreamEvent.Frame -> apply(ConnectionSignal.FrameReceived(event.frame))
                    is StreamEvent.Closed -> apply(ConnectionSignal.Disconnected(event.cause))
                }
            }

            val status = _state.value.status
            if (status !is ConnectionStatus.Reconnecting) {
                return
            }

            delay(ReconnectPolicy.delayMillis(status.attempt))
        }
    }

    private fun apply(signal: ConnectionSignal) {
        _state.update { current -> reduce(current, signal) }
    }
}
