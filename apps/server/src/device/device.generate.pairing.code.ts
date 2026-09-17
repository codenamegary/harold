import { PairingCodeValueSchema } from "contracts/http/pairing-code"

// Unambiguous alphabet: no 0/O/1/I (RFC 8628 hygiene). Matches XXX-XXX contract.
const pairingCodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" as const

const pickChar = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(1))
  const byte = bytes[0]
  if (byte === undefined) {
    throw new Error("CSPRNG returned empty buffer")
  }
  const index = byte % pairingCodeAlphabet.length
  const char = pairingCodeAlphabet[index]
  if (char === undefined) {
    throw new Error("pairing code alphabet index out of range")
  }
  return char
}

const generateSegment = (length: number): string =>
  Array.from({ length }, () => pickChar()).join("")

export const generatePairingCode = () =>
  PairingCodeValueSchema.parse(`${generateSegment(3)}-${generateSegment(3)}`)

export const normalizePairingCode = (code: string): string => code.toUpperCase()
