import { describe, expect, test } from "bun:test"
import { Status } from "contracts/http/status"
import { DaemonNotRunning } from "core/daemon-state/read.live.usecase"
import { StatusColors, renderDaemonNotRunning, renderDaemonStatus } from "./status.render"

const identityColors: StatusColors = {
  green: (text) => text,
  yellow: (text) => text,
  red: (text) => text,
}

const status: Status = {
  version: "0.2.1",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  acp: { state: "ready", activeSessions: 2 },
}

describe("renderDaemonStatus", () => {
  test("renders state, pid, local api, started time, and ACP summary", () => {
    const output = renderDaemonStatus({ status, pid: 4321, colors: identityColors })

    expect(output).toContain("online")
    expect(output).toContain("4321")
    expect(output).toContain("http://127.0.0.1:3847")
    expect(output).toContain("0.2.1")
    expect(output).toContain("2026-01-01T00:00:00.000Z")
    expect(output).toContain("ready")
    expect(output).toContain("2 active session(s)")
  })

  test("colors the state word through the colors port", () => {
    const output = renderDaemonStatus({
      status,
      pid: 4321,
      colors: { ...identityColors, green: (text) => `<green>${text}</green>` },
    })

    expect(output).toContain("<green>online</green>")
  })

  test("colors non-online states with yellow or red, not green", () => {
    const calls: Array<string> = []
    const recordingColors: StatusColors = {
      green: (text) => {
        calls.push(`green:${text}`)
        return text
      },
      yellow: (text) => {
        calls.push(`yellow:${text}`)
        return text
      },
      red: (text) => {
        calls.push(`red:${text}`)
        return text
      },
    }

    renderDaemonStatus({
      status: { ...status, state: "shutting_down" },
      pid: 4321,
      colors: recordingColors,
    })

    expect(calls).toContain("yellow:shutting_down")
    expect(calls).not.toContain("green:shutting_down")
  })
})

describe("renderDaemonNotRunning", () => {
  test("reports a missing state file as not running", () => {
    const error: DaemonNotRunning = { kind: "no_state_file" }

    expect(renderDaemonNotRunning(error)).toContain("not running")
  })

  test("reports a dead pid as stale state", () => {
    const error: DaemonNotRunning = { kind: "process_not_alive", pid: 4321 }

    const output = renderDaemonNotRunning(error)

    expect(output).toContain("not running")
    expect(output).toContain("4321")
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
