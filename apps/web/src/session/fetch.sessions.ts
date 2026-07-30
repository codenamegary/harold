import { SessionCollectionSchema } from "contracts/http/session"

export type FetchSessionsParams = {
  workspaceId: string
  limit?: number
  cursor?: string
}

export const fetchSessions = async (params: FetchSessionsParams) => {
  const searchParams = new URLSearchParams()
  searchParams.set("workspaceId", params.workspaceId)

  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit))
  }
  if (params.cursor !== undefined) {
    searchParams.set("cursor", params.cursor)
  }

  const response = await fetch(`/v1/sessions?${searchParams.toString()}`)

  if (!response.ok) {
    throw new Error(`Sessions fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return SessionCollectionSchema.parse(payload)
}
