package harold.android.session

import kotlinx.coroutines.flow.StateFlow

sealed interface PairedState {
    data object NotPaired : PairedState

    data class Paired(
        val connectionId: String,
        val deviceName: String?,
    ) : PairedState
}

interface SessionGateway {
    val pairedState: StateFlow<PairedState>

    suspend fun refresh()

    /**
     * Deletes every saved connection. Used when the last connection is
     * removed so the user returns to host setup.
     */
    suspend fun clearLocalAccess()
}
