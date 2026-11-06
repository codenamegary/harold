package harold.android.session

import kotlinx.coroutines.flow.StateFlow

sealed interface PairedState {
    data object NotPaired : PairedState

    data class Paired(
        val serverOrigin: String,
        val deviceId: String,
        val deviceName: String?,
        val transport: harold.android.credentials.HaroldTransport =
            harold.android.credentials.HaroldTransport.Server,
    ) : PairedState
}

interface SessionGateway {
    val pairedState: StateFlow<PairedState>

    suspend fun refresh()

    /**
     * Deletes the stored credential and published bearer token. Used when the
     * server rejects the device so the user returns to pairing.
     */
    suspend fun clearLocalAccess()
}
