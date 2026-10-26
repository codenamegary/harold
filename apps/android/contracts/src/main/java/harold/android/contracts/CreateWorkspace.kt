package harold.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class WorkspaceSource {
    @SerialName("folder")
    Folder,

    @SerialName("git")
    Git,
}

/**
 * `url` is only sent for the git source. Nulls are omitted by the encoder, so
 * each source serializes to exactly the fields its server schema accepts.
 */
@Serializable
data class CreateWorkspaceBody(
    val source: WorkspaceSource,
    val path: String,
    val name: String? = null,
    val url: String? = null,
)
