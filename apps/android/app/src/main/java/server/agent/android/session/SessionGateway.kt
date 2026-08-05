package server.agent.android.session

import kotlinx.coroutines.flow.StateFlow

sealed interface PairedState {
    data object NotPaired : PairedState

    data class Paired(
        val serverOrigin: String,
        val deviceId: String,
        val deviceName: String?,
    ) : PairedState
}

interface SessionGateway {
    val pairedState: StateFlow<PairedState>

    suspend fun refresh()
}
