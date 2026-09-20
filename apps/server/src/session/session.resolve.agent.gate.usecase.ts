import { AgentId, AgentSettings } from "contracts/http/agent-settings"
import { FindAgentSettings } from "./session.ports"

export type AgentGateError =
  | { readonly kind: "AGENT_NOT_FOUND" }
  | { readonly kind: "AGENT_UNAVAILABLE" }
  | { readonly kind: "AGENT_DISABLED" }

export type ResolveAgentGateResult =
  | { readonly ok: true; readonly value: AgentSettings }
  | { readonly ok: false; readonly error: AgentGateError }

export type ResolveAgentGateInput = Readonly<{
  agentId: AgentId
}>

export type ResolveAgentGateDeps = Readonly<{
  findAgentSettings: FindAgentSettings
}>

export type ResolveAgentGate = (input: ResolveAgentGateInput) => Promise<ResolveAgentGateResult>

/**
 * Shared agent gate for every session route: the agent must exist in the
 * settings catalog, be available in this release, and be enabled.
 */
export const makeResolveAgentGate =
  (deps: ResolveAgentGateDeps): ResolveAgentGate =>
  async (input) => {
    const settings = deps.findAgentSettings(input.agentId)

    if (settings === undefined) {
      return { ok: false, error: { kind: "AGENT_NOT_FOUND" } }
    }

    if (!settings.available) {
      return { ok: false, error: { kind: "AGENT_UNAVAILABLE" } }
    }

    if (!settings.enabled) {
      return { ok: false, error: { kind: "AGENT_DISABLED" } }
    }

    return { ok: true, value: settings }
  }
