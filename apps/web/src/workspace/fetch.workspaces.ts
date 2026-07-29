import { WorkspaceCollectionSchema, WorkspaceState } from "contracts/http/workspace"

export type FetchWorkspacesParams = {
  limit?: number
  cursor?: string
  q?: string
  state?: WorkspaceState
}

export const fetchWorkspaces = async (params: FetchWorkspacesParams = {}) => {
  const searchParams = new URLSearchParams()

  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit))
  }
  if (params.cursor !== undefined) {
    searchParams.set("cursor", params.cursor)
  }
  if (params.q !== undefined && params.q !== "") {
    searchParams.set("q", params.q)
  }
  if (params.state !== undefined) {
    searchParams.set("state", params.state)
  }

  const query = searchParams.toString()
  const url = query === "" ? "/v1/workspaces" : `/v1/workspaces?${query}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Workspaces fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return WorkspaceCollectionSchema.parse(payload)
}
