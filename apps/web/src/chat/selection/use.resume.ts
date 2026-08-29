import { useEffect, useRef } from "react"
import { useStore } from "jotai"
import { useSessionsQuery } from "../../session/use.sessions.query"
import { useWorkspacesInfiniteQuery } from "../../workspace/use.workspaces.infinite.query"
import { commitSelectionAtom } from "./actions"
import { clearChatSelection, readChatSelection } from "./persist"

export const useChatResume = (): void => {
  const store = useStore()
  const sessionsQuery = useSessionsQuery()
  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const hasAttemptedResume = useRef(false)

  useEffect(() => {
    if (hasAttemptedResume.current) {
      return
    }
    if (sessionsQuery.isLoading || sessionsQuery.isError) {
      return
    }

    hasAttemptedResume.current = true
    const saved = readChatSelection()
    if (saved === null || saved.sessionId === "") {
      return
    }

    const sessionItems = sessionsQuery.data?.items ?? []
    const matched = sessionItems.find(
      (session) =>
        session.sessionId === saved.sessionId && session.agentId === saved.agentId,
    )
    if (matched === undefined) {
      clearChatSelection()
      return
    }

    const workspaceItems =
      workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
    const resolvedWorkspaceId =
      workspaceItems.find((workspace) => workspace.path === matched.cwd)?.id ?? ""
    store.set(commitSelectionAtom, {
      workspaceId: resolvedWorkspaceId,
      agentId: matched.agentId,
      sessionId: matched.sessionId,
    })
  }, [
    sessionsQuery.data?.items,
    sessionsQuery.isError,
    sessionsQuery.isLoading,
    store,
    workspacesQuery.data?.pages,
  ])
}
