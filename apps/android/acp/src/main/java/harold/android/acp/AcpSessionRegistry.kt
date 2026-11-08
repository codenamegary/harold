package harold.android.acp

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/** Active ACP sessions. One agent process per app connection, keyed by the roster id. */
@Singleton
class AcpSessionRegistry @Inject constructor() {
    private val sessions = ConcurrentHashMap<String, AcpSession>()

    fun register(session: AcpSession) {
        sessions[key(session.connectionId, session.agentId, session.sessionId)] = session
    }

    fun remove(session: AcpSession) {
        sessions.remove(key(session.connectionId, session.agentId, session.sessionId), session)
    }

    fun find(connectionId: String, agentId: String, sessionId: String): AcpSession? =
        sessions[key(connectionId, agentId, sessionId)]

    fun all(): List<AcpSession> = sessions.values.toList()

    private fun key(connectionId: String, agentId: String, sessionId: String): String =
        "$connectionId|$agentId|$sessionId"
}
