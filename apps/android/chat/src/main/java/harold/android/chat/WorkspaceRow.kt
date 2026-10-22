package harold.android.chat

import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState

data class WorkspaceRow(
    val id: String,
    val name: String,
    val path: String,
    val state: WorkspaceState,
    val serverOrigin: String = "",
    val haroldName: String = "",
    val haroldColorId: String = "",
    val haroldIconId: String = "",
) {
    fun pickerLabel(): String = if (haroldName.isEmpty()) {
        name
    } else {
        "$name · $haroldName · $haroldColorId · $haroldIconId"
    }
}

fun Workspace.toWorkspaceRow(): WorkspaceRow =
    WorkspaceRow(
        id = id,
        name = name,
        path = path,
        state = state,
    )
