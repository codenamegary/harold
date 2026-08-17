import React, { useState } from "react"
import { ImportDetectCandidate } from "contracts/http/agent-settings"
import { RefreshCw } from "lucide-react"
import { useConnection } from "../connection/use.connection"
import { Button } from "../design-system/Button"
import { Panel } from "../design-system/Panel"
import { TextInput } from "../design-system/TextInput"
import { AgentsImportDialog } from "./AgentsImportDialog"
import { AgentsTable } from "./AgentsTable"
import { isAgentImportApplyError } from "./apply.agent.import"
import { isCreateCustomAgentError } from "./create.custom.agent"
import { isAgentImportDetectError } from "./detect.agent.import"
import { filterAgentSettings } from "./filter.agent.settings"
import { sortAgentSettings } from "./sort.agent.settings"
import { useAgentSettingsQuery } from "./use.agent.settings.query"
import { useApplyAgentImportMutation } from "./use.apply.agent.import.mutation"
import { useCreateCustomAgentMutation } from "./use.create.custom.agent.mutation"
import { useDeleteAgentSettingsMutation } from "./use.delete.agent.settings.mutation"
import { useDetectAgentImportMutation } from "./use.detect.agent.import.mutation"
import { useDetectAgentPathMutation } from "./use.detect.agent.path.mutation"
import { useRespawnAgentMutation } from "./use.respawn.agent.mutation"
import { useUpdateAgentSettingsMutation } from "./use.update.agent.settings.mutation"

export const AgentsPanel: React.FC = () => {
  const { connection } = useConnection()
  const agentSettingsQuery = useAgentSettingsQuery()
  const updateMutation = useUpdateAgentSettingsMutation()
  const detectMutation = useDetectAgentPathMutation()
  const createCustomMutation = useCreateCustomAgentMutation()
  const deleteMutation = useDeleteAgentSettingsMutation()
  const respawnMutation = useRespawnAgentMutation()
  const detectImportMutation = useDetectAgentImportMutation()
  const applyImportMutation = useApplyAgentImportMutation()
  const agents = agentSettingsQuery.data?.items ?? []
  const controlsDisabled =
    connection.phase === "unreachable" ||
    agentSettingsQuery.isLoading ||
    agentSettingsQuery.isError

  const [searchQuery, setSearchQuery] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const [importCandidates, setImportCandidates] = useState<ImportDetectCandidate[]>([])
  const [importError, setImportError] = useState("")
  const [createError, setCreateError] = useState("")
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null)

  const filteredAgents = sortAgentSettings(filterAgentSettings(agents, searchQuery))

  const handleOpenImport = () => {
    setImportError("")
    detectImportMutation.mutate(undefined, {
      onSuccess: (result) => {
        setImportCandidates([...result.items])
        setImportOpen(true)
        detectImportMutation.reset()
      },
      onError: (error) => {
        const message = isAgentImportDetectError(error)
          ? error.problem.detail ?? error.message
          : "Could not detect agents from the live registry."
        setImportError(message)
      },
    })
  }

  const handleCloseImport = () => {
    if (applyImportMutation.isPending) {
      return
    }
    setImportOpen(false)
    setImportCandidates([])
    setImportError("")
    applyImportMutation.reset()
  }

  const handleApplyImport = (selectedIds: readonly string[]) => {
    const selected = importCandidates.filter((candidate) => selectedIds.includes(candidate.id))
    setImportError("")
    applyImportMutation.mutate(
      {
        agents: selected.map((candidate) => ({
          id: candidate.id,
          path: candidate.path,
          spawn: candidate.spawn,
        })),
      },
      {
        onSuccess: () => {
          setImportOpen(false)
          setImportCandidates([])
          applyImportMutation.reset()
        },
        onError: (error) => {
          const message = isAgentImportApplyError(error)
            ? error.problem.detail ?? error.message
            : "Could not enable selected agents."
          setImportError(message)
        },
      },
    )
  }

  const handleAddCustom = () => {
    setCreateError("")
    createCustomMutation.mutate(undefined, {
      onSuccess: (created) => {
        setExpandedAgentId(created.id)
        createCustomMutation.reset()
      },
      onError: (error) => {
        const message = isCreateCustomAgentError(error)
          ? error.problem.detail ?? error.message
          : "Could not create a custom agent."
        setCreateError(message)
      },
    })
  }

  return (
    <Panel className="mb-[25px] p-[22px]">
      <div className="mb-[22px] flex flex-wrap items-center justify-between gap-4">
        <h3 className="m-0 text-lg font-semibold">Agents</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Refresh agents"
            aria-busy={agentSettingsQuery.isFetching ? "true" : undefined}
            disabled={
              connection.phase === "unreachable" ||
              agentSettingsQuery.isError ||
              agentSettingsQuery.isFetching
            }
            className="grid size-8 shrink-0 place-items-center rounded-[7px] border border-line-strong bg-panel-2 text-dim transition-colors hover:border-line-hover-strong hover:bg-hover-surface-strong hover:text-lime cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void agentSettingsQuery.refetch()
            }}
          >
            <RefreshCw
              aria-hidden
              className={`size-3.5 ${agentSettingsQuery.isFetching ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
          </button>
          <Button
            type="button"
            variant="secondary"
            disabled={controlsDisabled || createCustomMutation.isPending}
            onClick={handleAddCustom}
          >
            {createCustomMutation.isPending ? "Adding…" : "Add"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={controlsDisabled || detectImportMutation.isPending}
            onClick={handleOpenImport}
          >
            {detectImportMutation.isPending ? "Detecting…" : "Import"}
          </Button>
        </div>
      </div>

      {agentSettingsQuery.isError ? (
        <p className="m-0 mb-3.5 text-sm text-red-400" role="alert">
          Could not load agent settings.
        </p>
      ) : null}

      {createError ? (
        <p className="m-0 mb-3.5 text-sm text-red-400" role="alert">
          {createError}
        </p>
      ) : null}

      {importError && !importOpen ? (
        <p className="m-0 mb-3.5 text-sm text-red-400" role="alert">
          {importError}
        </p>
      ) : null}

      <div className="mb-2.5">
        <TextInput
          type="search"
          role="searchbox"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onInput={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder="Search agents"
          aria-label="Search agents"
        />
      </div>

      <AgentsTable
        agents={filteredAgents}
        searchQuery={searchQuery}
        controlsDisabled={controlsDisabled}
        initiallyExpandedAgentId={expandedAgentId}
        updateMutation={updateMutation}
        detectMutation={detectMutation}
        deleteMutation={deleteMutation}
        respawnMutation={respawnMutation}
      />

      <AgentsImportDialog
        open={importOpen}
        candidates={importCandidates}
        isApplying={applyImportMutation.isPending}
        errorMessage={importOpen ? importError : ""}
        onClose={handleCloseImport}
        onApply={handleApplyImport}
      />
    </Panel>
  )
}
