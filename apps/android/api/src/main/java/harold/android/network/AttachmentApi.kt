package harold.android.network

import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentUploadRequest

/** Upload surface for chat attachments. Workspace-scoped. */
interface AttachmentApi {
    suspend fun uploadAttachment(
        connectionId: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor>

    suspend fun deleteAttachment(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        attachmentId: String,
    ): Result<Unit>
}
