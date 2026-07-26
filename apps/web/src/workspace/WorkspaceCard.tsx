import { Workspace } from "contracts/http/workspace"
import React, { useState } from "react"
import { InlineEditableText } from "../design-system/InlineEditableText"
import { Panel } from "../design-system/Panel"
import { StatusDot } from "../design-system/StatusDot"
import { isWorkspaceUpdateError } from "./updateWorkspace"
import { UnregisterWorkspaceModal } from "./UnregisterWorkspaceModal"
import { useUpdateWorkspaceMutation } from "./useUpdateWorkspaceMutation"
import { workspaceMutationErrorMessage } from "./workspaceMutationErrorMessage"
import { workspaceStateDisplayByState } from "./workspaceStateDisplay"

type WorkspaceCardProps = {
  workspace: Workspace
}

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ workspace }) => {
  const [isEditingName, setIsEditingName] = useState(false)
  const [isUnregisterModalOpen, setIsUnregisterModalOpen] = useState(false)
  const updateWorkspaceMutation = useUpdateWorkspaceMutation()
  const stateDisplay = workspaceStateDisplayByState[workspace.state]
  const renameError = updateWorkspaceMutation.isError
    ? workspaceMutationErrorMessage(
        updateWorkspaceMutation.error,
        isWorkspaceUpdateError,
        "Could not rename workspace.",
      )
    : undefined

  const handleRenameSave = async (name: string) => {
    await updateWorkspaceMutation.mutateAsync({
      workspaceId: workspace.id,
      body: { name },
    })
  }

  const handleRenameCancel = () => {
    updateWorkspaceMutation.reset()
  }

  return (
    <>
      <Panel
        aria-label={`${workspace.name} workspace`}
        className="p-4"
        role="article"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <StatusDot
              variant={stateDisplay.dotVariant}
              aria-label={stateDisplay.label}
              className="shrink-0"
            />
            <InlineEditableText
              value={workspace.name}
              onSave={handleRenameSave}
              onCancel={handleRenameCancel}
              onEditingChange={setIsEditingName}
              isSaving={updateWorkspaceMutation.isPending}
              error={renameError}
              ariaLabel={`Rename ${workspace.name}`}
            />
          </div>
          {!isEditingName ? (
            <button
              type="button"
              aria-label={`Unregister ${workspace.name}`}
              className="flex size-5 shrink-0 items-center justify-center self-center rounded text-base leading-none text-dim hover:text-red-400"
              onClick={() => setIsUnregisterModalOpen(true)}
            >
              ×
            </button>
          ) : null}
        </div>
        <p className="m-0 font-mono text-xs text-dim">{workspace.path}</p>
      </Panel>
      <UnregisterWorkspaceModal
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        open={isUnregisterModalOpen}
        onClose={() => setIsUnregisterModalOpen(false)}
      />
    </>
  )
}
