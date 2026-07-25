import { describe, expect, test } from "bun:test";
import { ApiErrorSchema } from "./error";

describe("ApiErrorSchema", () => {
  test("accepts a valid error envelope", () => {
    const error = {
      error: {
        code: "validation.failed",
        message: "Request body is invalid",
        details: [{ path: "name", message: "Required" }],
      },
    };

    expect(ApiErrorSchema.parse(error)).toEqual(error);
  });

  test("accepts errors without details", () => {
    const error = {
      error: {
        code: "internal.error",
        message: "Unexpected failure",
      },
    };

    expect(ApiErrorSchema.parse(error)).toEqual(error);
  });

  test("rejects empty error codes", () => {
    expect(() =>
      ApiErrorSchema.parse({
        error: { code: "", message: "Bad" },
      }),
    ).toThrow();
  });
});
