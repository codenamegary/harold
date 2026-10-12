package harold.android.chat

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentReference

enum class AttachmentUploadStatus { Uploading, Ready, Failed }

data class PendingAttachmentUi(
    val localId: String,
    val name: String,
    val size: Long,
    val kind: AttachmentKind,
    val mimeType: String,
    val bytes: ByteArray,
    val status: AttachmentUploadStatus = AttachmentUploadStatus.Uploading,
    val error: String? = null,
    val uploadedPath: String? = null,
    val uploadedId: String? = null,
    val preview: ImageBitmap? = null,
) {
    fun toReference(): AttachmentReference? {
        val path = uploadedPath ?: return null
        return AttachmentReference(
            kind = kind,
            name = name,
            mimeType = mimeType.ifEmpty { "application/octet-stream" },
            path = path,
        )
    }

    /**
     * Equality covers every UI-visible field. The chips live in a
     * MutableStateFlow, which conflates structurally-equal values, so any
     * field that changes after creation (status, error, upload result,
     * preview) must participate — otherwise a copied chip stays "equal" to
     * the previous state and the composer never re-renders the change. Only
     * [bytes] is excluded on purpose: it is large and never rendered.
     */
    override fun equals(other: Any?): Boolean =
        other is PendingAttachmentUi &&
            other.localId == localId &&
            other.status == status &&
            other.error == error &&
            other.uploadedPath == uploadedPath &&
            other.uploadedId == uploadedId &&
            other.preview === preview

    override fun hashCode(): Int = localId.hashCode()
}

/** Decode image previews off the main thread; null for non-images or failures. */
fun decodePreview(bytes: ByteArray, kind: AttachmentKind): ImageBitmap? {
    if (kind != AttachmentKind.Image) {
        return null
    }
    return try {
        android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    } catch (_: Throwable) {
        null
    }
}
