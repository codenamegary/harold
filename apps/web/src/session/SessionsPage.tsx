import React, { useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { AgentId, AgentIdSchema } from "contracts/http/agent-settings"
import { SessionDeleteTarget } from "contracts/http/session"
import { Button } from "../design-system/Button"
import { ConfirmDeleteIconButton } from "../design-system/ConfirmDeleteIconButton"
import { TextInput } from "../design-system/TextInput"
import { NewSessionModal } from "../chat/NewSessionModal"
import {
  readChatSelection,
  writeChatSelection,
} from "../chat/chat.selection.storage"
import { useAgentSettingsQuery } from "../agent-settings/use.agent.settings.query"
import { useWorkspacesInfiniteQuery } from "../workspace/use.workspaces.infinite.query"
import { catalogSessionKey } from "./catalog.session.key"
import { filterSessionsByTitle } from "./session.list.helpers"
import { useCreateSessionMutation } from "./use.create.session.mutation"
import { useDeleteSessionsMutation } from "./use.delete.session.mutation"
import { isSessionDeleteError } from "./delete.session"
import { useSessionsQuery } from "./use.sessions.query"

const targetKey = (target: SessionDeleteTarget) =>
  catalogSessionKey({
    agentId: target.agentId,
    sessionId: target.sessionId,
  })

const clearSelectionIfDeleted = (
  deleted: ReadonlyArray<SessionDeleteTarget>,
) => {
  const selection = readChatSelection()
  if (selection === null || selection.sessionId === "") {
    return
  }

  const hit = deleted.some(
    (item) =>
      item.sessionId === selection.sessionId &&
      item.agentId === selection.agentId,
  )
  if (!hit) {
    return
  }

  writeChatSelection({
    workspaceId: selection.workspaceId,
    agentId: selection.agentId,
    sessionId: "",
  })
}

export const SessionsPage: React.FC = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false)

  const sessionsQuery = useSessionsQuery()
  const workspacesQuery = useWorkspacesInfiniteQuery({})
  const agentsQuery = useAgentSettingsQuery()
  const createSessionMutation = useCreateSessionMutation()
  const deleteSessionsMutation = useDeleteSessionsMutation()

  const workspaces =
    workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const agents = agentsQuery.data?.items ?? []
  const sessions = useMemo(
    () => sessionsQuery.data?.items ?? [],
    [sessionsQuery.data?.items],
  )
  const visibleSessions = useMemo(
    () => filterSessionsByTitle(sessions, search),
    [sessions, search],
  )

  const selectedTargets = useMemo((): SessionDeleteTarget[] => {
    return visibleSessions
      .filter((session) =>
        selectedKeys.has(
          catalogSessionKey({
            agentId: session.agentId,
            sessionId: session.sessionId,
          }),
        ),
      )
      .map((session) => ({
        agentId: session.agentId,
        sessionId: session.sessionId,
      }))
  }, [visibleSessions, selectedKeys])

  const toggleSelected = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleJoin = (session: {
    agentId: string
    sessionId: string
    cwd: string
  }) => {
    const parsedAgent = AgentIdSchema.safeParse(session.agentId)
    if (!parsedAgent.success) {
      return
    }

    const workspaceId =
      workspaces.find((workspace) => workspace.path === session.cwd)?.id ?? ""
    writeChatSelection({
      workspaceId,
      agentId: parsedAgent.data,
      sessionId: session.sessionId,
    })
    void navigate("/chat")
  }

  const runDelete = (items: ReadonlyArray<SessionDeleteTarget>) => {
    setError(null)
    deleteSessionsMutation.mutate(items, {
      onSuccess: (result) => {
        clearSelectionIfDeleted(result.deleted)
        setSelectedKeys((current) => {
          const next = new Set(current)
          for (const item of result.deleted) {
            next.delete(targetKey(item))
          }
          return next
        })
        setBulkConfirming(false)
        if (result.failed.length > 0) {
          setError(
            `Failed to delete ${result.failed.length} session${result.failed.length === 1 ? "" : "s"}.`,
          )
        }
      },
      onError: (err) => {
        setBulkConfirming(false)
        setError(isSessionDeleteError(err) ? err.problem.detail : err.message)
      },
    })
  }

  const handleStartNewSession = (selection: {
    workspaceId: string
    agentId: AgentId
  }) => {
    const workspace = workspaces.find(
      (item) => item.id === selection.workspaceId,
    )
    if (workspace === undefined) {
      setError("Workspace not found")
      return
    }

    createSessionMutation.mutate(
      { agentId: selection.agentId, cwd: workspace.path },
      {
        onSuccess: (created) => {
          writeChatSelection({
            workspaceId: selection.workspaceId,
            agentId: selection.agentId,
            sessionId: created.sessionId,
          })
          void navigate("/chat")
        },
        onError: (err) => {
          setError(err.message)
        },
      },
    )
  }

  return (
    <main>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-white">Manage sessions</h2>
          <p className="mt-1 mb-0 text-sm text-dim">
            Search, open, and delete agent sessions.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsNewSessionModalOpen(true)}
        >
          New session
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex h-9 w-[280px] max-w-full items-center gap-2 rounded-[7px] border border-line bg-[#0c0f14] px-[11px] text-dim">
          <span aria-hidden>⌕</span>
          <TextInput
            aria-label="Search sessions"
            className="min-h-0 border-0 bg-transparent p-0 text-sm focus:border-transparent"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sessions…"
            role="searchbox"
            type="search"
            value={search}
          />
        </label>

        {selectedTargets.length > 0 ? (
          <div className="flex items-center gap-2">
            {bulkConfirming ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deleteSessionsMutation.isPending}
                  onClick={() => runDelete(selectedTargets)}
                >
                  {deleteSessionsMutation.isPending
                    ? "Deleting…"
                    : `Confirm delete ${selectedTargets.length}`}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deleteSessionsMutation.isPending}
                  onClick={() => setBulkConfirming(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setBulkConfirming(true)}
              >
                Delete selected ({selectedTargets.length})
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {error !== null ? (
        <p className="m-0 mb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {sessionsQuery.isLoading ? (
        <p className="m-0 text-sm text-dim">Loading sessions…</p>
      ) : sessionsQuery.isError ? (
        <p className="m-0 text-sm text-danger" role="alert">
          Failed to load sessions.
        </p>
      ) : visibleSessions.length === 0 ? (
        <p className="m-0 text-sm text-dim">No sessions match.</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0" aria-label="Sessions">
          {visibleSessions.map((session) => {
            const key = catalogSessionKey({
              agentId: session.agentId,
              sessionId: session.sessionId,
            })
            const checked = selectedKeys.has(key)
            const deletingThis =
              deleteSessionsMutation.isPending &&
              deleteSessionsMutation.variables?.some(
                (item) => targetKey(item) === key,
              ) === true

            return (
              <li
                key={key}
                className="flex items-center gap-3 rounded-lg border border-line-soft bg-[#0d1015] px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${session.title}`}
                  checked={checked}
                  onChange={() => toggleSelected(key)}
                  className="size-4 shrink-0"
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
                  aria-label={`Open ${session.title}`}
                  onClick={() => handleJoin(session)}
                >
                  <span className="block truncate text-sm font-medium text-white">
                    {session.title}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-dim">
                    {session.agentId} · {session.cwd}
                  </span>
                </button>
                <ConfirmDeleteIconButton
                  aria-label={`Delete ${session.title}`}
                  pending={deletingThis && selectedTargets.length <= 1}
                  onConfirm={() =>
                    runDelete([
                      {
                        agentId: session.agentId,
                        sessionId: session.sessionId,
                      },
                    ])
                  }
                />
              </li>
            )
          })}
        </ul>
      )}

      <NewSessionModal
        open={isNewSessionModalOpen}
        agents={agents}
        onClose={() => setIsNewSessionModalOpen(false)}
        onConfirm={(selection) => {
          setIsNewSessionModalOpen(false)
          handleStartNewSession(selection)
        }}
      />
    </main>
  )
}
