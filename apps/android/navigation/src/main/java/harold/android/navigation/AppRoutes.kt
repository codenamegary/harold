package harold.android.navigation

import androidx.navigation3.runtime.NavKey
import harold.android.contracts.AgentId
import harold.android.contracts.GitScope
import kotlinx.serialization.Serializable

@Serializable
sealed interface AppRoute : NavKey

@Serializable
data object Shell : AppRoute

@Serializable
data object AddConnection : AppRoute

@Serializable
data object SshSetup : AppRoute

@Serializable
data object Pairing : AppRoute

@Serializable
data object Chat : AppRoute

@Serializable
data object Sessions : AppRoute

@Serializable
data object CreateSession : AppRoute

@Serializable
data object Workspaces : AppRoute

@Serializable
data object AddWorkspace : AppRoute

@Serializable
data object SavedHarolds : AppRoute

@Serializable
data class Changes(
    val serverOrigin: String,
    val agentId: AgentId,
    val sessionId: String,
    val cwd: String,
    val worktreePath: String? = null,
) : AppRoute

@Serializable
data class FileDiff(
    val serverOrigin: String,
    val worktreePath: String,
    val scope: GitScope,
    val filePath: String,
    val oldPath: String? = null,
) : AppRoute
