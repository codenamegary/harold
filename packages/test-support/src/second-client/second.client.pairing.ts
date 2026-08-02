import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"

export type ClaimPairingCodeBody = {
  name?: string
  platform?: string
}

export type PairDeviceResult = {
  pairingCode: string
  deviceId: string
  credential: string
  claim: ReturnType<typeof ClaimPairingCodeResponseSchema.parse>
}

export const createPairingCode = async (httpBase: string) => {
  const response = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  })

  if (response.status !== 201) {
    throw new Error(`create pairing code failed: ${response.status}`)
  }

  return CreatePairingCodeResponseSchema.parse(await response.json())
}

export const claimPairingCode = async (params: {
  httpBase: string
  code: string
  body?: ClaimPairingCodeBody
}) => {
  const response = await fetch(
    `${params.httpBase}${claimPairingCodePath(params.code)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params.body ?? {}),
    },
  )

  return {
    response,
    claim:
      response.status === 201
        ? ClaimPairingCodeResponseSchema.parse(await response.json())
        : null,
  }
}

export const pairDevice = async (params: {
  httpBase: string
  body?: ClaimPairingCodeBody
}): Promise<PairDeviceResult> => {
  const created = await createPairingCode(params.httpBase)
  const claimed = await claimPairingCode({
    httpBase: params.httpBase,
    code: created.code,
    body: params.body,
  })

  if (claimed.response.status !== 201 || claimed.claim === null) {
    throw new Error(`claim pairing code failed: ${claimed.response.status}`)
  }

  return {
    pairingCode: created.code,
    deviceId: claimed.claim.device.id,
    credential: claimed.claim.credential,
    claim: claimed.claim,
  }
}
