package harold.android.chat

import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState

data class WorkspaceRow(
    val id: String,
    val name: String,
    val path: String,
    val state: WorkspaceState,
    /** Host workspace id. Unlike [id], this is never connection-scoped. */
    val workspaceId: String = id,
    val lastUsedAt: String = "",
    val connectionId: String = "",
    val connectionName: String = "",
    val connectionColorId: String = "",
    val connectionIconId: String = "",
    val pickerSuffix: String = "",
) {
    fun pickerLabel(): String =
        if (pickerSuffix.isEmpty()) {
            name
        } else {
            "$name ($pickerSuffix)"
        }
}

fun Workspace.toWorkspaceRow(): WorkspaceRow =
    WorkspaceRow(
        id = id,
        name = name,
        path = path,
        state = state,
        workspaceId = id,
        lastUsedAt = lastUsedAt,
    )
