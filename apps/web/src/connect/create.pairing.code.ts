import {
  CreatePairingCodeBody,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
} from "contracts/http/pairing-code"

export const createPairingCode = async (body: CreatePairingCodeBody = {}) => {
  const response = await fetch(PAIRING_CODES_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Pairing code create failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return CreatePairingCodeResponseSchema.parse(payload)
}
