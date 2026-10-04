package harold.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class AttachmentKind {
    @SerialName("image")
    Image,

    @SerialName("file")
    File,
}

@Serializable
data class AttachmentDescriptor(
    val id: String,
    val workspaceId: String,
    val name: String,
    val mimeType: String,
    val kind: AttachmentKind,
    val size: Long,
    val path: String,
)

/**
 * Prompt-carryable reference. The client echoes the descriptor fields it got
 * from the upload response; the server re-validates the path before mapping
 * to a content block.
 */
@Serializable
data class AttachmentReference(
    val kind: AttachmentKind,
    val name: String,
    val mimeType: String,
    val path: String,
)
