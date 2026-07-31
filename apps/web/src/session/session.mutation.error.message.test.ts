import { describe, expect, test } from "bun:test"
import { sessionMutationErrorMessage } from "./session.mutation.error.message"

const isTypedError = (error: unknown): error is Error & {
  problem: { detail: string; fieldError?: string }
} => error instanceof Error && error.name === "SessionUpdateError"

describe("sessionMutationErrorMessage", () => {
  test("returns typed problem detail with optional field error", () => {
    const error = new Error("Name invalid") as Error & {
      name: string
      problem: { detail: string; fieldError?: string }
    }
    error.name = "SessionUpdateError"
    error.problem = {
      detail: "Validation failed",
      fieldError: "/name: too_small",
    }

    expect(
      sessionMutationErrorMessage(error, isTypedError, "Could not rename session."),
    ).toBe("Validation failed /name: too_small")
  })

  test("returns fallback for unknown errors", () => {
    expect(
      sessionMutationErrorMessage(new Error("boom"), isTypedError, "Could not rename session."),
    ).toBe("Could not rename session.")
  })
})
