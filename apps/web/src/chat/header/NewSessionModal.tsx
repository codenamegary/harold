import React, { useEffect, useMemo, useState } from "react"
import { AgentId } from "contracts/http/agent-settings"
import { Workspace } from "contracts/http/workspace"
import { Button } from "../../design-system/Button"
import { Combobox, ComboboxOptionItem } from "../../design-system/Combobox"
import { Modal } from "../../design-system/Modal"
import { useDebouncedValue } from "../../lib/use.debounced.value"
import { useWorkspacesInfiniteQuery } from "../../workspace/use.workspaces.infinite.query"

const WORKSPACE_SEARCH_DEBOUNCE_MS = 250

type NewSessionModalProps = {
  open: boolean
  agents: ReadonlyArray<{ id: AgentId; displayName: string; enabled: boolean }>
  /** Creating the ACP session after confirm; confirm stays disabled. */
  pending?: boolean
  /** Creation failure detail, shown inside the modal so it can be retried. */
  error?: string | null
  onClose: () => void
  onConfirm: (selection: { workspaceId: string; agentId: AgentId }) => void
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
  open,
  agents,
  pending = false,
  error = null,
  onClose,
  onConfirm,
}) => {
  const [workspaceId, setWorkspaceId] = useState("")
  const [agentId, setAgentId] = useState("")
  const [workspaceQuery, setWorkspaceQuery] = useState("")

  const debouncedWorkspaceQuery = useDebouncedValue(workspaceQuery, WORKSPACE_SEARCH_DEBOUNCE_MS)
  const workspacesQuery = useWorkspacesInfiniteQuery({
    q: debouncedWorkspaceQuery.trim() === "" ? undefined : debouncedWorkspaceQuery.trim(),
  })

  const workspaceOptions = useMemo((): ComboboxOptionItem[] => {
    const workspaces = workspacesQuery.data?.pages.flatMap((page) => page.items) ?? []
    return workspaces.map((workspace: Workspace) => ({
      value: workspace.id,
      label: workspace.name,
      description: workspace.path,
    }))
  }, [workspacesQuery.data])

  const agentOptions = useMemo((): ComboboxOptionItem[] => {
    return agents
      .filter((agent) => agent.enabled)
      .map((agent) => ({
        value: agent.id,
        label: agent.displayName,
      }))
  }, [agents])

  const canConfirm = workspaceId !== "" && agentId !== ""

  // Reset once the modal is gone, so a retry after failure keeps the
  // selections but a fresh open starts clean.
  useEffect(() => {
    if (!open) {
      setWorkspaceId("")
      setAgentId("")
      setWorkspaceQuery("")
    }
  }, [open])

  const handleClose = () => {
    onClose()
  }

  const handleConfirm = () => {
    if (workspaceId === "" || agentId === "" || pending) {
      return
    }
    onConfirm({ workspaceId, agentId })
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
          <Button disabled={!canConfirm || pending} onClick={handleConfirm}>
            {pending ? "Creating…" : "Continue"}
          </Button>
        </>
      }
    >
      <p className="m-0 mb-4 text-sm text-body-soft">
        Choose a workspace and agent to start the session.
      </p>
      {error !== null && error !== "" ? (
        <p className="m-0 mb-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
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
          emptyMessage={workspaceQuery.trim() === "" ? "No workspaces" : "No matches"}
        />
        <Combobox
          label="Agent"
          aria-label="Agent"
          value={agentId}
          onChange={setAgentId}
          options={agentOptions}
          placeholder="Select agent…"
        />
      </div>
    </Modal>
  )
}
