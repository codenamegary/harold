const CREDENTIAL_PATTERN = /^demo_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

export type DemoIdentity = {
  credential: string
  deviceId: string
}

/**
 * Credentials are stateless on purpose: the device id is derived from the
 * token text. A restart can validate the same credential without a lookup
 * table, and the first request reseeds the device state.
 */
export const identityFromCredential = (credential: string): DemoIdentity | null => {
  const match = CREDENTIAL_PATTERN.exec(credential)
  const uuid = match?.[1]
  if (uuid === undefined) {
    return null
  }
  return {
    credential,
    deviceId: `device_${uuid}`,
  }
}

export const createCredential = (): string => `demo_${crypto.randomUUID()}`

export const createDeviceId = (): string => `device_${crypto.randomUUID()}`

export const parseBearerCredential = (authorization: string | null): string | null => {
  if (authorization === null) {
    return null
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization)
  return match?.[1] ?? null
}
