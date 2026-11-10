package harold.android.session

import kotlinx.coroutines.flow.StateFlow

sealed interface ActiveConnectionState {
    data object NoConnection : ActiveConnectionState

    data class Active(
        val connectionId: String,
        val deviceName: String?,
    ) : ActiveConnectionState
}

interface ConnectionGateway {
    val activeConnection: StateFlow<ActiveConnectionState>

    suspend fun refresh()

    /**
     * Deletes every saved connection. Used when the last connection is
     * removed so the user returns to host setup.
     */
    suspend fun clearLocalAccess()
}
