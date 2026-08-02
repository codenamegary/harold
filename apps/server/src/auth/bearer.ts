export type ParsedBearer =
  | { presented: false }
  | { presented: true; credential: string }
  | { presented: true; invalid: true }

const BEARER_PREFIX = "Bearer "

export const parseAuthorizationHeader = (
  authorization: string | string[] | undefined,
): ParsedBearer => {
  if (authorization === undefined) {
    return { presented: false }
  }

  const value = Array.isArray(authorization) ? authorization[0] : authorization
  if (value === undefined || value.length === 0) {
    return { presented: false }
  }

  if (!value.startsWith(BEARER_PREFIX)) {
    return { presented: true, invalid: true }
  }

  const credential = value.slice(BEARER_PREFIX.length).trim()
  if (credential.length === 0) {
    return { presented: true, invalid: true }
  }

  return { presented: true, credential }
}
