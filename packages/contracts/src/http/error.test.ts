import { describe, expect, test } from "bun:test";
import {
  InternalProblemSchema,
  PROBLEM_TYPES,
  ProblemDetailsSchema,
  ValidationProblemSchema,
} from "./error";

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
    };

    expect(ValidationProblemSchema.parse(problem)).toEqual(problem);
  });

  test("rejects human-readable detail strings on field errors", () => {
    expect(() =>
      ValidationProblemSchema.parse({
        type: PROBLEM_TYPES.validationError,
        title: "Request validation failed",
        code: "validation.request.invalid",
        errors: [{ pointer: "#/name", detail: "Required" }],
      }),
    ).toThrow();
  });

  test("rejects validation problems without errors", () => {
    expect(() =>
      ValidationProblemSchema.parse({
        type: PROBLEM_TYPES.validationError,
        title: "Request validation failed",
        code: "validation.request.invalid",
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
  test("accepts a problem with human-readable detail", () => {
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
      code: "validation.request.invalid",
      errors: [{ pointer: "#/name", code: "validation.field.required" }],
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
