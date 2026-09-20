import { registerSessionCancelHandler } from "../agent/session.cancel"
import { registerSessionCloseHandler } from "../agent/session.close"
import { registerSessionSetConfigOptionHandler } from "../agent/session.set_config_option"
import { registerSessionListHandler } from "../agent/session.list"
import { registerSessionLoadHandler } from "../agent/session.load"
import { registerSessionNewHandler } from "../agent/session.new"
import { registerSessionPromptHandler } from "../agent/session.prompt"
import { createAgentMethodTable } from "../agent/method.table"
import { createSessionOwnership } from "../agent/session.ownership"
import { createSessionBindingRegistry } from "../client/session-binding-registry"
import { AcpSupervisorStatus } from "./models"
import { AcpSupervisor, CreateAcpSupervisorParams } from "./supervisor.ports"
import { aggregateStatus } from "./supervisor.aggregate.status"
import { createSupervisorLifecycle } from "./supervisor.lifecycle"
import { createSupervisorSessionOps } from "./supervisor.session.ops"

/**
 * Composition root for the ACP supervisor. Wires the process-lifecycle engine
 * (`supervisor.lifecycle.ts`) and the session operations
 * (`supervisor.session.ops.ts`) into the public `AcpSupervisor` capability.
 */
export const createAcpSupervisor = ({
  agentSettingsRepository,
  serverVersion,
  onSessionUpdate,
  onSessionConfig,
  onSessionDiscovered,
  requestPermission,
  requestExtensionRpc,
  onBeforeClearRuntime,
  onSupervisorReady,
  restartBackoffMs,
  sleepFn,
  spawnAgentProcessFn,
  createTransportFn,
  authHooks,
}: CreateAcpSupervisorParams): AcpSupervisor => {
  const sessionBindingRegistry = createSessionBindingRegistry()
  const sessionOwnership = createSessionOwnership()
  const agentMethodTable = createAgentMethodTable()
  registerSessionCloseHandler(agentMethodTable)
  registerSessionSetConfigOptionHandler(agentMethodTable)
  registerSessionLoadHandler(agentMethodTable)
  registerSessionListHandler(agentMethodTable)
  registerSessionNewHandler(agentMethodTable)
  registerSessionPromptHandler(agentMethodTable)
  registerSessionCancelHandler(agentMethodTable)

  const lifecycle = createSupervisorLifecycle({
    agentSettingsRepository,
    serverVersion,
    sessionBindingRegistry,
    sessionOwnership,
    onSessionUpdate,
    requestPermission,
    requestExtensionRpc,
    onBeforeClearRuntime,
    onSupervisorReady,
    restartBackoffMs,
    sleepFn,
    spawnAgentProcessFn,
    createTransportFn,
    authHooks,
  })
  const { runtimes, start, stop, respawn, handleAgentDisabled, getAgentRuntimeState } = lifecycle

  const sessionOps = createSupervisorSessionOps({
    runtimes,
    sessionBindingRegistry,
    sessionOwnership,
    agentMethodTable,
    onSessionDiscovered,
    onSessionConfig,
    start,
  })

  return {
    getStatus: (): AcpSupervisorStatus =>
      aggregateStatus(
        [...runtimes.values()].map((runtime) => runtime.state),
        sessionBindingRegistry.count(),
      ),
    getAgentRuntimeState,
    getSessionBindingRegistry: () => sessionBindingRegistry,
    start,
    stop,
    handleAgentDisabled,
    respawn,
    ...sessionOps,
  }
}
