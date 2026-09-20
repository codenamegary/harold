import { ulid } from "ulid"
import { ATTACHMENT_ID_PREFIX } from "./attachments.file.name"
import { CreateAttachmentId } from "./attachments.ports"

export const createAttachmentId: CreateAttachmentId = () => `${ATTACHMENT_ID_PREFIX}${ulid()}`
