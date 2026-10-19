import { AgentId } from "contracts/http/agent-settings"
import { SessionConfig } from "contracts/http/config.options"

/**
 * In-memory per-session config-options cache owned by the hub. Not a port: the
 * hub creates it and hands it to the routes that read and update it. Sessions
 * advertise config once (at create time, usually before anyone is subscribed),
 * so this is the copy a late stream subscriber gets.
 */
export type ConfigOptionsCache = {
  remember: (params: { agentId: AgentId; sessionId: string; configOptions: SessionConfig }) => void
  get: (params: { agentId: AgentId; sessionId: string }) => SessionConfig | undefined
  forget: (params: { agentId: AgentId; sessionId: string }) => void
}

export type ConfigOptionsSnapshot = Readonly<Record<string, SessionConfig>>

export type CreateConfigOptionsCacheParams = {
  /** Restored from disk after a daemon restart. */
  initial?: ConfigOptionsSnapshot
  /** Called after every change so a persistent adapter can save the snapshot. */
  onChange?: (snapshot: ConfigOptionsSnapshot) => void
}

const cacheKey = (agentId: AgentId, sessionId: string): string => `${agentId}:${sessionId}`

export const createConfigOptionsCache = (
  params: CreateConfigOptionsCacheParams = {},
): ConfigOptionsCache => {
  const byKey = new Map<string, SessionConfig>(Object.entries(params.initial ?? {}))
  const notify = () => {
    params.onChange?.(Object.fromEntries(byKey))
  }

  return {
    remember: ({ agentId, sessionId, configOptions }) => {
      byKey.set(cacheKey(agentId, sessionId), configOptions)
      notify()
    },
    get: ({ agentId, sessionId }) => byKey.get(cacheKey(agentId, sessionId)),
    forget: ({ agentId, sessionId }) => {
      if (byKey.delete(cacheKey(agentId, sessionId))) {
        notify()
      }
    },
  }
}
