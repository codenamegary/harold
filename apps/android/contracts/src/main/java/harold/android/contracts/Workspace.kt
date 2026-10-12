package harold.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class WorkspaceState {
    @SerialName("available")
    Available,

    @SerialName("missing")
    Missing,

    @SerialName("unavailable")
    Unavailable,
}

@Serializable
data class Workspace(
    val id: String,
    val name: String,
    val path: String,
    val state: WorkspaceState,
    val createdAt: String,
    val lastUsedAt: String,
)

typealias WorkspaceCollection = ItemCollection<Workspace>
