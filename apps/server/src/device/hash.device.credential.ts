import { createHash } from "node:crypto"

export const hashDeviceCredential = (credential: string): string =>
  createHash("sha256").update(credential).digest("hex")
