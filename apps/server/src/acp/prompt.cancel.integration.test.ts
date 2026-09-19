import { describe, expect, test } from "bun:test"
import { spawnFakeAcp } from "test-support/spawn"
import { assembleAgentSettingsSlice } from "../agent-settings/agent.settings.assembly"
import { acceptTestExecutablePath } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"
import { createAcpSupervisor } from "./supervisor/supervisor"
import { AcpSupervisor } from "./supervisor/models"
import { SpawnedAgentProcess } from "./supervisor/spawn.agent.process"

const waitFor = async (predicate: () => boolean, timeoutMs = 1000) => {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe("ACP prompt, update, and cancel integration", () => {
  test(
    "prompt receives updates and cancel stops deferred updates",
    async () => {
      const sessionUpdates: Array<{ acpSessionId: string; update: unknown }> = []

      const { app, acpSupervisor } = await bootTestApp({
        config: { host: "127.0.0.1", port: 3849 },
        setup: ({ database, runtime }) => {
          const supervisorRef: { current: AcpSupervisor | null } = { current: null }
          const agentSettings = assembleAgentSettingsSlice({
            database,
            validateExecutablePathFn: acceptTestExecutablePath,
            acpSupervisor: () => {
              const supervisor = supervisorRef.current
              if (supervisor === null) {
                throw new Error("supervisor is not ready")
              }
              return supervisor
            },
          })
          const spawnAgentProcessFn = (): SpawnedAgentProcess => {
            const fake = spawnFakeAcp({
              sessionNewSessionId: "fake-session-prompt",
              emitSessionUpdatesOnPrompt: true,
            })
            return {
              stdin: fake.stdin,
              stdout: fake.stdout,
              kill: () => {
                fake.kill()
              },
              waitForExit: () => fake.process.exited,
            }
          }
          const acpSupervisor = createAcpSupervisor({
              agentSettingsRepository: agentSettings,
              serverVersion: runtime.version,
              onSessionUpdate: (input) => {
                sessionUpdates.push(input)
              },
              spawnAgentProcessFn,
            })
          supervisorRef.current = acpSupervisor
          return {
            acpSupervisor,
          }
        },
      })

      await app.inject({
        method: "PATCH",
        url: "/v1/settings/agents/cursor",
        payload: { enabled: true, path: "/fake/agent" },
      })
      await acpSupervisor.start("cursor")

      const created = await acpSupervisor.createAcpSession({
        workspaceCwd: "/tmp/ws",
        sessionId: "sess_test",
        workspaceId: "ws_test",
      })
      expect(created.ok).toBe(true)
      if (!created.ok) {
        throw new Error("expected session creation to succeed")
      }

      const promptPromise = acpSupervisor.promptAcpSession({
        acpSessionId: created.acpSessionId,
        prompt: [{ type: "text", text: "hello" }],
      })

      await waitFor(() => sessionUpdates.length >= 1)
      const cancelResult = await acpSupervisor.cancelAcpSession({
        acpSessionId: created.acpSessionId,
      })
      expect(cancelResult).toEqual({ ok: true })

      const promptResult = await promptPromise
      expect(promptResult).toEqual({ ok: true, result: { stopReason: "cancelled" } })

      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(sessionUpdates).toHaveLength(1)
      expect(sessionUpdates[0]).toEqual({
        agentId: "cursor",
        acpSessionId: created.acpSessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        },
      })
    },
    { timeout: 20_000 },
  )
})
