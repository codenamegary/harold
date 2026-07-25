import { describe, expect, test } from "bun:test";
import {
  InternalProblemSchema,
  PROBLEM_TYPES,
  ProblemDetailsSchema,
  ValidationProblemSchema,
} from "./error";

describe("ValidationProblemSchema", () => {
  test("accepts RFC 9457 pointer-style field errors", () => {
    const problem = {
      type: PROBLEM_TYPES.validationError,
      title: "Request validation failed",
      status: 400,
      detail: "One or more fields are invalid.",
      errors: [
        { pointer: "#/name", detail: "Required" },
        { pointer: "#/path", detail: "Must be an absolute path" },
      ],
    };

    expect(ValidationProblemSchema.parse(problem)).toEqual(problem);
  });

  test("rejects validation problems without errors", () => {
    expect(() =>
      ValidationProblemSchema.parse({
        type: PROBLEM_TYPES.validationError,
        title: "Request validation failed",
        errors: [],
      }),
    ).toThrow();
  });

  test("rejects legacy error envelope shape", () => {
    expect(() =>
      ValidationProblemSchema.parse({
        error: {
          code: "validation.failed",
          message: "Request body is invalid",
        },
      }),
    ).toThrow();
  });
});

describe("InternalProblemSchema", () => {
  test("accepts a problem without extensions", () => {
    const problem = {
      type: PROBLEM_TYPES.internalError,
      title: "Internal server error",
      status: 500,
      detail: "Unexpected failure",
    };

    expect(InternalProblemSchema.parse(problem)).toEqual(problem);
  });
});

describe("ProblemDetailsSchema", () => {
  test("parses validation and internal problems by type", () => {
    const validation = {
      type: PROBLEM_TYPES.validationError,
      title: "Request validation failed",
      errors: [{ pointer: "#/name", detail: "Required" }],
    };

    const internal = {
      type: PROBLEM_TYPES.internalError,
      title: "Internal server error",
      detail: "Unexpected failure",
    };

    expect(ProblemDetailsSchema.parse(validation)).toEqual(validation);
    expect(ProblemDetailsSchema.parse(internal)).toEqual(internal);
  });
});
