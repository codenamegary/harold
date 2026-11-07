package harold.android.testing

import harold.android.credentials.ConnectionStore
import harold.android.credentials.SavedConnection
import harold.android.credentials.upsertSavedConnection

class FakeConnectionStore(
    initial: SavedConnection? = null,
) : ConnectionStore {
    private val saved = mutableListOf<SavedConnection>()

    var clearCount: Int = 0
        private set

    init {
        if (initial != null) {
            saved += initial
        }
    }

    override suspend fun list(): List<SavedConnection> = saved.toList()

    override suspend fun save(credential: SavedConnection) {
        val next = upsertSavedConnection(saved.toList(), credential)
        saved.clear()
        saved.addAll(next)
    }

    override suspend fun replace(credential: SavedConnection) {
        saved.clear()
        saved += credential
    }

    override suspend fun remove(connectionId: String) {
        saved.removeAll { connection -> connection.connectionId == connectionId }
    }

    override suspend fun clear() {
        clearCount += 1
        saved.clear()
    }
}
