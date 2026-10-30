import { ClaimPairingCodeResponseSchema, claimPairingCodePath } from "contracts/http/pairing-code"
import { makeCreatePairingCode } from "core/device/create.pairing.code.usecase"
import { InsertPairingCode } from "core/device/ports"

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

const DEFAULT_ENDPOINT = "http://192.168.1.20:3847"

// Minting codes is a host operation against the app's database, so tests pass
// the server's insert port; only the claim crosses the network (#458).
export const createPairingCode = async (params: {
  insertPairingCode: InsertPairingCode
  endpoint?: string
}) => {
  const result = await makeCreatePairingCode({
    insertPairingCode: params.insertPairingCode,
  })(params.endpoint ?? DEFAULT_ENDPOINT)

  if (!result.ok) {
    throw new Error(`create pairing code failed: ${result.error.kind}`)
  }

  return result.value
}

export const claimPairingCode = async (params: {
  httpBase: string
  code: string
  body?: ClaimPairingCodeBody
}) => {
  const response = await fetch(`${params.httpBase}${claimPairingCodePath(params.code)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params.body ?? {}),
  })

  return {
    response,
    claim:
      response.status === 201 ? ClaimPairingCodeResponseSchema.parse(await response.json()) : null,
  }
}

export const pairDevice = async (params: {
  httpBase: string
  insertPairingCode: InsertPairingCode
  body?: ClaimPairingCodeBody
  endpoint?: string
}): Promise<PairDeviceResult> => {
  const created = await createPairingCode({
    insertPairingCode: params.insertPairingCode,
    endpoint: params.endpoint,
  })
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
