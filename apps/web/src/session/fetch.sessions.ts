import { SessionCollectionSchema } from "contracts/http/session"

export type FetchSessionsParams = {
  cwd?: string
  limit?: number
  cursor?: string
}

export const fetchSessions = async (params: FetchSessionsParams = {}) => {
  const searchParams = new URLSearchParams()

  if (params.cwd !== undefined && params.cwd !== "") {
    searchParams.set("cwd", params.cwd)
  }
  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit))
  }
  if (params.cursor !== undefined) {
    searchParams.set("cursor", params.cursor)
  }

  const query = searchParams.toString()
  const url = query === "" ? "/v1/sessions" : `/v1/sessions?${query}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Sessions fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return SessionCollectionSchema.parse(payload)
}
