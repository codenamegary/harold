package harold.android.workspaces.data

import androidx.room.Entity
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState

@Entity(
    tableName = "workspaces",
    primaryKeys = ["serverOrigin", "id"],
)
data class WorkspaceEntity(
    val serverOrigin: String,
    val id: String,
    val name: String,
    val path: String,
    val state: String,
    val createdAt: String,
    val lastUsedAt: String,
    val position: Int,
)

fun WorkspaceEntity.toWorkspace(): Workspace = Workspace(
    id = id,
    name = name,
    path = path,
    state = state.toWorkspaceState(),
    createdAt = createdAt,
    lastUsedAt = lastUsedAt,
)

fun Workspace.toEntity(
    serverOrigin: String,
    position: Int,
): WorkspaceEntity = WorkspaceEntity(
    serverOrigin = serverOrigin,
    id = id,
    name = name,
    path = path,
    state = state.name,
    createdAt = createdAt,
    lastUsedAt = lastUsedAt,
    position = position,
)

private fun String.toWorkspaceState(): WorkspaceState =
    WorkspaceState.entries.firstOrNull { state -> state.name == this } ?: WorkspaceState.Unavailable
