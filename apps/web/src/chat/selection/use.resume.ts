import { useEffect, useRef } from "react"
import { useSetAtom } from "jotai"
import { useSessionsQuery } from "../../session/use.sessions.query"
import { useWorkspacesInfiniteQuery } from "../../workspace/use.workspaces.infinite.query"
import { adoptSessionAtom } from "./actions"
import { clearChatSelection, readChatSelection } from "./persist"

export const useChatResume = (): void => {
  const adoptSession = useSetAtom(adoptSessionAtom)
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
    adoptSession({
      workspaceId: resolvedWorkspaceId,
      agentId: matched.agentId,
      sessionId: matched.sessionId,
    })
  }, [
    adoptSession,
    sessionsQuery.data?.items,
    sessionsQuery.isError,
    sessionsQuery.isLoading,
    workspacesQuery.data?.pages,
  ])
}
