import { describe, expect, test } from "bun:test"
import { StatusSummary } from "core/status/summary.models"
import { RunningView, recommendNextStep, renderRunningView } from "./running.view"

const summary = (overrides: Partial<StatusSummary> = {}): StatusSummary => ({
  dataDir: "/home/dev/.harold",
  localApi: { host: "127.0.0.1", port: 3847 },
  advertisedEndpoint: { url: "https://harold.example.com", enabled: true },
  agents: { enabled: 2, needsAuth: 0 },
  workspaces: 1,
  ...overrides,
})

const view = (overrides: Partial<StatusSummary> = {}, devices = 1): RunningView => ({
  summary: summary(overrides),
  devices,
})

describe("recommendNextStep", () => {
  test("points at setup when no agents are enabled", () => {
    expect(recommendNextStep(view({ agents: { enabled: 0, needsAuth: null } })).command).toBe(
      "harold setup",
    )
  })

  test("points at setup when no workspace is registered", () => {
    expect(recommendNextStep(view({ workspaces: 0 })).command).toBe("harold setup")
  })

  test("points at connect when no advertised endpoint is set", () => {
    expect(
      recommendNextStep(view({ advertisedEndpoint: { url: null, enabled: false } })).command,
    ).toBe("harold connect")
  })

  test("points at connect when the advertised endpoint is disabled", () => {
    expect(
      recommendNextStep(
        view({ advertisedEndpoint: { url: "https://harold.example.com", enabled: false } }),
      ).command,
    ).toBe("harold connect")
  })

  test("points at pair when no device is paired", () => {
    expect(recommendNextStep(view({}, 0)).command).toBe("harold pair")
  })

  test("points at status when configured, reachable, and paired", () => {
    expect(recommendNextStep(view({}, 1)).command).toBe("harold status")
  })
})

const plainColors = { bold: (text: string) => text, dim: (text: string) => text }

describe("renderRunningView", () => {
  test("shows the running daemon, the local API URL, and the next step", () => {
    const text = renderRunningView(view({}, 0), plainColors)

    expect(text).toContain("Harold is running")
    expect(text).toContain("http://127.0.0.1:3847")
    expect(text).toContain("harold pair")
  })
})
