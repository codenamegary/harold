package harold.android.navigation

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable
data object Shell : NavKey

@Serializable
data object Pairing : NavKey

@Serializable
data object Chat : NavKey

@Serializable
data object Sessions : NavKey

@Serializable
data object CreateSession : NavKey

@Serializable
data object Workspaces : NavKey

@Serializable
data object AddWorkspace : NavKey
