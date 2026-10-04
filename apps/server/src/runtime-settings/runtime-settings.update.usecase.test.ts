import { describe, expect, test } from "bun:test"
import { Workspace } from "contracts/http/workspace"
import { RuntimeSettings } from "contracts/http/runtime-settings"
import { FilesystemPathError } from "core/filesystem/errors"
import {
  makeUpdateRuntimeSettings,
  UpdateRuntimeSettingsCommand,
} from "./runtime-settings.update.usecase"

const previousSettings: RuntimeSettings = {
  advertisedUrl: "https://agents.example.com",
  advertisedUrlEnabled: true,
  trustedProxies: ["10.0.0.0/8"],
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
  allowedRoots: ["/srv/roots/default"],
}

const makeWorkspace = (overrides?: Partial<Workspace>): Workspace => ({
  id: "ws_1",
  name: "Example",
  path: "/srv/roots/default/example",
  state: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

type DepsOverrides = {
  settings?: RuntimeSettings
  canonicalizeError?: { path: string; error: FilesystemPathError }
  canonicalPathByIdentity?: boolean
  workspaces?: ReadonlyArray<Workspace>
  deleteResults?: ReadonlyArray<"ok" | "not_found" | "active_sessions">
  savedSettings?: RuntimeSettings
}

const makeDeps = (overrides: DepsOverrides = {}) => {
  const saved: RuntimeSettings[] = []
  const deletedWorkspaceIds: string[] = []
  const logLevelChanges: string[] = []

  const deleteResults = [...(overrides.deleteResults ?? [])]
  const deps = {
    getSettings: () => overrides.settings ?? previousSettings,
    saveSettings: (next: RuntimeSettings) => {
      saved.push(next)
      return overrides.savedSettings ?? next
    },
    canonicalizePath: (inputPath: string) => {
      const failure = overrides.canonicalizeError
      if (failure !== undefined && inputPath === failure.path) {
        return { ok: false as const, error: failure.error }
      }
      return { ok: true as const, canonicalPath: inputPath }
    },
    listAllWorkspaces: () => overrides.workspaces ?? [],
    deleteWorkspace: async (command: { workspaceId: string }) => {
      deletedWorkspaceIds.push(command.workspaceId)
      const result = deleteResults.shift() ?? "ok"
      if (result === "not_found") {
        return { ok: false as const, error: { kind: "not_found" as const } }
      }
      if (result === "active_sessions") {
        return {
          ok: false as const,
          error: { kind: "active_sessions" as const, detail: "sessions live" },
        }
      }
      return { ok: true as const }
    },
    onLogLevelChanged: (logLevel: string) => {
      logLevelChanges.push(logLevel)
    },
  }

  return { deps, saved, deletedWorkspaceIds, logLevelChanges }
}

const run = async (
  deps: ReturnType<typeof makeDeps>["deps"],
  body: UpdateRuntimeSettingsCommand["body"],
  force = false,
) =>
  makeUpdateRuntimeSettings(deps)({
    body,
    force,
  })

describe("makeUpdateRuntimeSettings", () => {
  test("returns invalid_allowed_root when a root cannot be canonicalized", async () => {
    const { deps, saved } = makeDeps({
      canonicalizeError: { path: "/srv/roots/gone", error: { kind: "missing" } },
    })

    const result = await run(deps, {
      allowedRoots: ["/srv/roots/one", "/srv/roots/gone"],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_allowed_root",
        error: { kind: "missing" },
        index: 1,
      },
    })
    expect(saved).toEqual([])
  })

  test("dedupes roots that canonicalize to the same path", async () => {
    const { deps, saved } = makeDeps()

    const result = await run(deps, {
      allowedRoots: ["/srv/roots/one", "/srv/roots/one"],
    })

    expect(result.ok).toBe(true)
    expect(saved[0]?.allowedRoots).toEqual(["/srv/roots/one"])
  })

  test("returns allowed_root_has_workspaces when removed roots still cover workspaces", async () => {
    const { deps, saved, deletedWorkspaceIds } = makeDeps({
      workspaces: [makeWorkspace()],
    })

    const result = await run(deps, {
      allowedRoots: ["/srv/roots/other"],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "allowed_root_has_workspaces",
        detail: "1 workspace must be unregistered before this root can be removed",
      },
    })
    expect(deletedWorkspaceIds).toEqual([])
    expect(saved).toEqual([])
  })

  test("uses plural detail for multiple affected workspaces", async () => {
    const { deps } = makeDeps({
      workspaces: [makeWorkspace(), makeWorkspace({ id: "ws_2" })],
    })

    const result = await run(deps, {
      allowedRoots: ["/srv/roots/other"],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "allowed_root_has_workspaces",
        detail: "2 workspaces must be unregistered before this root can be removed",
      },
    })
  })

  test("force deletes affected workspaces and saves merged settings", async () => {
    const { deps, saved, deletedWorkspaceIds } = makeDeps({
      workspaces: [makeWorkspace()],
    })

    const result = await run(deps, { allowedRoots: ["/srv/roots/other"], logLevel: "debug" }, true)

    expect(result).toEqual({
      ok: true,
      value: {
        settings: {
          ...previousSettings,
          allowedRoots: ["/srv/roots/other"],
          logLevel: "debug",
        },
        logLevelChanged: true,
      },
    })
    expect(deletedWorkspaceIds).toEqual(["ws_1"])
    expect(saved).toHaveLength(1)
  })

  test("returns workspace_not_found when a forced delete misses", async () => {
    const { deps, saved } = makeDeps({
      workspaces: [makeWorkspace()],
      deleteResults: ["not_found"],
    })

    const result = await run(deps, { allowedRoots: ["/srv/roots/other"] }, true)

    expect(result).toEqual({
      ok: false,
      error: { kind: "workspace_not_found" },
    })
    expect(saved).toEqual([])
  })

  test("keeps deleting when a forced delete reports active sessions", async () => {
    const { deps, saved, deletedWorkspaceIds } = makeDeps({
      workspaces: [makeWorkspace()],
      deleteResults: ["active_sessions"],
    })

    const result = await run(deps, { allowedRoots: ["/srv/roots/other"] }, true)

    expect(result.ok).toBe(true)
    expect(deletedWorkspaceIds).toEqual(["ws_1"])
    expect(saved).toHaveLength(1)
  })

  test("merges partial body over previous settings without cascading", async () => {
    const { deps, saved, deletedWorkspaceIds } = makeDeps()

    const result = await run(deps, {
      logLevel: "debug",
      advertisedUrlEnabled: false,
    })

    expect(result).toEqual({
      ok: true,
      value: {
        settings: {
          ...previousSettings,
          logLevel: "debug",
          advertisedUrlEnabled: false,
        },
        logLevelChanged: true,
      },
    })
    expect(deletedWorkspaceIds).toEqual([])
    expect(saved).toHaveLength(1)
  })

  test("clears advertisedUrl with empty string and logPath with null", async () => {
    const { deps, saved } = makeDeps({
      settings: { ...previousSettings, logPath: "/var/log/harold.log" },
    })

    const result = await run(deps, {
      advertisedUrl: "",
      logPath: null,
    })

    expect(result.ok).toBe(true)
    expect(saved[0]?.advertisedUrl).toBeNull()
    expect(saved[0]?.logPath).toBeNull()
  })

  test("keeps previous allowedRoots when body omits them", async () => {
    const { deps, saved } = makeDeps()

    const result = await run(deps, { bindPort: 4000 })

    expect(result.ok).toBe(true)
    expect(saved[0]?.allowedRoots).toEqual(previousSettings.allowedRoots)
    expect(saved[0]?.bindPort).toBe(4000)
  })

  test("notifies log level change only when logLevel actually changes", async () => {
    const changed = makeDeps()
    await run(changed.deps, { logLevel: "debug" })
    expect(changed.logLevelChanges).toEqual(["debug"])

    const unchanged = makeDeps()
    await run(unchanged.deps, { logLevel: "info" })
    expect(unchanged.logLevelChanges).toEqual([])

    const absent = makeDeps()
    await run(absent.deps, { bindPort: 4000 })
    expect(absent.logLevelChanges).toEqual([])
  })
})
