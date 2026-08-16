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

const formatUpdatedAt = (value: string): string => {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return value
  }
  return new Date(parsed).toLocaleString()
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

  const allVisibleSelected =
    visibleSessions.length > 0 &&
    visibleSessions.every((session) =>
      selectedKeys.has(
        catalogSessionKey({
          agentId: session.agentId,
          sessionId: session.sessionId,
        }),
      ),
    )

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

  const toggleSelectAllVisible = () => {
    setSelectedKeys((current) => {
      if (allVisibleSelected) {
        const next = new Set(current)
        for (const session of visibleSessions) {
          next.delete(
            catalogSessionKey({
              agentId: session.agentId,
              sessionId: session.sessionId,
            }),
          )
        }
        return next
      }

      const next = new Set(current)
      for (const session of visibleSessions) {
        next.add(
          catalogSessionKey({
            agentId: session.agentId,
            sessionId: session.sessionId,
          }),
        )
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
      <header className="flex min-h-[64px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 max-[820px]:p-[13px]">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
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

          {error !== null ? (
            <p className="m-0 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <Button
          variant="primary"
          onClick={() => setIsNewSessionModalOpen(true)}
        >
          New session
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#252b34_transparent]">
        {sessionsQuery.isLoading ? (
          <p className="m-0 px-5 py-6 text-sm text-dim">Loading sessions…</p>
        ) : sessionsQuery.isError ? (
          <p className="m-0 px-5 py-6 text-sm text-danger" role="alert">
            Failed to load sessions.
          </p>
        ) : (
          <table
            className="w-full border-collapse text-left"
            role="table"
            aria-label="Sessions"
          >
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="border-b border-line-soft">
                <th scope="col" className="w-10 px-5 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all sessions"
                    checked={allVisibleSelected}
                    disabled={visibleSessions.length === 0}
                    onChange={toggleSelectAllVisible}
                    className="size-4"
                  />
                </th>
                <th
                  scope="col"
                  className="px-3 py-3 font-mono text-2xs font-medium tracking-wide text-label"
                >
                  Title
                </th>
                <th
                  scope="col"
                  className="px-3 py-3 font-mono text-2xs font-medium tracking-wide text-label max-[820px]:hidden"
                >
                  Agent
                </th>
                <th
                  scope="col"
                  className="px-3 py-3 font-mono text-2xs font-medium tracking-wide text-label max-[820px]:hidden"
                >
                  Path
                </th>
                <th
                  scope="col"
                  className="px-3 py-3 font-mono text-2xs font-medium tracking-wide text-label max-[640px]:hidden"
                >
                  Updated
                </th>
                <th scope="col" className="w-16 px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleSessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-sm text-dim"
                  >
                    No sessions match.
                  </td>
                </tr>
              ) : (
                visibleSessions.map((session) => {
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
                    <tr
                      key={key}
                      className="border-b border-line-soft last:border-b-0 hover:bg-hover-surface/40"
                    >
                      <td className="px-5 py-3 align-middle">
                        <input
                          type="checkbox"
                          aria-label={`Select ${session.title}`}
                          checked={checked}
                          onChange={() => toggleSelected(key)}
                          className="size-4"
                        />
                      </td>
                      <td className="min-w-0 px-3 py-3 align-middle">
                        <button
                          type="button"
                          className="max-w-full border-0 bg-transparent p-0 text-left"
                          aria-label={`Open ${session.title}`}
                          onClick={() => handleJoin(session)}
                        >
                          <span className="block truncate text-sm font-medium text-white">
                            {session.title}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-xs text-dim min-[821px]:hidden">
                            {session.agentId} · {session.cwd}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3 align-middle font-mono text-xs text-dim max-[820px]:hidden">
                        {session.agentId}
                      </td>
                      <td className="max-w-[28rem] truncate px-3 py-3 align-middle font-mono text-xs text-dim max-[820px]:hidden">
                        {session.cwd}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-middle text-xs text-body-soft max-[640px]:hidden">
                        {formatUpdatedAt(session.updatedAt)}
                      </td>
                      <td className="px-5 py-3 align-middle">
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
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <NewSessionModal
        open={isNewSessionModalOpen}
        agents={agents}
        onClose={() => setIsNewSessionModalOpen(false)}
        onConfirm={(selection) => {
          setIsNewSessionModalOpen(false)
          handleStartNewSession(selection)
        }}
      />
    </div>
  )
}
