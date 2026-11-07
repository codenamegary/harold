package harold.android.chat

import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState

data class WorkspaceRow(
    val id: String,
    val name: String,
    val path: String,
    val state: WorkspaceState,
    val connectionId: String = "",
    val connectionName: String = "",
    val connectionColorId: String = "",
    val connectionIconId: String = "",
) {
    fun pickerLabel(): String = name
}

fun Workspace.toWorkspaceRow(): WorkspaceRow =
    WorkspaceRow(
        id = id,
        name = name,
        path = path,
        state = state,
    )
