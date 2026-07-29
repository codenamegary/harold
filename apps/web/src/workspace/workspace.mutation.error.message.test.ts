import { describe, expect, test } from "bun:test"
import { workspaceMutationErrorMessage } from "./workspace.mutation.error.message"

const isTypedError = (error: unknown): error is Error & {
  problem: { detail: string; fieldError?: string }
} => error instanceof Error && error.name === "WorkspaceCreateError"

describe("workspaceMutationErrorMessage", () => {
  test("returns typed problem detail with optional field error", () => {
    const error = new Error("Path invalid") as Error & {
      name: string
      problem: { detail: string; fieldError?: string }
    }
    error.name = "WorkspaceCreateError"
    error.problem = {
      detail: "Validation failed",
      fieldError: "/path: required",
    }

    expect(
      workspaceMutationErrorMessage(error, isTypedError, "Could not add workspace."),
    ).toBe("Validation failed /path: required")
  })

  test("returns fallback for unknown errors", () => {
    expect(
      workspaceMutationErrorMessage(new Error("boom"), isTypedError, "Could not add workspace."),
    ).toBe("Could not add workspace.")
  })
})
