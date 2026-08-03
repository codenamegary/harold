import {
  InternalProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"

export const buildMissingAdvertisedUrlProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Advertised URL required",
    status: 400,
    code: "validation.connection_test.advertised_url.required",
    errors: [{ pointer: "#/advertisedUrl", code: "validation.settings.advertised_url.required" }],
  })

export const buildConnectionTestFailedProblem = (
  detail = "Connection test could not complete",
) =>
  InternalProblemSchema.parse({
    type: PROBLEM_TYPES.internalError,
    title: "Connection test failed",
    status: 500,
    detail,
  })
