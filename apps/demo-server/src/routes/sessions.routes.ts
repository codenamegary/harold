import { randomUUID } from "node:crypto"
import { DemoRouteContext } from "../demo.context"
import { queryValue } from "../demo.context"
import { configOptionType, configOptionsFor, isKnownConfigId } from "../fixtures/config.options"
import {
  HAROLD_LOGO_ATTACHMENT,
  ITS_NOT_DNS_ATTACHMENT,
  DemoAttachmentDescriptor,
} from "../fixtures/attachments"
import { gitWorktreesFor, workspaceGitKind } from "../fixtures/git"
import { DemoSession } from "../demo.state"
import { cancelPromptTurn, startPromptTurn } from "../sse/turn.runner"
import {
  badRequest,
  conflict,
  discardBody,
  jsonResponse,
  noContentResponse,
  notFound,
  readJsonObject,
  readMultipartFileContentType,
  readString,
  unprocessable,
  unsupportedMediaType,
} from "./http"

const wireSession = (session: DemoSession) => ({
  agentId: session.agentId,
  sessionId: session.id,
  cwd: session.cwd,
  title: session.title,
  updatedAt: session.updatedAt,
  worktreePath: session.worktreePath,
})

const findSession = (
  context: DemoRouteContext,
  sessionId: string,
  agentId?: string,
): DemoSession | null => {
  const session = context.store.getSession(context.deviceId, sessionId)
  if (session === undefined) {
    return null
  }
  if (agentId !== undefined && session.agentId !== agentId) {
    return null
  }
  return session
}

export const listSessionsResponse = (context: DemoRouteContext): Response => {
  const cwd = queryValue(context.url, "cwd")
  const sessions = context.store.listSessions(context.deviceId, cwd)
  return jsonResponse({ items: sessions.map(wireSession) })
}

export const createSessionResponse = async (context: DemoRouteContext): Promise<Response> => {
  const body = await readJsonObject(context.request)
  if (body === null) {
    return badRequest("#", "validation.body.invalid")
  }

  const agentId = readString(body, "agentId", 1, 120)
  if (agentId === null) {
    return badRequest("#/agentId", "validation.agentId.invalid")
  }

  const cwd = readString(body, "cwd", 1, 4_096)
  if (cwd === null) {
    return badRequest("#/cwd", "validation.cwd.invalid")
  }

  const created = context.store.createSession({
    deviceId: context.deviceId,
    agentId,
    cwd,
  })
  if (!created.ok) {
    if (created.reason === "session_limit") {
      return conflict("This demo device has reached its session limit")
    }
    return notFound("Session could not be created")
  }

  return jsonResponse(
    {
      ...wireSession(created.session),
      configOptions: configOptionsFor(created.session.configValues),
    },
    201,
  )
}

export const deleteSessionResponse = (context: DemoRouteContext, sessionId: string): Response => {
  const agentId = queryValue(context.url, "agentId")
  if (agentId === undefined) {
    return badRequest("#/agentId", "validation.agentId.invalid")
  }
  if (findSession(context, sessionId, agentId) === null) {
    return notFound("Session not found")
  }
  context.store.deleteSession(context.deviceId, sessionId)
  return noContentResponse()
}

export const setWorktreePathResponse = async (
  context: DemoRouteContext,
  sessionId: string,
): Promise<Response> => {
  const body = await readJsonObject(context.request)
  if (body === null) {
    return badRequest("#", "validation.body.invalid")
  }

  const agentId = readString(body, "agentId", 1, 120)
  if (agentId === null) {
    return badRequest("#/agentId", "validation.agentId.invalid")
  }

  const worktreePathValue = body.worktreePath
  if (
    worktreePathValue !== null &&
    (typeof worktreePathValue !== "string" || worktreePathValue.length === 0)
  ) {
    return badRequest("#/worktreePath", "validation.worktreePath.invalid")
  }
  const worktreePath = worktreePathValue === null ? null : worktreePathValue

  const session = findSession(context, sessionId, agentId)
  if (session === null) {
    return notFound("Session not found")
  }

  if (worktreePath !== null) {
    const kind = workspaceGitKind(session.cwd)
    const paths = gitWorktreesFor(kind, session.cwd).map((worktree) => worktree.path)
    if (!paths.includes(worktreePath)) {
      return unprocessable("That worktree path does not belong to this workspace")
    }
  }

  session.worktreePath = worktreePath
  context.store.broadcast(context.deviceId, session.id, {
    type: "session_worktree_path",
    agentId: session.agentId,
    sessionId: session.id,
    worktreePath,
  })
  return noContentResponse()
}

export const setConfigOptionResponse = async (
  context: DemoRouteContext,
  sessionId: string,
  configId: string,
): Promise<Response> => {
  const agentId = queryValue(context.url, "agentId")
  if (agentId === undefined) {
    return badRequest("#/agentId", "validation.agentId.invalid")
  }

  const session = findSession(context, sessionId, agentId)
  if (session === null) {
    return notFound("Session not found")
  }
  if (!isKnownConfigId(configId)) {
    return unprocessable("Unknown config option")
  }

  const body = await readJsonObject(context.request)
  if (body === null) {
    return badRequest("#", "validation.body.invalid")
  }

  const value = body.value
  const expected = configOptionType(configId)
  const valid = expected === "boolean" ? typeof value === "boolean" : typeof value === "string"
  if (!valid) {
    return unprocessable("Config option value has the wrong type")
  }

  session.configValues.set(configId, value as string | boolean)
  context.store.broadcast(context.deviceId, session.id, {
    type: "session_config",
    agentId: session.agentId,
    sessionId: session.id,
    configOptions: configOptionsFor(session.configValues),
  })
  return new Response(null, { status: 202 })
}

export const promptSessionResponse = async (
  context: DemoRouteContext,
  sessionId: string,
): Promise<Response> => {
  const agentId = queryValue(context.url, "agentId")
  if (agentId === undefined) {
    return badRequest("#/agentId", "validation.agentId.invalid")
  }

  const session = findSession(context, sessionId, agentId)
  if (session === null) {
    return notFound("Session not found")
  }

  // Prompt text is never parsed, buffered, logged, or stored.
  await discardBody(context.request)

  const result = startPromptTurn({
    store: context.store,
    deviceId: context.deviceId,
    session,
    ...(context.options.turnDelayMs === undefined ? {} : { delayMs: context.options.turnDelayMs }),
    ...(context.options.randomInt === undefined ? {} : { randomInt: context.options.randomInt }),
    ...(context.options.interactionTimeoutMs === undefined
      ? {}
      : { interactionTimeoutMs: context.options.interactionTimeoutMs }),
  })

  if (result === "session_missing") {
    return notFound("Session not found")
  }
  if (result === "busy") {
    return conflict("This demo session already has a turn in progress")
  }

  return new Response(null, { status: 202 })
}

export const cancelSessionResponse = (context: DemoRouteContext, sessionId: string): Response => {
  const agentId = queryValue(context.url, "agentId")
  if (agentId === undefined) {
    return badRequest("#/agentId", "validation.agentId.invalid")
  }

  const session = findSession(context, sessionId, agentId)
  if (session === null) {
    return notFound("Session not found")
  }

  void discardBody(context.request)
  cancelPromptTurn({ store: context.store, deviceId: context.deviceId, session })
  return noContentResponse()
}

export const uploadAttachmentResponse = async (
  context: DemoRouteContext,
  sessionId: string,
): Promise<Response> => {
  const agentId = queryValue(context.url, "agentId")
  if (agentId === undefined) {
    return badRequest("#/agentId", "validation.agentId.invalid")
  }

  const session = findSession(context, sessionId, agentId)
  if (session === null) {
    return notFound("Session not found")
  }

  const parsed = await readMultipartFileContentType(context.request)
  if (!parsed.ok) {
    return unsupportedMediaType("Expected multipart/form-data with a file part")
  }

  const template = parsed.contentType?.startsWith("image/")
    ? HAROLD_LOGO_ATTACHMENT
    : ITS_NOT_DNS_ATTACHMENT
  const descriptor: DemoAttachmentDescriptor = {
    id: `att_demo_${randomUUID()}`,
    ...template,
  }
  session.attachments.set(descriptor.id, descriptor)
  return jsonResponse(descriptor, 201)
}

export const deleteAttachmentResponse = (
  context: DemoRouteContext,
  sessionId: string,
  attachmentId: string,
): Response => {
  const agentId = queryValue(context.url, "agentId")
  if (agentId === undefined) {
    return badRequest("#/agentId", "validation.agentId.invalid")
  }

  const session = findSession(context, sessionId, agentId)
  if (session === null) {
    return notFound("Session not found")
  }

  if (!session.attachments.delete(attachmentId)) {
    return notFound("Attachment not found")
  }
  return noContentResponse()
}
