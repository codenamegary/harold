package harold.android.database.workspace

import androidx.room.Entity
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState

@Entity(
    tableName = "workspaces",
    primaryKeys = ["connectionId", "id"],
)
data class WorkspaceEntity(
    val connectionId: String,
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
    connectionId: String,
    position: Int,
): WorkspaceEntity = WorkspaceEntity(
    connectionId = connectionId,
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
