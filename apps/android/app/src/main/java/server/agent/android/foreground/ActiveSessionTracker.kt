package server.agent.android.foreground

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import server.agent.android.contracts.SessionState

interface ActiveSessionTracker {
    val sessions: StateFlow<List<ActiveSessionSnapshot>>

    fun upsert(session: ActiveSessionSnapshot)

    fun remove(sessionId: String)

    fun replaceAll(sessions: List<ActiveSessionSnapshot>)
}

class DefaultActiveSessionTracker : ActiveSessionTracker {
    private val _sessions = MutableStateFlow<List<ActiveSessionSnapshot>>(emptyList())
    override val sessions: StateFlow<List<ActiveSessionSnapshot>> = _sessions.asStateFlow()

    override fun upsert(session: ActiveSessionSnapshot) {
        _sessions.update { current ->
            val without = current.filterNot { row -> row.id == session.id }
            if (isUserVisibleActive(session.state)) {
                without + session
            } else {
                without
            }
        }
    }

    override fun remove(sessionId: String) {
        _sessions.update { current ->
            current.filterNot { row -> row.id == sessionId }
        }
    }

    override fun replaceAll(sessions: List<ActiveSessionSnapshot>) {
        _sessions.value = sessions.filter { snapshot -> isUserVisibleActive(snapshot.state) }
    }
}

fun SessionState.toActiveSnapshot(id: String, name: String): ActiveSessionSnapshot =
    ActiveSessionSnapshot(id = id, name = name, state = this)
