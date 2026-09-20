import os from "node:os"
import { AgentId } from "contracts/http/agent-settings"
import { AdapterAuthContext } from "../../agent/auth/adapters/adapter"

/** Auth context handed to agent auth adapters during spawn and initialize. */
export const buildAdapterAuthContext = (
  agentId: AgentId,
  initializeResult?: unknown,
): AdapterAuthContext => ({
  agentId,
  hostIdentity: { id: "default" },
  hostMachineName: os.hostname(),
  initializeResult,
})
