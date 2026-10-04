import { describe, expect, test } from "bun:test"
import { statusUrlFor } from "./reachability.models"

describe("statusUrlFor", () => {
  test("appends the status path to a bare advertised URL", () => {
    expect(statusUrlFor("https://agents.example.com")).toBe("https://agents.example.com/v1/status")
  })

  test("collapses trailing slashes before appending the status path", () => {
    expect(statusUrlFor("https://agents.example.com/")).toBe("https://agents.example.com/v1/status")
    expect(statusUrlFor("https://agents.example.com//")).toBe(
      "https://agents.example.com/v1/status",
    )
  })

  test("keeps a path prefix from the advertised URL", () => {
    expect(statusUrlFor("https://agents.example.com/harold/")).toBe(
      "https://agents.example.com/harold/v1/status",
    )
  })

  test("keeps the loopback http scheme", () => {
    expect(statusUrlFor("http://127.0.0.1:3847")).toBe("http://127.0.0.1:3847/v1/status")
  })

  test("drops a query suffix before appending the status path", () => {
    expect(statusUrlFor("https://x.example/?a=1")).toBe("https://x.example/v1/status")
    expect(statusUrlFor("https://x.example/harold?a=1")).toBe("https://x.example/harold/v1/status")
  })

  test("drops a fragment suffix before appending the status path", () => {
    expect(statusUrlFor("https://x.example/#fragment")).toBe("https://x.example/v1/status")
    expect(statusUrlFor("https://x.example/harold/?a=1#fragment")).toBe(
      "https://x.example/harold/v1/status",
    )
  })
})
