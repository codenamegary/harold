import { z } from "zod"
import { DeviceCredentialResponseSchema } from "./device"
import { IdSchema, TimestampSchema } from "./primitives"

export const PAIRING_CODES_PATH = "/v1/pairing-codes" as const

export const PairingCodeValueSchema = z
  .string()
  .regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)

export const PairingCodeStateSchema = z.enum([
  "active",
  "claimed",
  "expired",
  "revoked",
])

export const PairingCodeSchema = z.strictObject({
  id: IdSchema,
  code: PairingCodeValueSchema,
  endpoint: z.url(),
  state: PairingCodeStateSchema,
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
})

export const CreatePairingCodeBodySchema = z.strictObject({})

export const CreatePairingCodeResponseSchema = PairingCodeSchema

export const ClaimPairingCodeBodySchema = z.strictObject({
  name: z.string().min(1).max(80).optional(),
  platform: z.string().min(1).max(64).optional(),
})

export const ClaimPairingCodeResponseSchema = DeviceCredentialResponseSchema

export const claimPairingCodePath = (code: string) =>
  `${PAIRING_CODES_PATH}/${code}/claim`

export type PairingCode = z.infer<typeof PairingCodeSchema>
export type PairingCodeState = z.infer<typeof PairingCodeStateSchema>
export type PairingCodeValue = z.infer<typeof PairingCodeValueSchema>
export type CreatePairingCodeBody = z.infer<typeof CreatePairingCodeBodySchema>
export type CreatePairingCodeResponse = z.infer<typeof CreatePairingCodeResponseSchema>
export type ClaimPairingCodeBody = z.infer<typeof ClaimPairingCodeBodySchema>
export type ClaimPairingCodeResponse = z.infer<typeof ClaimPairingCodeResponseSchema>
