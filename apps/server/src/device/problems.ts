import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
} from "contracts/http/error"

export const buildPairingCodeNotFoundProblem = (
  detail = "Unknown pairing code",
) =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Pairing code not found",
    status: 404,
    detail,
  })

export const buildPairingCodeClaimedProblem = (
  detail = "Pairing code has already been claimed",
) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Pairing code already claimed",
    status: 409,
    detail,
  })

export const buildPairingCodeExpiredProblem = (
  detail = "Pairing code has expired",
) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Pairing code expired",
    status: 409,
    detail,
  })

export const buildPairingCodeRevokedProblem = (
  detail = "Pairing code has been revoked",
) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Pairing code revoked",
    status: 409,
    detail,
  })
