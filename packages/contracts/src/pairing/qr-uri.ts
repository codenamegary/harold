import { z } from "zod"
import { PairingCodeValueSchema } from "../http/pairing-code"

export const PAIRING_QR_SCHEME = "harold" as const
export const PAIRING_QR_HOST = "pair" as const
export const PAIRING_QR_VERSION = 1 as const

export type FormatPairingQrUriInput = {
  endpoint: string
  code: string
}

export type ParsePairingQrUriOptions = {
  rejectCleartext?: boolean
}

export type ParsedPairingQrUri = {
  version: typeof PAIRING_QR_VERSION
  endpoint: string
  code: string
}

export const pairingQrParseError = (message: string): Error => {
  const error = new Error(message)
  error.name = "PairingQrParseError"
  return error
}

const EndpointSchema = z.url()

const encodeComponent = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )

const decodeComponent = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"))
  } catch {
    throw pairingQrParseError("Invalid pairing URI")
  }
}

const parseQuery = (rawQuery: string): Map<string, string[]> => {
  const params = new Map<string, string[]>()

  for (const pair of rawQuery.split("&")) {
    if (pair.length === 0) {
      continue
    }

    const separatorIndex = pair.indexOf("=")

    if (separatorIndex <= 0) {
      throw pairingQrParseError("Invalid pairing URI")
    }

    const key = decodeComponent(pair.slice(0, separatorIndex))
    const value = decodeComponent(pair.slice(separatorIndex + 1))
    const existing = params.get(key) ?? []
    existing.push(value)
    params.set(key, existing)
  }

  return params
}

const readSingleParam = (params: Map<string, string[]>, key: string): string | null => {
  const values = params.get(key)

  if (values === undefined) {
    return null
  }

  if (values.length > 1) {
    throw pairingQrParseError(`Duplicate ${key} parameter`)
  }

  return values[0] ?? null
}

const rejectCleartextEndpoint = (endpoint: string): void => {
  if (endpoint.startsWith("http://")) {
    throw pairingQrParseError("Cleartext endpoint is not allowed")
  }
}

export const formatPairingQrUri = (input: FormatPairingQrUriInput): string => {
  const endpoint = EndpointSchema.parse(input.endpoint)
  const code = PairingCodeValueSchema.parse(input.code)

  return `${PAIRING_QR_SCHEME}://${PAIRING_QR_HOST}?v=${PAIRING_QR_VERSION}&endpoint=${encodeComponent(endpoint)}&code=${encodeComponent(code)}`
}

export const parsePairingQrUri = (
  payload: string,
  options: ParsePairingQrUriOptions = {},
): ParsedPairingQrUri => {
  const trimmed = payload.trim()

  if (trimmed.startsWith("{")) {
    throw pairingQrParseError("Legacy JSON pairing payload is not supported")
  }

  const schemePrefix = `${PAIRING_QR_SCHEME}://`

  if (!trimmed.startsWith(schemePrefix)) {
    throw pairingQrParseError("Invalid pairing URI scheme")
  }

  const withoutScheme = trimmed.slice(schemePrefix.length)
  const queryIndex = withoutScheme.indexOf("?")

  if (queryIndex === -1) {
    throw pairingQrParseError("Invalid pairing URI")
  }

  const hostAndPath = withoutScheme.slice(0, queryIndex)
  const rawQuery = withoutScheme.slice(queryIndex + 1)
  const host = hostAndPath.split("/")[0]

  if (host !== PAIRING_QR_HOST) {
    throw pairingQrParseError("Invalid pairing URI host")
  }

  if (hostAndPath.includes("/")) {
    throw pairingQrParseError("Invalid pairing URI path")
  }

  const params = parseQuery(rawQuery)
  const versionRaw = readSingleParam(params, "v")

  if (versionRaw === null) {
    throw pairingQrParseError("Missing version parameter")
  }

  if (versionRaw !== String(PAIRING_QR_VERSION)) {
    throw pairingQrParseError("Unsupported pairing URI version")
  }

  const endpointRaw = readSingleParam(params, "endpoint")

  if (endpointRaw === null) {
    throw pairingQrParseError("Missing endpoint parameter")
  }

  const endpoint = EndpointSchema.parse(endpointRaw)

  if (options.rejectCleartext === true) {
    rejectCleartextEndpoint(endpoint)
  }

  const codeRaw = readSingleParam(params, "code")

  if (codeRaw === null) {
    throw pairingQrParseError("Missing code parameter")
  }

  const code = PairingCodeValueSchema.parse(codeRaw)

  return {
    version: PAIRING_QR_VERSION,
    endpoint,
    code,
  }
}
