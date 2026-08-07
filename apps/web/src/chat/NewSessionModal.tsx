import React, { useMemo, useState } from "react"
import { AgentId } from "contracts/http/agent-settings"
import { Workspace } from "contracts/http/workspace"
import { Button } from "../design-system/Button"
import { Combobox, ComboboxOptionItem } from "../design-system/Combobox"
import { Modal } from "../design-system/Modal"
import { useDebouncedValue } from "../lib/use.debounced.value"
import { useWorkspacesInfiniteQuery } from "../workspace/use.workspaces.infinite.query"

const WORKSPACE_SEARCH_DEBOUNCE_MS = 250

type NewSessionModalProps = {
  open: boolean
  agents: ReadonlyArray<{ id: AgentId; displayName: string; enabled: boolean }>
  onClose: () => void
  onConfirm: (selection: { workspaceId: string; agentId: AgentId }) => void
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
  open,
  agents,
  onClose,
  onConfirm,
}) => {
  const [workspaceId, setWorkspaceId] = useState("")
  const [agentId, setAgentId] = useState<AgentId | "">("")
  const [workspaceQuery, setWorkspaceQuery] = useState("")

  const debouncedWorkspaceQuery = useDebouncedValue(
    workspaceQuery,
    WORKSPACE_SEARCH_DEBOUNCE_MS,
  )
  const workspacesQuery = useWorkspacesInfiniteQuery({
    q: debouncedWorkspaceQuery.trim() === "" ? undefined : debouncedWorkspaceQuery.trim(),
  })

  const workspaces =
    workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []

  const workspaceOptions = useMemo((): ComboboxOptionItem[] => {
    return workspaces.map((workspace: Workspace) => ({
      value: workspace.id,
      label: workspace.name,
      description: workspace.path,
    }))
  }, [workspaces])

  const agentOptions = useMemo((): ComboboxOptionItem[] => {
    return agents
      .filter((agent) => agent.enabled)
      .map((agent) => ({
        value: agent.id,
        label: agent.displayName,
      }))
  }, [agents])

  const canConfirm = workspaceId !== "" && agentId !== ""

  const handleClose = () => {
    setWorkspaceId("")
    setAgentId("")
    setWorkspaceQuery("")
    onClose()
  }

  const handleConfirm = () => {
    if (workspaceId === "" || agentId === "") {
      return
    }
    onConfirm({ workspaceId, agentId })
    setWorkspaceId("")
    setAgentId("")
    setWorkspaceQuery("")
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New session"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button disabled={!canConfirm} onClick={handleConfirm}>
            Continue
          </Button>
        </>
      }
    >
      <p className="m-0 mb-4 text-sm text-body-soft">
        Choose a workspace and agent, then send a prompt to start the session.
      </p>
      <div className="flex flex-col gap-4">
        <Combobox
          label="Workspace"
          aria-label="Workspace"
          value={workspaceId}
          onChange={setWorkspaceId}
          options={workspaceOptions}
          filter="external"
          onQueryChange={setWorkspaceQuery}
          placeholder="Select workspace…"
          emptyMessage={
            workspaceQuery.trim() === "" ? "No workspaces" : "No matches"
          }
        />
        <Combobox
          label="Agent"
          aria-label="Agent"
          value={agentId}
          onChange={(next) => setAgentId(next as AgentId | "")}
          options={agentOptions}
          placeholder="Select agent…"
        />
      </div>
    </Modal>
  )
}
