import { randomUUID } from "node:crypto"
import { JOURNAL_SCHEMA_VERSION } from "contracts/events/journal-record"
import {
  PermissionRequest,
  PermissionRequestSchema,
  ResolvePermissionRequestBody,
} from "contracts/http/permission"
import { SessionBindingRegistry } from "../acp/client/session-binding-registry"
import { createAcpPermissionRecord } from "../acp/journal/sanitize.acp.update"
import { AcpJournalWriter } from "../acp/journal/acp.journal.writer"
import { SessionRepository } from "../session/repository"
import { SessionService } from "../session/service"
import { sanitizePermissionOptions } from "./sanitize.permission.options"

const ACP_PROTOCOL_VERSION = 1
const PERMISSION_CANCELLED_MESSAGE = "session cancelled before permission was answered"

type PermissionRespond = (result: unknown) => void
type PermissionRespondError = (code: number, message: string) => void

type PendingPermission = {
  requestId: string
  sessionId: string
  workspaceId: string
  turnId: string
  toolCallId: string
  toolName: string
  options: ReadonlyArray<PermissionRequest["options"][number]>
  createdAt: string
  jsonRpcId: string | number
  respond: PermissionRespond
  respondError: PermissionRespondError
  resolved: boolean
}

type PermissionRequestParams = {
  sessionId?: string
  toolCall?: { toolCallId?: string; name?: string }
  options?: unknown
}

export type PermissionServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: "not_found" | "conflict" | "validation" | "journal_failed"; detail?: string }

export type CreatePermissionServiceParams = {
  getSessionBindingRegistry: () => SessionBindingRegistry
  sessionRepository: SessionRepository
  sessionService: SessionService
  journalWriter: AcpJournalWriter
}

const nowIso = (): string => new Date().toISOString()

const toPermissionRequest = (pending: PendingPermission): PermissionRequest =>
  PermissionRequestSchema.parse({
    id: pending.requestId,
    sessionId: pending.sessionId,
    turnId: pending.turnId,
    toolCallId: pending.toolCallId,
    toolName: pending.toolName,
    status: pending.resolved ? "resolved" : "pending",
    options: [...pending.options],
    createdAt: pending.createdAt,
  })

export const createPermissionService = ({
  getSessionBindingRegistry,
  sessionRepository,
  sessionService,
  journalWriter,
}: CreatePermissionServiceParams) => {
  const pendingById = new Map<string, PendingPermission>()
  const pendingIdsBySession = new Map<string, Set<string>>()

  const addPending = (pending: PendingPermission) => {
    pendingById.set(pending.requestId, pending)
    const existing = pendingIdsBySession.get(pending.sessionId) ?? new Set<string>()
    pendingIdsBySession.set(pending.sessionId, new Set([...existing, pending.requestId]))
  }

  const removePending = (requestId: string) => {
    const pending = pendingById.get(requestId)
    if (pending === undefined) {
      return
    }

    const sessionPending = pendingIdsBySession.get(pending.sessionId)
    if (sessionPending === undefined) {
      return
    }

    const next = new Set([...sessionPending].filter((id) => id !== requestId))
    if (next.size === 0) {
      pendingIdsBySession.delete(pending.sessionId)
      return
    }

    pendingIdsBySession.set(pending.sessionId, next)
  }

  const deletePending = (requestId: string) => {
    const pending = pendingById.get(requestId)
    if (pending === undefined) {
      return
    }

    removePending(requestId)
    pendingById.delete(requestId)
  }

  const countPendingForSession = (sessionId: string): number =>
    pendingIdsBySession.get(sessionId)?.size ?? 0

  const listPendingForSession = (sessionId: string): PermissionRequest[] => {
    const ids = pendingIdsBySession.get(sessionId)
    if (ids === undefined) {
      return []
    }

    return [...ids]
      .map((id) => pendingById.get(id))
      .filter((pending): pending is PendingPermission => pending !== undefined && !pending.resolved)
      .map(toPermissionRequest)
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  const markAwaitingPermissionIfNeeded = (sessionId: string): void => {
    const session = sessionRepository.getById({ id: sessionId })
    if (!session.ok || session.value.state === "awaiting-permission") {
      return
    }

    sessionService.markAwaitingPermission({ id: sessionId })
  }

  const markRunningIfNoPending = (sessionId: string): void => {
    if (countPendingForSession(sessionId) > 0) {
      return
    }

    const session = sessionRepository.getById({ id: sessionId })
    if (!session.ok || session.value.state !== "awaiting-permission") {
      return
    }

    sessionService.markRunning({ id: sessionId })
  }

  const appendPermissionRequested = (pending: PendingPermission): PermissionServiceResult<void> => {
    const appendResult = journalWriter.appendAndPublish([
      createAcpPermissionRecord({
        occurredAt: pending.createdAt,
        workspaceId: pending.workspaceId,
        sessionId: pending.sessionId,
        turnId: pending.turnId,
        protocolVersion: ACP_PROTOCOL_VERSION,
        phase: "live",
        payload: {
          requestId: pending.requestId,
          toolCallId: pending.toolCallId,
          toolName: pending.toolName,
          options: [...pending.options],
        },
      }),
    ])

    if (!appendResult.ok) {
      return { ok: false, kind: "journal_failed" }
    }

    return { ok: true, value: undefined }
  }

  const appendPermissionResolved = (params: {
    pending: PendingPermission
    optionId: string
    outcome: "selected" | "cancelled"
  }): PermissionServiceResult<void> => {
    const occurredAt = nowIso()
    const result = journalWriter.runTransactional((tx) => {
      const appendResult = tx.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "session.permission.resolved",
          occurredAt,
          workspaceId: params.pending.workspaceId,
          sessionId: params.pending.sessionId,
          turnId: params.pending.turnId,
          payload: {
            requestId: params.pending.requestId,
            turnId: params.pending.turnId,
            toolCallId: params.pending.toolCallId,
            optionId: params.optionId,
            outcome: params.outcome,
          },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return {
        ok: true,
        value: undefined,
        appendedRecords: appendResult.value,
      }
    })

    if (!result.ok) {
      return { ok: false, kind: "journal_failed" }
    }

    return { ok: true, value: undefined }
  }

  const registerPending = async (input: {
    jsonRpcId: string | number
    params: unknown
    respond: PermissionRespond
    respondError: PermissionRespondError
  }): Promise<void> => {
    const params = input.params as PermissionRequestParams
    if (params.sessionId === undefined) {
      input.respondError(-32000, "permission request missing session id")
      return
    }

    const binding = getSessionBindingRegistry().getBinding(params.sessionId)
    if (binding === undefined || binding.activeTurnId === undefined) {
      input.respondError(-32000, "permission request has no active turn")
      return
    }

    const toolCallId = params.toolCall?.toolCallId
    const toolName = params.toolCall?.name
    if (toolCallId === undefined || toolName === undefined) {
      input.respondError(-32000, "permission request missing tool call")
      return
    }

    const options = sanitizePermissionOptions(params.options)
    if (options.length === 0) {
      input.respondError(-32000, "permission request has no valid options")
      return
    }

    const pending: PendingPermission = {
      requestId: randomUUID(),
      sessionId: binding.sessionId,
      workspaceId: binding.workspaceId,
      turnId: binding.activeTurnId,
      toolCallId,
      toolName,
      options,
      createdAt: nowIso(),
      jsonRpcId: input.jsonRpcId,
      respond: input.respond,
      respondError: input.respondError,
      resolved: false,
    }

    const hadPending = countPendingForSession(pending.sessionId) > 0
    const journalResult = appendPermissionRequested(pending)
    if (!journalResult.ok) {
      input.respondError(-32000, "failed to record permission request")
      return
    }

    addPending(pending)

    if (!hadPending) {
      markAwaitingPermissionIfNeeded(pending.sessionId)
    }
  }

  const resolvePending = (input: {
    sessionId: string
    requestId: string
    body: ResolvePermissionRequestBody
  }): PermissionServiceResult<PermissionRequest> => {
    const pending = pendingById.get(input.requestId)
    if (pending === undefined) {
      return { ok: false, kind: "not_found" }
    }

    if (pending.sessionId !== input.sessionId) {
      return { ok: false, kind: "conflict", detail: "permission request belongs to another session" }
    }

    if (pending.resolved) {
      return { ok: false, kind: "conflict", detail: "permission request already resolved" }
    }

    const selected = pending.options.find((option) => option.optionId === input.body.optionId)
    if (selected === undefined) {
      return { ok: false, kind: "validation", detail: "unknown permission option" }
    }

    const journalResult = appendPermissionResolved({
      pending,
      optionId: selected.optionId,
      outcome: "selected",
    })
    if (!journalResult.ok) {
      return journalResult
    }

    pending.resolved = true
    pending.respond({
      outcome: {
        outcome: "selected",
        optionId: selected.optionId,
      },
    })

    removePending(pending.requestId)
    markRunningIfNoPending(pending.sessionId)

    return { ok: true, value: toPermissionRequest(pending) }
  }

  const clearSessionPending = (sessionId: string): void => {
    const pending = listPendingForSession(sessionId)
    pending.forEach((request) => {
      const entry = pendingById.get(request.id)
      if (entry === undefined || entry.resolved) {
        return
      }

      entry.resolved = true
      entry.respondError(-32000, PERMISSION_CANCELLED_MESSAGE)
      appendPermissionResolved({
        pending: entry,
        optionId: entry.options[0]?.optionId ?? "cancelled",
        outcome: "cancelled",
      })
      removePending(entry.requestId)
      deletePending(entry.requestId)
    })
  }

  return {
    registerPending,
    resolvePending,
    clearSessionPending,
    listPendingForSession,
    countPendingForSession,
  }
}

export type PermissionService = ReturnType<typeof createPermissionService>

export const createUnavailablePermissionService = (): PermissionService => ({
  registerPending: async (input) => {
    input.respondError(-32000, "permission service unavailable")
  },
  resolvePending: () => ({ ok: false, kind: "not_found" }),
  clearSessionPending: () => undefined,
  listPendingForSession: () => [],
  countPendingForSession: () => 0,
})
