package harold.android.credentials

import harold.android.database.LocalCacheCleaner
import harold.android.session.PairedState
import harold.android.session.SessionGateway

class ConnectionRepository(
    private val store: ConnectionStore,
    private val localCacheCleaner: LocalCacheCleaner? = null,
) {
    suspend fun list(): List<SavedConnection> = store.list()

    suspend fun find(connectionId: String): SavedConnection? =
        store.list().find { connection -> connection.connectionId == connectionId }

    suspend fun save(credential: SavedConnection) {
        store.save(credential)
    }

    suspend fun edit(
        connectionId: String,
        name: String,
        colorId: String,
        iconId: String,
    ) {
        val current = store.list().find { connection -> connection.connectionId == connectionId } ?: return
        store.save(
            current.copy(
                name = name,
                colorId = colorId,
                iconId = iconId,
            ),
        )
    }

    /** Drops the saved credential and every cached row for that server origin. */
    suspend fun remove(connectionId: String): Boolean {
        store.remove(connectionId)
        localCacheCleaner?.deleteByOrigin(connectionId)
        return store.list().isNotEmpty()
    }
}

suspend fun forgetConnection(
    connectionId: String,
    repository: ConnectionRepository,
): Boolean = repository.remove(connectionId)

suspend fun settleAfterForget(
    removedOrigin: String,
    remains: Boolean,
    gateway: SessionGateway,
    disconnect: () -> Unit,
    connect: (String) -> Unit,
    showPairing: () -> Unit,
) {
    val active = gateway.pairedState.value
    val removedActive = active is PairedState.Paired && active.connectionId == removedOrigin
    if (!remains) {
        disconnect()
        gateway.clearLocalAccess()
        showPairing()
        return
    }
    if (!removedActive) {
        return
    }
    disconnect()
    gateway.refresh()
    val next = gateway.pairedState.value as? PairedState.Paired ?: return
    connect(next.connectionId)
}
