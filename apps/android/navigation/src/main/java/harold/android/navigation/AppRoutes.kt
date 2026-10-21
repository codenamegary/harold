package harold.android.navigation

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable
sealed interface AppRoute : NavKey

@Serializable
data object Shell : AppRoute

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
