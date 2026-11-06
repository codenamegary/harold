package harold.android.transport.direct

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/** Active direct sessions. One process per app connection, keyed by the roster id. */
@Singleton
class SshAcpRegistry @Inject constructor() {
    private val sessions = ConcurrentHashMap<String, SshAcpSession>()

    fun register(session: SshAcpSession) {
        sessions[key(session.connectionId, session.agentId, session.sessionId)] = session
    }

    fun remove(session: SshAcpSession) {
        sessions.remove(key(session.connectionId, session.agentId, session.sessionId), session)
    }

    fun find(connectionId: String, agentId: String, sessionId: String): SshAcpSession? =
        sessions[key(connectionId, agentId, sessionId)]

    fun all(): List<SshAcpSession> = sessions.values.toList()

    private fun key(connectionId: String, agentId: String, sessionId: String): String =
        "$connectionId|$agentId|$sessionId"
}
