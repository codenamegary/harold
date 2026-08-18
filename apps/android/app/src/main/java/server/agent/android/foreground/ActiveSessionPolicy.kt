package server.agent.android.foreground

import server.agent.android.contracts.SessionState

data class ActiveSessionSnapshot(
    val id: String,
    val name: String,
    val state: SessionState,
)

data class NotificationCopy(
    val title: String,
    val text: String,
)

fun isUserVisibleActive(state: SessionState): Boolean =
    when (state) {
        SessionState.Starting,
        SessionState.Running,
        SessionState.AwaitingPermission,
        SessionState.Stopping,
        -> true
        SessionState.Idle,
        SessionState.Offline,
        SessionState.Error,
        -> false
    }

fun notificationStateLabel(state: SessionState): String =
    when (state) {
        SessionState.Starting -> "Starting"
        SessionState.Running -> "Running"
        SessionState.AwaitingPermission -> "Needs permission"
        SessionState.Stopping -> "Stopping"
        SessionState.Idle -> "Idle"
        SessionState.Offline -> "Offline"
        SessionState.Error -> "Error"
    }

/**
 * Higher attention wins. AwaitingPermission outranks Running, then Starting, then Stopping.
 */
fun activeStatePriority(state: SessionState): Int =
    when (state) {
        SessionState.AwaitingPermission -> 4
        SessionState.Running -> 3
        SessionState.Starting -> 2
        SessionState.Stopping -> 1
        else -> 0
    }

fun aggregateActiveLabel(sessions: List<ActiveSessionSnapshot>): String {
    val active = sessions.filter { snapshot -> isUserVisibleActive(snapshot.state) }
    require(active.isNotEmpty()) { "aggregate label needs at least one active session" }

    val top = active.maxBy { snapshot -> activeStatePriority(snapshot.state) }
    return notificationStateLabel(top.state)
}

fun notificationCopy(sessions: List<ActiveSessionSnapshot>): NotificationCopy {
    val active = sessions.filter { snapshot -> isUserVisibleActive(snapshot.state) }
    require(active.isNotEmpty()) { "notification copy needs at least one active session" }

    val title = "Agent Server"
    val text = if (active.size == 1) {
        val session = active.first()
        "${session.name} · ${notificationStateLabel(session.state)}"
    } else {
        "${active.size} active sessions · ${aggregateActiveLabel(active)}"
    }

    return NotificationCopy(title = title, text = text)
}

fun highestPriorityActiveSession(
    sessions: List<ActiveSessionSnapshot>,
): ActiveSessionSnapshot? {
    val active = sessions.filter { snapshot -> isUserVisibleActive(snapshot.state) }
    if (active.isEmpty()) {
        return null
    }

    return active.maxWith(
        compareBy<ActiveSessionSnapshot> { snapshot -> activeStatePriority(snapshot.state) }
            .thenBy { snapshot -> snapshot.id },
    )
}
