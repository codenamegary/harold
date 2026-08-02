const credentialPrefix = "devcred_"
const credentialByteLength = 32

export const createDeviceCredential = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(credentialByteLength))
  return `${credentialPrefix}${Buffer.from(bytes).toString("base64url")}`
}
