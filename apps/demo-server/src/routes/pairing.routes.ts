import { createCredential, identityFromCredential } from "../demo.auth"
import { DemoStore } from "../demo.state"
import { jsonResponse } from "./http"
import { badRequest, discardBody, rateLimited } from "./http"

/**
 * Pairing is deliberately permissive. Any three characters, a dash, and any
 * three more characters is accepted, in any case. The store review must never
 * be blocked by our own code alphabet.
 */
const isPairingCodeShape = (code: string): boolean => code.length === 7 && code[3] === "-"

export const claimPairingCodeResponse = async (params: {
  request: Request
  store: DemoStore
  code: string
}): Promise<Response> => {
  if (!isPairingCodeShape(params.code)) {
    return badRequest("#/code", "validation.pairingCode.invalid")
  }

  // The claim body is ignored. Drop it without parsing or storing it.
  await discardBody(params.request)

  const credential = createCredential()
  const identity = identityFromCredential(credential)
  if (identity === null) {
    return rateLimited("Could not issue a demo credential")
  }

  const ensured = params.store.ensureDevice(identity.deviceId)
  if (!ensured.ok) {
    return rateLimited("The demo server is at its device limit")
  }

  return jsonResponse(
    {
      device: ensured.state.device,
      credential,
    },
    200,
  )
}
