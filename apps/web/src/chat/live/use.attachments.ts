import { useCallback, useRef, useState } from "react"
import { AttachmentReference } from "contracts/http/attachments"
import { TranscriptAttachmentPreview } from "../transcript/rows"
import {
  deleteUploadedAttachment,
  uploadAttachment,
  UploadedAttachment,
} from "../../attachments/upload.attachment"

export type PendingAttachment = {
  localId: string
  file: File
  kind: "image" | "file"
  name: string
  size: number
  previewUrl?: string
  status: "uploading" | "ready" | "failed"
  uploaded?: UploadedAttachment
  error?: string
}

export const inferAttachmentKind = (file: File): "image" | "file" =>
  file.type.startsWith("image/") ? "image" : "file"

export type ChatAttachments = {
  attachments: ReadonlyArray<PendingAttachment>
  addFiles: (files: FileList | File[]) => void
  remove: (localId: string) => void
  retry: (localId: string) => void
  /** Waits for in-flight uploads, then returns prompt references. Null when any upload failed. */
  resolveForSend: () => Promise<AttachmentReference[] | null>
  /** Snapshot for optimistic transcript rendering. Call before clear(). */
  beginTurnPreview: () => TranscriptAttachmentPreview[]
  clear: () => void
}

let localIdCounter = 0
const nextLocalId = () => `att_local_${++localIdCounter}`

export const useChatAttachments = (params: {
  workspaceId: string
}): ChatAttachments => {
  const [attachments, setAttachments] = useState<ReadonlyArray<PendingAttachment>>([])
  const resolvers = useRef(new Map<string, () => void>())
  const completed = useRef(new Set<string>())
  const uploadedByLocalId = useRef(new Map<string, UploadedAttachment>())

  const patch = useCallback(
    (localId: string, update: Partial<PendingAttachment>) => {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.localId === localId ? { ...attachment, ...update } : attachment,
        ),
      )
    },
    [],
  )

  const startUpload = useCallback(
    (attachment: PendingAttachment, workspaceId: string) => {
      uploadAttachment({
        workspaceId,
        file: attachment.file,
        kind: attachment.kind,
      })
        .then((uploaded) => {
          completed.current.add(attachment.localId)
          uploadedByLocalId.current.set(attachment.localId, uploaded)
          patch(attachment.localId, { status: "ready", uploaded })
          resolvers.current.get(attachment.localId)?.()
          resolvers.current.delete(attachment.localId)
        })
        .catch((error: unknown) => {
          completed.current.delete(attachment.localId)
          patch(attachment.localId, {
            status: "failed",
            error:
              error instanceof Error ? error.message : "Upload failed",
          })
          resolvers.current.delete(attachment.localId)
        })
    },
    [patch],
  )

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) {
        return
      }
      const created: PendingAttachment[] = list.map((file) => {
        const kind = inferAttachmentKind(file)
        return {
          localId: nextLocalId(),
          file,
          kind,
          name: file.name.length > 0 ? file.name : "pasted-image.png",
          size: file.size,
          previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
          status: "uploading",
        }
      })
      setAttachments((current) => [...current, ...created])
      for (const attachment of created) {
        startUpload(attachment, params.workspaceId)
      }
    },
    [params.workspaceId, startUpload],
  )

  const remove = useCallback(
    (localId: string) => {
      const attachment = attachments.find((candidate) => candidate.localId === localId)
      if (attachment?.status === "ready" && attachment.uploaded !== undefined) {
        void deleteUploadedAttachment({
          workspaceId: params.workspaceId,
          attachmentId: attachment.uploaded.id,
        })
      }
      resolvers.current.delete(localId)
      completed.current.delete(localId)
      uploadedByLocalId.current.delete(localId)
      setAttachments((current) =>
        current.filter((candidate) => candidate.localId !== localId),
      )
    },
    [attachments, params.workspaceId],
  )

  const retry = useCallback(
    (localId: string) => {
      const attachment = attachments.find((candidate) => candidate.localId === localId)
      if (attachment === undefined || attachment.status !== "failed") {
        return
      }
      completed.current.delete(localId)
      patch(localId, { status: "uploading", error: undefined })
      startUpload({ ...attachment, status: "uploading" }, params.workspaceId)
    },
    [attachments, params.workspaceId, patch, startUpload],
  )

  const resolveForSend = useCallback((): Promise<AttachmentReference[] | null> => {
    const uploading = attachments.filter((attachment) => attachment.status === "uploading")
    const failed = attachments.filter((attachment) => attachment.status === "failed")

    // Reads the live uploaded map, not the state snapshot, so uploads that
    // landed between render and send are never dropped.
    const collect = (): AttachmentReference[] =>
      attachments
        .filter((attachment) => attachment.status !== "failed")
        .flatMap((attachment) => {
          const uploaded = uploadedByLocalId.current.get(attachment.localId)
          if (uploaded === undefined) {
            return []
          }
          return [
            {
              kind: attachment.kind,
              name: attachment.name,
              mimeType:
                attachment.file.type.length > 0
                  ? attachment.file.type
                  : "application/octet-stream",
              path: uploaded.path,
            },
          ]
        })

    if (failed.length > 0) {
      return Promise.resolve(null)
    }
    const stillInFlight = uploading.filter(
      (attachment) => !completed.current.has(attachment.localId),
    )
    if (stillInFlight.length === 0) {
      return Promise.resolve(collect())
    }
    return Promise.all(
      stillInFlight.map(
        (attachment) =>
          new Promise<void>((resolve) => {
            resolvers.current.set(attachment.localId, resolve)
          }),
      ),
    ).then(() => collect())
  }, [attachments])

  const beginTurnPreview = useCallback(
    (): TranscriptAttachmentPreview[] =>
      attachments.map((attachment) => ({
        kind: attachment.kind,
        name: attachment.name,
        size: attachment.size,
        previewUrl: attachment.previewUrl,
      })),
    [attachments],
  )

  const clear = useCallback(() => {
    setAttachments([])
  }, [])

  return {
    attachments,
    addFiles,
    remove,
    retry,
    resolveForSend,
    beginTurnPreview,
    clear,
  }
}
