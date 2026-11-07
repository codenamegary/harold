package harold.android.navigation

import android.os.Bundle
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.savedstate.SavedStateRegistry
import harold.android.contracts.AgentId
import harold.android.contracts.GitScope
import dagger.hilt.android.scopes.ActivityRetainedScoped
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

data class CreatedWorkspaceResult(
    val workspaceId: String,
    val connectionId: String = "",
)

private const val SAVED_STATE_KEY = "connection.navigation"
private const val BACK_STACK_KEY = "back_stack"
private val backStackSerializer = ListSerializer(AppRoute.serializer())

/**
 * Owns the back stack for the activity. An empty stack means the start route
 * has not resolved yet. The start route is chosen once. Later moves are events
 * from the screen that owns them.
 */
@ActivityRetainedScoped
class Navigator @Inject constructor() {
    val backStack: SnapshotStateList<AppRoute> = mutableStateListOf()

    private var preferredAddWorkspaceConnection: String? = null
    private val workspaceCreatedChannel = Channel<CreatedWorkspaceResult>(Channel.CONFLATED)
    val workspaceCreated: Flow<CreatedWorkspaceResult> = workspaceCreatedChannel.receiveAsFlow()

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

    /** The connections list "Add connection" action opens SSH host setup. */
    fun openAddConnection() {
        if (backStack.isEmpty()) {
            return
        }
        if (backStack.lastOrNull() == SshSetup) {
            return
        }
        backStack.add(SshSetup)
    }

    fun openSshSetup() {
        if (backStack.isEmpty()) {
            return
        }
        if (backStack.lastOrNull() == SshSetup) {
            return
        }
        backStack.add(SshSetup)
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

    fun openAddWorkspace(preferredConnectionId: String = "") {
        preferredAddWorkspaceConnection = preferredConnectionId.takeIf { it.isNotEmpty() }
        workspaceCreatedChannel.tryReceive()
        backStack.add(AddWorkspace)
    }

    fun consumePreferredAddWorkspaceConnection(): String? {
        val origin = preferredAddWorkspaceConnection
        preferredAddWorkspaceConnection = null
        return origin
    }

    fun reportWorkspaceCreated(result: CreatedWorkspaceResult) {
        if (CreateSession in backStack) {
            workspaceCreatedChannel.trySend(result)
        }
    }

    fun openChanges(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        cwd: String,
        worktreePath: String?,
    ) {
        if (backStack.isEmpty()) {
            return
        }
        backStack.add(
            Changes(
                connectionId = connectionId,
                agentId = agentId,
                sessionId = sessionId,
                cwd = cwd,
                worktreePath = worktreePath,
            ),
        )
    }

    fun openFileDiff(
        connectionId: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String? = null,
    ) {
        if (backStack.isEmpty()) {
            return
        }
        backStack.add(
            FileDiff(
                connectionId = connectionId,
                worktreePath = worktreePath,
                scope = scope,
                filePath = filePath,
                oldPath = oldPath,
            ),
        )
    }

    fun openConnections() {
        if (backStack.isEmpty() || backStack.lastOrNull() == Connections) {
            return
        }
        backStack.add(Connections)
    }

    fun openAgents(connectionId: String) {
        if (backStack.isEmpty() || backStack.lastOrNull() == Agents(connectionId)) {
            return
        }
        backStack.add(Agents(connectionId))
    }

    fun openConnectionSettings(connectionId: String) {
        if (backStack.isEmpty() || backStack.lastOrNull() == ConnectionSettings(connectionId)) {
            return
        }
        backStack.add(ConnectionSettings(connectionId))
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
    }
}
