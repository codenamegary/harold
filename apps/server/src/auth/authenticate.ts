import { hashDeviceCredential } from "core/device/hash.credential"
import { parseAuthorizationHeader } from "./bearer"
import { devicePrincipal, hostPrincipal, Principal, unauthenticatedPrincipal } from "./principal"

export type DeviceCredentialLookup = {
  id: string
  revokedAt: string | null
}

export type AuthenticateParams = {
  authorization: string | string[] | undefined
  isLoopback: boolean
  lookupByCredentialHash: (credentialHash: string) => DeviceCredentialLookup | undefined
}

export type AuthenticateResult = {
  principal: Principal
  credentialPresented: boolean
}

export const authenticate = (params: AuthenticateParams): AuthenticateResult => {
  const parsed = parseAuthorizationHeader(params.authorization)

  if (parsed.presented === false) {
    if (params.isLoopback) {
      return { principal: hostPrincipal(), credentialPresented: false }
    }

    return { principal: unauthenticatedPrincipal(), credentialPresented: false }
  }

  if ("invalid" in parsed) {
    return { principal: unauthenticatedPrincipal(), credentialPresented: true }
  }

  const credentialHash = hashDeviceCredential(parsed.credential)
  const device = params.lookupByCredentialHash(credentialHash)

  if (device === undefined || device.revokedAt !== null) {
    return { principal: unauthenticatedPrincipal(), credentialPresented: true }
  }

  return {
    principal: devicePrincipal(device.id),
    credentialPresented: true,
  }
}
