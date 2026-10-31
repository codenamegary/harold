package harold.android.chat

import harold.android.contracts.SessionState

fun sessionStatusLabel(state: SessionState): String =
    when (state) {
        SessionState.Starting -> "Starting"
        SessionState.Idle -> "Idle"
        SessionState.Running -> "Running"
        SessionState.AwaitingPermission -> "Awaiting permission"
        SessionState.AwaitingAnswer -> "Awaiting answer"
        SessionState.Stopping -> "Stopping"
        SessionState.Offline -> "Offline"
        SessionState.Error -> "Error"
    }

fun sessionProgressMessage(state: SessionState?): String? =
    when (state) {
        SessionState.Starting -> "Session starting…"
        SessionState.Running -> "Session running…"
        SessionState.AwaitingPermission -> "Waiting for permission…"
        SessionState.AwaitingAnswer -> "Waiting for answer…"
        SessionState.Stopping -> "Stopping session…"
        else -> null
    }
