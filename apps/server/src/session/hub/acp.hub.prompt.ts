import { AcpSessionPromptStartResult } from "../../acp/supervisor/models"
import { AttachmentKind, AttachmentReference } from "contracts/http/attachments"
import { SessionHubPromptSession } from "./hub"

export type CreateAcpHubPromptSessionParams = {
  startPrompt: (params: {
    acpSessionId: string
    prompt: unknown
  }) => Promise<AcpSessionPromptStartResult>
  /**
   * Re-validates a client-supplied attachment reference against the session's
   * workspace: the path must resolve inside the workspace attachments folder
   * and the file must exist. Null means rejected.
   */
  resolveAttachment: (params: {
    sessionId: string
    reference: AttachmentReference
  }) => Promise<AttachmentReference | null>
  /**
   * Capability gate. `image` maps to promptCapabilities.image,
   * `file` to promptCapabilities.embeddedContext.
   */
  advertisesPromptCapability: (params: {
    agentId: string
    kind: AttachmentKind
  }) => boolean
}

const CAPABILITY_LABELS: Record<AttachmentKind, string> = {
  image: "promptCapabilities.image",
  file: "promptCapabilities.embeddedContext",
}

export const attachmentCapabilityFor = (kind: AttachmentKind): string =>
  CAPABILITY_LABELS[kind]

export const createAcpHubPromptSession = (
  params: CreateAcpHubPromptSessionParams,
): SessionHubPromptSession => {
  return async ({ sessionId, agentId, text, attachments }) => {
    const blocks: unknown[] = [{ type: "text", text }]

    for (const reference of attachments ?? []) {
      if (
        !params.advertisesPromptCapability({ agentId, kind: reference.kind })
      ) {
        return {
          ok: false,
          reason: `Agent does not advertise ${CAPABILITY_LABELS[reference.kind]} — cannot attach ${reference.name}`,
        }
      }

      const resolved = await params.resolveAttachment({
        sessionId,
        reference,
      })
      if (resolved === null) {
        return {
          ok: false,
          reason: `Attachment is no longer available: ${reference.name}`,
        }
      }

      blocks.push(
        reference.kind === "image"
          ? {
              type: "image",
              url: `file://${resolved.path}`,
              mimeType: reference.mimeType,
            }
          : {
              type: "resource_link",
              uri: `file://${resolved.path}`,
              name: reference.name,
              mimeType: reference.mimeType,
            },
      )
    }

    const started = await params.startPrompt({
      acpSessionId: sessionId,
      prompt: blocks,
    })
    if (!started.ok) {
      return {
        ok: false,
        reason: started.reason,
        ...(started.authRequired === true ? { authRequired: true } : {}),
      }
    }

    const completion = await started.completion
    if (!completion.ok) {
      return {
        ok: false,
        reason: completion.reason,
        ...(completion.authRequired === true ? { authRequired: true } : {}),
      }
    }

    return { ok: true }
  }
}
