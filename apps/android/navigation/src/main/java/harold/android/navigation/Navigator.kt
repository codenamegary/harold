package harold.android.navigation

import android.os.Bundle
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.savedstate.SavedStateRegistry
import dagger.hilt.android.scopes.ActivityRetainedScoped
import javax.inject.Inject
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

private const val SAVED_STATE_KEY = "harold.navigation"
private const val BACK_STACK_KEY = "back_stack"
private val backStackSerializer = ListSerializer(AppRoute.serializer())

/**
 * Owns the back stack for the activity. An empty stack means the pairing gate
 * has not resolved yet. The start route is chosen once. Later moves are events
 * from the screen that owns them.
 */
@ActivityRetainedScoped
class Navigator @Inject constructor() {
    val backStack: SnapshotStateList<AppRoute> = mutableStateListOf()

    private var pairingQueued: Boolean = false

    /**
     * Saves the stack with the activity so it comes back after process death.
     * The navigator itself already survives configuration changes.
     */
    fun attach(registry: SavedStateRegistry) {
        val restored = registry.consumeRestoredStateForKey(SAVED_STATE_KEY)?.getString(BACK_STACK_KEY)
        if (restored != null && backStack.isEmpty()) {
            restore(restored)
        }
        registry.registerSavedStateProvider(SAVED_STATE_KEY) {
            Bundle().apply { putString(BACK_STACK_KEY, encode()) }
        }
    }

    fun start(paired: Boolean) {
        if (backStack.isNotEmpty()) {
            return
        }
        replaceWith(if (paired) Chat else Shell)
    }

    fun showChat() {
        replaceWith(Chat)
    }

    fun showShell() {
        if (backStack.singleOrNull() == Shell) {
            return
        }
        replaceWith(Shell)
    }

    fun openPairing() {
        if (backStack.isEmpty()) {
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

    fun openSavedHarolds() {
        if (backStack.isEmpty() || backStack.lastOrNull() == SavedHarolds) {
            return
        }
        backStack.add(SavedHarolds)
    }

    fun goBack(): Boolean {
        if (backStack.size <= 1) {
            return false
        }
        backStack.removeAt(backStack.lastIndex)
        return true
    }

    internal fun encode(): String = Json.encodeToString(backStackSerializer, backStack.toList())

    internal fun restore(encoded: String) {
        val routes = runCatching { Json.decodeFromString(backStackSerializer, encoded) }
            .getOrNull()
            .orEmpty()
        if (routes.isEmpty()) {
            return
        }
        backStack.clear()
        backStack.addAll(routes)
    }

    private fun replaceWith(root: AppRoute) {
        backStack.clear()
        backStack.add(root)
        if (pairingQueued) {
            pairingQueued = false
            openPairing()
        }
    }
}
