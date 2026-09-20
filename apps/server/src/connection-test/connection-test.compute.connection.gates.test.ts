import { describe, expect, test } from "bun:test"
import { computeConnectionGates } from "./connection-test.compute.connection.gates"

describe("computeConnectionGates", () => {
  test("requires all pass for canContinue", () => {
    const gates = computeConnectionGates([
      { id: "dns", status: "pass", message: "ok" },
      { id: "tls", status: "pass", message: "ok" },
      { id: "device-auth", status: "pass", message: "ok" },
    ])

    expect(gates).toEqual({ canContinue: true, canContinueAnyway: false })
  })

  test("allows continue anyway when TLS warns and others pass", () => {
    const gates = computeConnectionGates([
      { id: "dns", status: "pass", message: "ok" },
      { id: "tls", status: "warn", message: "self-signed" },
      { id: "device-auth", status: "pass", message: "ok" },
    ])

    expect(gates).toEqual({ canContinue: false, canContinueAnyway: true })
  })
})
