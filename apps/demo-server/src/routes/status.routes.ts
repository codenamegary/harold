import { DEMO_VERSION } from "../fixtures/demo.constants"
import { demoAgentAuth, demoAgentSettingsCollection, demoRuntimeSettings } from "../fixtures/agents"
import { jsonResponse, notFound } from "./http"

export const healthResponse = (): Response => jsonResponse({ ok: true })

export const statusResponse = (): Response =>
  jsonResponse({ state: "online", version: DEMO_VERSION })

export const runtimeSettingsResponse = (): Response => jsonResponse(demoRuntimeSettings)

export const agentSettingsResponse = (): Response => jsonResponse(demoAgentSettingsCollection)

export const agentAuthResponse = (agentId: string): Response =>
  agentId === "opencode" ? jsonResponse(demoAgentAuth) : notFound("Agent not found")
