package harold.android.host

import harold.android.network.SessionFolderProbe
import harold.android.network.SessionFolderState
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException

/**
 * Checks a session working folder over the saved SSH connection. A failed
 * check is unknown, never missing: a dead link or a permission error must not
 * hide a session the host can still open.
 */
@Singleton
class HostSessionFolderProbe @Inject constructor(
    private val connections: HostConnections,
) : SessionFolderProbe {
    override suspend fun probe(connectionId: String, path: String): SessionFolderState =
        try {
            connections.useConnection(connectionId) { connection, _ ->
                val entry = connection.stat(path)
                if (entry?.directory == true) {
                    SessionFolderState.Available
                } else {
                    SessionFolderState.Missing
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            SessionFolderState.Unknown
        }
}
