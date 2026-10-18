import { describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  InternalProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  ProblemDetailsSchema,
  UnprocessableProblemSchema,
  ValidationProblemSchema,
} from "./error"

describe("PROBLEM_TYPES", () => {
  test("uses harold.local problem type URLs", () => {
    expect(PROBLEM_TYPES.validationError).toBe("https://harold.local/problems/validation-error")
    expect(PROBLEM_TYPES.internalError).toBe("https://harold.local/problems/internal-error")
    expect(PROBLEM_TYPES.notFound).toBe("https://harold.local/problems/not-found")
    expect(PROBLEM_TYPES.conflict).toBe("https://harold.local/problems/conflict")
    expect(PROBLEM_TYPES.unprocessable).toBe("https://harold.local/problems/unprocessable")
  })
})

describe("ValidationProblemSchema", () => {
  test("accepts localization codes for field errors", () => {
    const problem = {
      type: PROBLEM_TYPES.validationError,
      title: "Request validation failed",
      status: 400,
      code: "validation.request.invalid",
      errors: [
        { pointer: "#/name", code: "validation.field.required" },
        { pointer: "#/path", code: "validation.field.path.absolute" },
      ],
    }

    expect(ValidationProblemSchema.parse(problem)).toEqual(problem)
  })

  test("rejects human-readable detail strings on field errors", () => {
    expect(() =>
      ValidationProblemSchema.parse({
        type: PROBLEM_TYPES.validationError,
        title: "Request validation failed",
        code: "validation.request.invalid",
        errors: [{ pointer: "#/name", detail: "Required" }],
      }),
    ).toThrow()
  })

  test("rejects validation problems without errors", () => {
    expect(() =>
      ValidationProblemSchema.parse({
        type: PROBLEM_TYPES.validationError,
        title: "Request validation failed",
        code: "validation.request.invalid",
        errors: [],
      }),
    ).toThrow()
  })

  test("rejects legacy error envelope shape", () => {
    expect(() =>
      ValidationProblemSchema.parse({
        error: {
          code: "validation.failed",
          message: "Request body is invalid",
        },
      }),
    ).toThrow()
  })
})

describe("InternalProblemSchema", () => {
  test("accepts a problem with human-readable detail", () => {
    const problem = {
      type: PROBLEM_TYPES.internalError,
      title: "Internal server error",
      status: 500,
      detail: "Unexpected failure",
    }

    expect(InternalProblemSchema.parse(problem)).toEqual(problem)
  })
})

describe("NotFoundProblemSchema", () => {
  test("accepts a not-found problem", () => {
    const problem = {
      type: PROBLEM_TYPES.notFound,
      title: "Workspace not found",
      status: 404,
      detail: "Unknown workspaceId",
    }

    expect(NotFoundProblemSchema.parse(problem)).toEqual(problem)
  })
})

describe("ConflictProblemSchema", () => {
  test("accepts a conflict problem", () => {
    const problem = {
      type: PROBLEM_TYPES.conflict,
      title: "Workspace path already registered",
      status: 409,
      detail: "Duplicate canonical path",
    }

    expect(ConflictProblemSchema.parse(problem)).toEqual(problem)
  })
})

describe("UnprocessableProblemSchema", () => {
  test("accepts an unprocessable problem with detail", () => {
    const problem = {
      type: PROBLEM_TYPES.unprocessable,
      title: "Session command rejected",
      status: 422,
      detail: "Attachment is no longer available: shot.png",
    }

    expect(UnprocessableProblemSchema.parse(problem)).toEqual(problem)
  })

  test("rejects a conflict-type problem through the unprocessable schema", () => {
    expect(() =>
      UnprocessableProblemSchema.parse({
        type: PROBLEM_TYPES.conflict,
        title: "Session command rejected",
        status: 422,
      }),
    ).toThrow()
  })
})

describe("ProblemDetailsSchema", () => {
  test("parses validation and internal problems by type", () => {
    const validation = {
      type: PROBLEM_TYPES.validationError,
      title: "Request validation failed",
      code: "validation.request.invalid",
      errors: [{ pointer: "#/name", code: "validation.field.required" }],
    }

    const internal = {
      type: PROBLEM_TYPES.internalError,
      title: "Internal server error",
      detail: "Unexpected failure",
    }

    expect(ProblemDetailsSchema.parse(validation)).toEqual(validation)
    expect(ProblemDetailsSchema.parse(internal)).toEqual(internal)
  })

  test("parses not-found and conflict problems by type", () => {
    const notFound = {
      type: PROBLEM_TYPES.notFound,
      title: "Workspace not found",
      status: 404,
    }

    const conflict = {
      type: PROBLEM_TYPES.conflict,
      title: "Workspace path already registered",
      status: 409,
    }

    expect(ProblemDetailsSchema.parse(notFound)).toEqual(notFound)
    expect(ProblemDetailsSchema.parse(conflict)).toEqual(conflict)
  })

  test("parses unprocessable problems by type", () => {
    const unprocessable = {
      type: PROBLEM_TYPES.unprocessable,
      title: "Session command rejected",
      status: 422,
    }

    expect(ProblemDetailsSchema.parse(unprocessable)).toEqual(unprocessable)
  })
})
