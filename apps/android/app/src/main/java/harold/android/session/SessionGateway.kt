package harold.android.session

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

    /**
     * Deletes the stored credential and published bearer token. Used when the
     * server rejects the device so the operator returns to pairing.
     */
    suspend fun clearLocalAccess()
}
