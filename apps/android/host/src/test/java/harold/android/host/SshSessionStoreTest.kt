package harold.android.host

import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshExecChannel
import harold.android.transport.ssh.SshFileEntry
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class SshSessionStoreTest {
    @Test
    fun touchWorkspaceUpdatesOnlyTheMatchingSavedWorkspace() = runTest {
        val connection = FakeSshConnection()
        val store = SshSessionStore(connection, HOME)
        val first = workspace("ws_a", "/tmp/a", lastUsedAt = "2026-08-01T00:00:00Z")
        val second = workspace("ws_b", "/tmp/b", lastUsedAt = "2026-08-02T00:00:00Z")
        connection.files[WORKSPACES_PATH] = Json.encodeToString(listOf(first, second))
            .toByteArray(Charsets.UTF_8)

        store.touchWorkspace("/tmp/b")

        val saved = store.workspaces()
        assertEquals(first, saved[0])
        assertEquals(second.id, saved[1].id)
        assertEquals(second.name, saved[1].name)
        assertEquals(second.path, saved[1].path)
        assertEquals(second.createdAt, saved[1].createdAt)
        assertNotEquals(second.lastUsedAt, saved[1].lastUsedAt)
    }

    @Test
    fun touchWorkspaceLeavesTheFileAloneForAnUnknownPath() = runTest {
        val connection = FakeSshConnection()
        val store = SshSessionStore(connection, HOME)
        val first = workspace("ws_a", "/tmp/a")
        connection.files[WORKSPACES_PATH] = Json.encodeToString(listOf(first))
            .toByteArray(Charsets.UTF_8)
        val before = connection.files.getValue(WORKSPACES_PATH).copyOf()

        store.touchWorkspace("/tmp/not-saved")

        assertEquals(before.toList(), connection.files.getValue(WORKSPACES_PATH).toList())
    }

    private fun workspace(
        id: String,
        path: String,
        lastUsedAt: String = "2026-08-01T00:00:00Z",
    ) = HostWorkspace(
        id = id,
        name = id,
        path = path,
        createdAt = "2026-08-01T00:00:00Z",
        lastUsedAt = lastUsedAt,
    )

    private class FakeSshConnection : SshConnection {
        val files = mutableMapOf<String, ByteArray>()

        override val isConnected: Boolean = true

        override suspend fun exec(command: String): SshExecChannel = error("unused")

        override suspend fun readFile(path: String): ByteArray =
            files[path] ?: error("missing file: $path")

        override suspend fun writeFile(path: String, content: ByteArray) {
            files[path] = content
        }

        override suspend fun rename(oldPath: String, newPath: String) {
            files[newPath] = files.remove(oldPath) ?: error("missing file: $oldPath")
        }

        override suspend fun list(path: String): List<SshFileEntry> = error("unused")

        override suspend fun stat(path: String): SshFileEntry? = error("unused")

        override suspend fun mkdir(path: String) = error("unused")

        override suspend fun remove(path: String) = error("unused")

        override suspend fun realPath(path: String): String = error("unused")

        override fun close() = Unit
    }

    private companion object {
        const val HOME = "/home/u"
        const val WORKSPACES_PATH = "$HOME/.harold/workspaces.json"
    }
}
