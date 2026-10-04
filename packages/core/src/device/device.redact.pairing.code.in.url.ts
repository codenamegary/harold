const pairingCodeInClaimPathPattern = /(\/v1\/pairing-codes\/)[A-Z0-9]{3}-[A-Z0-9]{3}(\/claim)/i

export const redactPairingCodeInUrl = (url: string): string =>
  url.replace(pairingCodeInClaimPathPattern, "$1[redacted]$2")
