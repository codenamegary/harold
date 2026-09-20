import { useSetAtom } from "jotai"
import { AgentId } from "contracts/http/agent-settings"
import { useWorkspacesInfiniteQuery } from "../workspace/use.workspaces.infinite.query"
import { selectSessionAtom } from "../chat/selection/actions"
import { useCreateSessionMutation } from "./use.create.session.mutation"

export type StartNewSessionSelection = {
  workspaceId: string
  agentId: AgentId
}

/**
 * Starting a new session creates the ACP session up front, so model, mode and
 * effort can be set before the first prompt. The composer talks to the created
 * session directly; nothing is queued for later.
 */
export const useStartNewSession = (params: { onCreated?: () => void } = {}) => {
  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const selectSession = useSetAtom(selectSessionAtom)
  const createSessionMutation = useCreateSessionMutation()
  const onCreated = params.onCreated

  const start = (selection: StartNewSessionSelection) => {
    const workspace = workspacesQuery.data?.pages
      .flatMap((page) => page.items)
      .find((item) => item.id === selection.workspaceId)
    if (workspace === undefined) {
      return
    }

    createSessionMutation.mutate(
      { agentId: selection.agentId, cwd: workspace.path },
      {
        onSuccess: (created) => {
          selectSession({
            workspaceId: selection.workspaceId,
            agentId: created.agentId,
            sessionId: created.sessionId,
          })
          onCreated?.()
        },
      },
    )
  }

  const { error } = createSessionMutation
  return {
    start,
    creating: createSessionMutation.isPending,
    error: error === null ? null : error.message,
  }
}
