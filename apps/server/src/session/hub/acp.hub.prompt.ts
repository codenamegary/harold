import { AcpSessionPromptStartResult } from "../../acp/supervisor/models"
import { AttachmentKind, AttachmentReference } from "contracts/http/attachments"
import { SessionHubPromptSession } from "./hub"

export type ResolvedAttachment = {
  reference: AttachmentReference
  bytes: Uint8Array
}

export type CreateAcpHubPromptSessionParams = {
  startPrompt: (params: {
    acpSessionId: string
    prompt: unknown
  }) => Promise<AcpSessionPromptStartResult>
  /**
   * Re-validates a client-supplied attachment reference against the session's
   * workspace: the path must resolve inside the workspace attachments folder
   * and the file must exist. Returns the reference with its bytes (image
   * blocks embed base64 data per ACP v1). Null means rejected.
   */
  resolveAttachment: (params: {
    sessionId: string
    reference: AttachmentReference
  }) => Promise<ResolvedAttachment | null>
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

/**
 * ACP v1 content blocks. Image blocks embed base64 `data` — agents decode
 * that field (e.g. Cursor does Buffer.from(data, "base64")) and a file:// url
 * is not part of the v1 image shape. File attachments ride resource_link with
 * a file:// uri; agents resolve the path themselves (Cursor skips links
 * outside the project root, so workspace-scoped uploads are a requirement,
 * which the upload endpoint guarantees).
 */
export const buildPromptBlocks = async (
  text: string,
  attachments: ReadonlyArray<AttachmentReference> | undefined,
  deps: {
    resolveAttachment: CreateAcpHubPromptSessionParams["resolveAttachment"]
    sessionId: string
  },
): Promise<{ ok: true; blocks: unknown[] } | { ok: false; reason: string }> => {
  const blocks: unknown[] = [{ type: "text", text }]

  for (const reference of attachments ?? []) {
    const resolved = await deps.resolveAttachment({
      sessionId: deps.sessionId,
      reference,
    })
    if (resolved === null) {
      return {
        ok: false,
        reason: `Attachment is no longer available: ${reference.name}`,
      }
    }

    if (reference.kind === "image") {
      blocks.push({
        type: "image",
        data: Buffer.from(resolved.bytes).toString("base64"),
        mimeType: reference.mimeType,
      })
    } else {
      blocks.push({
        type: "resource_link",
        uri: `file://${resolved.reference.path}`,
        name: reference.name,
      })
    }
  }

  return { ok: true, blocks }
}

export const createAcpHubPromptSession = (
  params: CreateAcpHubPromptSessionParams,
): SessionHubPromptSession => {
  return async ({ sessionId, agentId, text, attachments }) => {
    for (const reference of attachments ?? []) {
      if (
        !params.advertisesPromptCapability({ agentId, kind: reference.kind })
      ) {
        return {
          ok: false,
          reason: `Agent does not advertise ${CAPABILITY_LABELS[reference.kind]} — cannot attach ${reference.name}`,
        }
      }
    }

    const built = await buildPromptBlocks(text, attachments, {
      resolveAttachment: params.resolveAttachment,
      sessionId,
    })
    if (!built.ok) {
      return built
    }

    const started = await params.startPrompt({
      acpSessionId: sessionId,
      prompt: built.blocks,
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
