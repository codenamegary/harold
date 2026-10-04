package harold.android.contracts

data class AttachmentUploadRequest(
    val workspaceId: String,
    val fileName: String,
    val mimeType: String,
    val bytes: ByteArray,
    val kind: AttachmentKind? = null,
)
