package harold.android.host

import harold.android.process.SessionFileService
import javax.inject.Inject
import javax.inject.Singleton

/** Reads and writes session files over one-shot SSH connections. */
@Singleton
class SshSessionFileService @Inject constructor(
    private val connections: HostConnections,
) : SessionFileService {
    override suspend fun readTextFile(connectionId: String, path: String): Result<String> =
        readBytes(connectionId, path).map { bytes -> bytes.toString(Charsets.UTF_8) }

    override suspend fun writeTextFile(
        connectionId: String,
        path: String,
        content: String,
    ): Result<Unit> = runCatching {
        connections.useConnection(connectionId) { connection, _ ->
            connection.writeFile(path, content.toByteArray(Charsets.UTF_8))
        }
    }

    override suspend fun readBytes(connectionId: String, path: String): Result<ByteArray> =
        runCatching {
            connections.useConnection(connectionId) { connection, _ ->
                connection.readFile(path)
            }
        }
}
