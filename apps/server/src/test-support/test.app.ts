import { mkdir } from "node:fs/promises"
import path from "node:path"
import { createServer } from "../bootstrap/server"
import { AgentId } from "contracts/http/agent-settings"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "core/agent-settings/validate-agent-path"
import { AcpSupervisor } from "../acp/supervisor/supervisor.ports"
import { makeEnsureSupervisorReady } from "../session/session.acp.ready"

type TestServerApp = Awaited<ReturnType<typeof createServer>>["app"]

type WithDeviceCredential = { deviceCredential?: { credential: string } }

const testDeviceCredential = (app: TestServerApp & WithDeviceCredential): string => {
  const credential = app.deviceCredential?.credential
  if (credential === undefined) {
    throw new Error("app was not booted with a seeded test device credential")
  }
  return credential
}

export const acceptTestExecutablePath: ValidateExecutablePathFn = () => true

export const createWorkspaceDir = async (parent: string, name: string) => {
  const dir = path.join(parent, name)
  await mkdir(dir)
  return dir
}

export const allowWorkspaceRoots = async (app: TestServerApp, roots: string[]) => {
  const credential = testDeviceCredential(app)
  const response = await app.inject({
    method: "PATCH",
    url: "/v1/settings/runtime",
    headers: { authorization: `Bearer ${credential}` },
    payload: { allowedRoots: roots },
  })

  if (response.statusCode !== 200) {
    throw new Error(`failed to allow workspace roots: ${response.body}`)
  }
}

export const seedWorkspace = async (app: TestServerApp, dataDir: string) => {
  const workspaceDir = await createWorkspaceDir(dataDir, "project")
  await allowWorkspaceRoots(app, [dataDir])
  const response = await app.inject({
    method: "POST",
    url: "/v1/workspaces",
    headers: { authorization: `Bearer ${testDeviceCredential(app)}` },
    payload: { name: "Project", path: workspaceDir },
  })
  const workspace = JSON.parse(response.body) as { id: string }
  return { workspaceId: workspace.id, workspaceDir }
}

export const enableAgent = async (app: TestServerApp, agentId: AgentId, whichFn?: WhichFn) => {
  const detectedPath = "/usr/local/bin/agent"
  const resolvedWhichFn: WhichFn =
    whichFn ?? ((binaryName) => (binaryName === "agent" ? detectedPath : undefined))

  const binaryName = agentId === "cursor" ? "agent" : agentId
  const path = resolvedWhichFn(binaryName) ?? detectedPath

  const response = await app.inject({
    method: "PATCH",
    url: `/v1/settings/agents/${agentId}`,
    headers: { authorization: `Bearer ${testDeviceCredential(app)}` },
    payload: { enabled: true, path },
  })
  if (response.statusCode !== 200) {
    throw new Error(`failed to enable agent ${agentId}: ${response.body}`)
  }
}

/**
 * Seeds a live ACP session bound under the workspace path (gateway path).
 */
export const seedBoundSession = async (params: {
  acpSupervisor: AcpSupervisor
  workspacePath: string
  agentId: AgentId
}): Promise<{ sessionId: string; acpSessionId: string }> => {
  const ready = await makeEnsureSupervisorReady({
    getRunningAgentIds: params.acpSupervisor.getRunningAgentIds,
    start: (agentId) => params.acpSupervisor.start(agentId),
  })(params.agentId)
  if (!ready.ok) {
    throw new Error(`ACP supervisor failed to start for seeded session: ${ready.reason}`)
  }

  const acpResult = await params.acpSupervisor.createSession({
    agentId: params.agentId,
    cwd: params.workspacePath,
  })
  if (!acpResult.ok) {
    throw new Error(`session/new failed: ${acpResult.reason}`)
  }

  return {
    sessionId: acpResult.acpSessionId,
    acpSessionId: acpResult.acpSessionId,
  }
}
