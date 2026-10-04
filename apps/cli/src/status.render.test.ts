import { describe, expect, test } from "bun:test"
import { Status } from "contracts/http/status"
import { DaemonNotRunning } from "core/daemon-state/read.live.usecase"
import { StatusSummary } from "core/status/summary.models"
import {
  renderDaemonNotRunning,
  renderStatus,
  renderStatusSummary,
  StatusColors,
} from "./status.render"

const identityColors: StatusColors = {
  green: (text) => text,
  yellow: (text) => text,
  red: (text) => text,
  dim: (text) => text,
  bold: (text) => text,
}

const summary: StatusSummary = {
  dataDir: "/home/me/.harold",
  localApi: { host: "127.0.0.1", port: 3847 },
  advertisedEndpoint: { url: "https://harold.example.com", enabled: true },
  agents: { enabled: 2, needsAuth: 1 },
  workspaces: 3,
}

const status: Status = {
  version: "0.2.1",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  acp: { state: "ready", activeSessions: 2 },
}

describe("renderStatusSummary", () => {
  test("renders the static projection fields", () => {
    const output = renderStatusSummary(summary)

    expect(output).toContain(summary.dataDir)
    expect(output).toContain("http://127.0.0.1:3847")
    expect(output).toContain("https://harold.example.com")
    expect(output).toContain("2 enabled, 1 needs auth")
    expect(output).toContain("3")
  })

  test("marks a missing advertised endpoint as disabled", () => {
    const output = renderStatusSummary({
      ...summary,
      advertisedEndpoint: { url: null, enabled: true },
    })

    expect(output).toContain("disabled")
  })

  test("marks a present but disabled advertised endpoint", () => {
    const output = renderStatusSummary({
      ...summary,
      advertisedEndpoint: { url: "https://harold.example.com", enabled: false },
    })

    expect(output).toContain("https://harold.example.com (disabled)")
  })

  test("renders unknown needs-auth instead of a definitive zero", () => {
    const output = renderStatusSummary({
      ...summary,
      agents: { enabled: 2, needsAuth: null },
    })

    expect(output).toContain("2 enabled, unknown needs auth")
    expect(output).not.toContain("0 needs auth")
  })
})

describe("renderStatus", () => {
  test("combines the summary with the live daemon block", () => {
    const output = renderStatus({
      summary,
      daemon: {
        ok: true,
        state: { pid: 4321, writtenAt: "2026-01-01T00:00:00.000Z", status },
      },
      colors: identityColors,
    })

    expect(output).toContain(summary.dataDir)
    expect(output).toContain("online (pid 4321)")
    expect(output).toContain("0.2.1")
    expect(output).toContain("ready, 2 active session(s)")
  })

  test("colors the live state word", () => {
    const output = renderStatus({
      summary,
      daemon: {
        ok: true,
        state: { pid: 4321, writtenAt: "2026-01-01T00:00:00.000Z", status },
      },
      colors: { ...identityColors, green: (text) => `<green>${text}</green>` },
    })

    expect(output).toContain("<green>online</green>")
  })

  test("renders the summary plus a not-running note when the daemon is gone", () => {
    const output = renderStatus({
      summary,
      daemon: { ok: false, error: { kind: "no_state_file" } },
      colors: identityColors,
    })

    expect(output).toContain(summary.dataDir)
    expect(output).toContain("not running")
  })

  test("reports a stale state file with its pid", () => {
    const output = renderStatus({
      summary,
      daemon: { ok: false, error: { kind: "process_not_alive", pid: 4321 } },
      colors: identityColors,
    })

    expect(output).toContain("4321")
  })
})

describe("renderDaemonNotRunning", () => {
  test("reports a missing state file as not running", () => {
    const error: DaemonNotRunning = { kind: "no_state_file" }

    expect(renderDaemonNotRunning(error)).toContain("not running")
  })

  test("reports a dead pid as stale state", () => {
    const error: DaemonNotRunning = { kind: "process_not_alive", pid: 4321 }

    expect(renderDaemonNotRunning(error)).toContain("4321")
  })

  test("reports an unreadable state file with the detail", () => {
    const error: DaemonNotRunning = {
      kind: "unreadable_state_file",
      detail: "Unexpected token",
    }

    const output = renderDaemonNotRunning(error)

    expect(output).toContain("unreadable")
    expect(output).toContain("Unexpected token")
  })
})
