package server.agent.android.chat

import server.agent.android.contracts.SessionState

fun sessionStatusLabel(state: SessionState): String =
    when (state) {
        SessionState.Starting -> "Starting"
        SessionState.Idle -> "Idle"
        SessionState.Running -> "Running"
        SessionState.AwaitingPermission -> "Awaiting permission"
        SessionState.Stopping -> "Stopping"
        SessionState.Offline -> "Offline"
        SessionState.Error -> "Error"
    }

fun sessionProgressMessage(state: SessionState?): String? =
    when (state) {
        SessionState.Starting -> "Session starting…"
        SessionState.Running -> "Session running…"
        SessionState.AwaitingPermission -> "Waiting for permission…"
        SessionState.Stopping -> "Stopping session…"
        else -> null
    }
