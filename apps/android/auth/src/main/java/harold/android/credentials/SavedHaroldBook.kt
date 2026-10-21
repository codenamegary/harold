package harold.android.credentials

import harold.android.session.PairedState
import harold.android.session.SessionGateway

class SavedHaroldBook(
    private val store: CredentialStore,
    private val revoke: suspend (serverOrigin: String, deviceId: String) -> Result<Unit>,
) {
    suspend fun list(): List<StoredCredential> = store.list()

    suspend fun edit(
        serverOrigin: String,
        name: String,
        colorId: String,
        iconId: String,
    ) {
        val current = store.list().find { harold -> harold.serverOrigin == serverOrigin } ?: return
        store.save(
            current.copy(
                name = name,
                colorId = colorId,
                iconId = iconId,
            ),
        )
    }

    suspend fun forget(serverOrigin: String, deviceId: String): Boolean {
        revoke(serverOrigin, deviceId)
        store.remove(serverOrigin)
        return store.list().isNotEmpty()
    }
}

suspend fun settleAfterForget(
    removedOrigin: String,
    remains: Boolean,
    gateway: SessionGateway,
    disconnect: () -> Unit,
    connect: (String) -> Unit,
    showPairing: () -> Unit,
) {
    val active = gateway.pairedState.value
    val removedActive = active is PairedState.Paired && active.serverOrigin == removedOrigin
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
    connect(next.serverOrigin)
}
