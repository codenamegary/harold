import React, { useState } from "react"
import { ImportDetectCandidate } from "contracts/http/agent-settings"
import { useConnection } from "../connection/use.connection"
import { Button } from "../design-system/Button"
import { Panel } from "../design-system/Panel"
import { SectionKicker } from "../design-system/SectionKicker"
import { AgentsImportDialog } from "./AgentsImportDialog"
import { AgentSettingsCard } from "./AgentSettingsCard"
import { isAgentImportApplyError } from "./apply.agent.import"
import { isAgentImportDetectError } from "./detect.agent.import"
import { useAgentSettingsQuery } from "./use.agent.settings.query"
import { useApplyAgentImportMutation } from "./use.apply.agent.import.mutation"
import { useDetectAgentImportMutation } from "./use.detect.agent.import.mutation"
import { useDetectAgentPathMutation } from "./use.detect.agent.path.mutation"
import { useUpdateAgentSettingsMutation } from "./use.update.agent.settings.mutation"

export const AgentsPanel: React.FC = () => {
  const { connection } = useConnection()
  const agentSettingsQuery = useAgentSettingsQuery()
  const updateMutation = useUpdateAgentSettingsMutation()
  const detectMutation = useDetectAgentPathMutation()
  const detectImportMutation = useDetectAgentImportMutation()
  const applyImportMutation = useApplyAgentImportMutation()
  const agents = agentSettingsQuery.data?.items ?? []
  const controlsDisabled =
    connection.phase === "unreachable" ||
    agentSettingsQuery.isLoading ||
    agentSettingsQuery.isError

  const [importOpen, setImportOpen] = useState(false)
  const [importCandidates, setImportCandidates] = useState<ImportDetectCandidate[]>([])
  const [importError, setImportError] = useState("")

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

  return (
    <Panel className="mb-[25px] p-[22px]">
      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionKicker>AGENT RUNTIME</SectionKicker>
          <h3 className="m-0 text-lg font-semibold">Agents</h3>
          <p className="m-0 mt-2 max-w-2xl text-sm text-muted">
            Catalog agents are always listed. Presence is probed locally on load. Use Import to
            detect present agents from the live registry and enable the ones you want.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={controlsDisabled || detectImportMutation.isPending}
          onClick={handleOpenImport}
        >
          {detectImportMutation.isPending ? "Detecting…" : "Import"}
        </Button>
      </div>

      {agentSettingsQuery.isError ? (
        <p className="m-0 mb-3.5 text-sm text-red-400" role="alert">
          Could not load agent settings.
        </p>
      ) : null}

      {importError && !importOpen ? (
        <p className="m-0 mb-3.5 text-sm text-red-400" role="alert">
          {importError}
        </p>
      ) : null}

      <div className="grid gap-3.5 lg:grid-cols-2">
        {agents.map((agent) => (
          <AgentSettingsCard
            key={agent.id}
            agent={agent}
            controlsDisabled={controlsDisabled}
            updateMutation={updateMutation}
            detectMutation={detectMutation}
          />
        ))}
      </div>

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
