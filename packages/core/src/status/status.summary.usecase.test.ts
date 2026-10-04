import { describe, expect, test } from "bun:test"
import { StatusSummary } from "./status.summary.models"
import { makeGetStatusSummary, summarizeAgents } from "./status.summary.usecase"

const summary: StatusSummary = {
  dataDir: "/home/me/.harold",
  localApi: { host: "127.0.0.1", port: 3847 },
  advertisedEndpoint: { url: "https://harold.example.com", enabled: true },
  agents: { enabled: 2, needsAuth: 1 },
  workspaces: 3,
}

describe("summarizeAgents", () => {
  test("counts enabled agents and enabled agents that need auth", () => {
    const output = summarizeAgents([
      { enabled: true, authSummary: { status: "needs_auth" } },
      { enabled: true, authSummary: { status: "authenticated" } },
      { enabled: false, authSummary: { status: "needs_auth" } },
      { enabled: true, authSummary: { status: "unknown" } },
    ])

    expect(output).toEqual({ enabled: 3, needsAuth: 1 })
  })

  test("ignores needs-auth on disabled agents", () => {
    const output = summarizeAgents([{ enabled: false, authSummary: { status: "needs_auth" } }])

    expect(output).toEqual({ enabled: 0, needsAuth: 0 })
  })

  test("returns zero counts for an empty view", () => {
    expect(summarizeAgents([])).toEqual({ enabled: 0, needsAuth: 0 })
  })
})

describe("makeGetStatusSummary", () => {
  test("composes each port into the summary projection", () => {
    const getStatusSummary = makeGetStatusSummary({
      getDataDir: () => summary.dataDir,
      getLocalApi: () => summary.localApi,
      getAdvertisedEndpoint: () => summary.advertisedEndpoint,
      getAgentSummary: () => summary.agents,
      getWorkspaceCount: () => summary.workspaces,
    })

    expect(getStatusSummary()).toEqual(summary)
  })

  test("reads each port on every call so later calls see fresh values", () => {
    const workspaces = { count: 1 }
    const getStatusSummary = makeGetStatusSummary({
      getDataDir: () => summary.dataDir,
      getLocalApi: () => summary.localApi,
      getAdvertisedEndpoint: () => summary.advertisedEndpoint,
      getAgentSummary: () => summary.agents,
      getWorkspaceCount: () => workspaces.count,
    })

    workspaces.count = 7

    expect(getStatusSummary().workspaces).toBe(7)
  })
})
