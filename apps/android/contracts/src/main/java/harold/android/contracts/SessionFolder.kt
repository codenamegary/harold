package harold.android.contracts

import kotlinx.serialization.Serializable

/**
 * A working directory a recent session used. These are hints only: they are
 * never saved workspaces and never carry a workspace id.
 */
@Serializable
data class SessionFolder(
    val id: String,
    val name: String,
    val path: String,
    val lastUsedAt: String,
)

typealias SessionFolderCollection = ItemCollection<SessionFolder>
