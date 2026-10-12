package harold.android.navigation

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.navigation3.runtime.NavKey
import javax.inject.Inject
import dagger.hilt.android.scopes.ActivityRetainedScoped

enum class StartGate {
    Unknown,
    Paired,
    Unpaired,
}

/**
 * Owns the back stack for the activity. The start route is chosen once, after
 * the pairing gate resolves. Later moves are events from the screen that owns them.
 */
@ActivityRetainedScoped
class Navigator @Inject constructor() {
    val backStack: SnapshotStateList<NavKey> = mutableStateListOf()

    var startGate: StartGate = StartGate.Unknown
        private set

    private var pairingQueued: Boolean = false

    fun chooseStart(route: NavKey) {
        if (startGate != StartGate.Unknown) {
            return
        }
        val gate = when (route) {
            Chat -> StartGate.Paired
            Shell -> StartGate.Unpaired
            else -> return
        }
        startGate = gate
        backStack.add(route)
        if (pairingQueued) {
            pairingQueued = false
            openPairing()
        }
    }

    fun showChat() {
        if (startGate == StartGate.Unknown) {
            chooseStart(Chat)
            return
        }
        backStack.clear()
        backStack.add(Chat)
    }

    fun showShell() {
        if (startGate == StartGate.Unknown) {
            chooseStart(Shell)
            return
        }
        if (backStack.size == 1 && backStack.last() == Shell) {
            return
        }
        backStack.clear()
        backStack.add(Shell)
    }

    fun openPairing() {
        if (startGate == StartGate.Unknown) {
            pairingQueued = true
            return
        }
        if (backStack.lastOrNull() == Pairing) {
            return
        }
        backStack.add(Pairing)
    }

    fun openSessions() {
        backStack.add(Sessions)
    }

    fun openCreateSession() {
        backStack.add(CreateSession)
    }

    fun openWorkspaces() {
        backStack.add(Workspaces)
    }

    fun openAddWorkspace() {
        backStack.add(AddWorkspace)
    }

    fun goBack(): Boolean {
        if (backStack.size <= 1) {
            return false
        }
        backStack.removeAt(backStack.lastIndex)
        return true
    }
}
