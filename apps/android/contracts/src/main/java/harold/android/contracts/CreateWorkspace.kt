package harold.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class CreateWorkspaceBody(
    val name: String,
    val path: String,
)
