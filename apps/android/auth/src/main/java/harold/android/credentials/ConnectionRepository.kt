package harold.android.credentials

import harold.android.database.LocalCacheCleaner
import harold.android.network.ConnectionResources
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway

class ConnectionRepository(
    private val store: ConnectionStore,
    private val localCacheCleaner: LocalCacheCleaner? = null,
    private val connectionResources: ConnectionResources? = null,
) {
    suspend fun list(): List<SavedConnection> = store.list()

    suspend fun find(connectionId: String): SavedConnection? =
        store.list().find { connection -> connection.connectionId == connectionId }

    suspend fun save(credential: SavedConnection) {
        val existing = store.list().find { connection ->
            connection.connectionId == credential.connectionId
        }
        store.save(credential)
        if (existing != null && existing.ssh != credential.ssh) {
            connectionResources?.closeConnection(credential.connectionId)
        }
    }

    suspend fun edit(
        connectionId: String,
        name: String,
        colorId: String,
        iconId: String,
    ) {
        mutate(connectionId) {
            it.copy(
                name = name,
                colorId = colorId,
                iconId = iconId,
            )
        }
    }

    /** Device-local preference: the agent new sessions start with. */
    suspend fun setDefaultAgent(connectionId: String, agentId: String?) {
        mutate(connectionId) { it.copy(defaultAgentId = agentId) }
    }

    /** Device-local preference: the workspace new sessions start in. */
    suspend fun setDefaultWorkspace(connectionId: String, path: String?) {
        mutate(connectionId) { it.copy(defaultWorkspacePath = path) }
    }

    private suspend fun mutate(connectionId: String, change: (SavedConnection) -> SavedConnection) {
        val current = store.list().find { connection -> connection.connectionId == connectionId } ?: return
        store.save(change(current))
    }

    /** Drops the saved credential and every cached row for that server origin. */
    suspend fun remove(connectionId: String): Boolean {
        store.remove(connectionId)
        localCacheCleaner?.deleteByOrigin(connectionId)
        connectionResources?.closeConnection(connectionId)
        return store.list().isNotEmpty()
    }
}

suspend fun forgetConnection(
    connectionId: String,
    repository: ConnectionRepository,
): Boolean = repository.remove(connectionId)

suspend fun settleAfterForget(
    removedConnectionId: String,
    remains: Boolean,
    gateway: ConnectionGateway,
    disconnect: () -> Unit,
    connect: (String) -> Unit,
    showConnectionSetup: () -> Unit,
) {
    val active = gateway.activeConnection.value
    val removedActive = active is ActiveConnectionState.Active && active.connectionId == removedConnectionId
    if (!remains) {
        disconnect()
        gateway.clearLocalAccess()
        showConnectionSetup()
        return
    }
    if (!removedActive) {
        return
    }
    disconnect()
    gateway.refresh()
    val next = gateway.activeConnection.value as? ActiveConnectionState.Active ?: return
    connect(next.connectionId)
}
