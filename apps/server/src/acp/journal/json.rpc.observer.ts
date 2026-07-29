import { JournalPhase } from "contracts/events/journal-record"
import { SessionBindingRegistry } from "../client/session-binding-registry"
import { AcpJournalWriter } from "./acp.journal.writer"
import { hashToolCallIdForLog } from "./hash.tool.call.id"
import {
  createAcpNotificationRecord,
  createAcpPermissionRecord,
  createAcpRequestRecord,
  createAcpResponseRecord,
  sanitizePermissionRequest,
  sanitizeSessionUpdate,
  shouldJournalAcpMethod,
} from "./sanitize.acp.update"
import { JsonRpcObserverEvent, AcpOperationContext } from "../transport/json-rpc-transport"

const ACP_PROTOCOL_VERSION = 1

const nowIso = (): string => new Date().toISOString()

export type CreateAcpJsonRpcJournalObserverParams = {
  journalWriter: AcpJournalWriter
  sessionBindingRegistry: SessionBindingRegistry
  logToolCallId?: (hashedId: string) => void
}

export const createAcpJsonRpcJournalObserver = ({
  journalWriter,
  sessionBindingRegistry,
  logToolCallId = () => undefined,
}: CreateAcpJsonRpcJournalObserverParams) => {
  const handleOutboundRequest = (event: Extract<JsonRpcObserverEvent, { kind: "outbound_request" }>) => {
    if (
      event.context === undefined ||
      !shouldJournalAcpMethod(event.method) ||
      event.method === "session/prompt"
    ) {
      return
    }

    journalWriter.appendAndPublish([
      createAcpRequestRecord({
        occurredAt: nowIso(),
        workspaceId: event.context.workspaceId,
        sessionId: event.context.sessionId,
        turnId: event.context.turnId,
        protocolVersion: ACP_PROTOCOL_VERSION,
        phase: event.context.phase,
        method: event.method,
        jsonRpcId: event.id,
      }),
    ])
  }

  const handleInboundResponse = (
    event: Extract<JsonRpcObserverEvent, { kind: "inbound_response" }>,
  ) => {
    if (event.context === undefined || !shouldJournalAcpMethod(event.method)) {
      return
    }

    journalWriter.appendAndPublish([
      createAcpResponseRecord({
        occurredAt: nowIso(),
        workspaceId: event.context.workspaceId,
        sessionId: event.context.sessionId,
        turnId: event.context.turnId,
        protocolVersion: ACP_PROTOCOL_VERSION,
        phase: event.context.phase,
        method: event.method,
        jsonRpcId: event.id,
        success: event.success,
      }),
    ])
  }

  const handleSessionUpdateNotification = (params: unknown) => {
    const value = params as { sessionId?: string; update?: unknown }
    if (value.sessionId === undefined) {
      return
    }

    const binding = sessionBindingRegistry.getBinding(value.sessionId)
    if (binding === undefined) {
      return
    }

    const payload = sanitizeSessionUpdate(value.update)
    if (payload === undefined) {
      return
    }

    if (payload.updateKind === "tool_call" || payload.updateKind === "tool_call_update") {
      logToolCallId(hashToolCallIdForLog(payload.toolCallId))
    }

    journalWriter.appendAndPublish([
      createAcpNotificationRecord({
        occurredAt: nowIso(),
        workspaceId: binding.workspaceId,
        sessionId: binding.sessionId,
        turnId: binding.activeTurnId,
        protocolVersion: ACP_PROTOCOL_VERSION,
        phase: binding.phase,
        payload,
      }),
    ])
  }

  const handlePermissionRequest = (params: unknown) => {
    const value = params as { sessionId?: string }
    if (value.sessionId === undefined) {
      return
    }

    const binding = sessionBindingRegistry.getBinding(value.sessionId)
    if (binding === undefined || binding.activeTurnId === undefined) {
      return
    }

    const payload = sanitizePermissionRequest(params)
    if (payload === undefined) {
      return
    }

    logToolCallId(hashToolCallIdForLog(payload.toolCallId))

    journalWriter.appendAndPublish([
      createAcpPermissionRecord({
        occurredAt: nowIso(),
        workspaceId: binding.workspaceId,
        sessionId: binding.sessionId,
        turnId: binding.activeTurnId,
        protocolVersion: ACP_PROTOCOL_VERSION,
        phase: binding.phase,
        payload,
      }),
    ])
  }

  return (event: JsonRpcObserverEvent) => {
    switch (event.kind) {
      case "outbound_request":
        handleOutboundRequest(event)
        return
      case "inbound_response":
        handleInboundResponse(event)
        return
      case "inbound_notification":
        if (event.method === "session/update") {
          handleSessionUpdateNotification(event.params)
        }
        return
      case "inbound_request":
        if (event.method === "session/request_permission") {
          handlePermissionRequest(event.params)
        }
        return
    }
  }
}
