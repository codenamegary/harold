import { AgentId } from "contracts/http/agent-settings"
import { CommandsCache } from "./hub/commands.cache"
import { ConfigOptionsCache } from "./hub/config.cache"
import {
  AdvertisesSessionClose,
  ArchiveAcpSession,
  CloseAcpSession,
  EnsureSupervisorReady,
  ForgetSessionTitle,
} from "./session.ports"

export type DeleteAcpSessionResult = { ok: true } | { ok: false; reason: string }

export type DeleteAcpSessionInput = Readonly<{
  agentId: AgentId
  sessionId: string
}>

export type DeleteAcpSessionDeps = Readonly<{
  archiveAcpSession: ArchiveAcpSession
  commandsCache: CommandsCache
  configCache: ConfigOptionsCache
  forgetSessionTitle: ForgetSessionTitle
  ensureSupervisorReady: EnsureSupervisorReady
  advertisesSessionClose: AdvertisesSessionClose
  closeAcpSession: CloseAcpSession
}>

export type DeleteAcpSession = (input: DeleteAcpSessionInput) => Promise<DeleteAcpSessionResult>

export const makeDeleteAcpSession =
  (deps: DeleteAcpSessionDeps): DeleteAcpSession =>
  async (input) => {
    deps.archiveAcpSession({
      agentId: input.agentId,
      sessionId: input.sessionId,
    })
    deps.commandsCache.forget({
      agentId: input.agentId,
      sessionId: input.sessionId,
    })
    deps.configCache.forget({
      agentId: input.agentId,
      sessionId: input.sessionId,
    })
    deps.forgetSessionTitle({
      agentId: input.agentId,
      sessionId: input.sessionId,
    })

    const supervisorReady = await deps.ensureSupervisorReady(input.agentId)
    if (supervisorReady.ok && deps.advertisesSessionClose(input.agentId)) {
      // Catalog hide is the delete contract; close is best-effort and must not
      // hold the HTTP response behind agent RPC latency.
      void deps.closeAcpSession({
        agentId: input.agentId,
        sessionId: input.sessionId,
      })
    }

    return { ok: true }
  }
