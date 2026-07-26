import { Workspace } from "contracts/http/workspace"
import React, { useState } from "react"
import { InlineEditableText } from "../design-system/InlineEditableText"
import { Panel } from "../design-system/Panel"
import { StatusDot } from "../design-system/StatusDot"
import { isWorkspaceUpdateError } from "./updateWorkspace"
import { UnregisterWorkspaceModal } from "./UnregisterWorkspaceModal"
import { useUpdateWorkspaceMutation } from "./useUpdateWorkspaceMutation"
import { workspaceStateDisplayByState } from "./workspaceStateDisplay"

type WorkspaceCardProps = {
  workspace: Workspace
}

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ workspace }) => {
  const [isEditingName, setIsEditingName] = useState(false)
  const [renameError, setRenameError] = useState<string | undefined>(undefined)
  const [isUnregisterModalOpen, setIsUnregisterModalOpen] = useState(false)
  const updateWorkspaceMutation = useUpdateWorkspaceMutation()
  const stateDisplay = workspaceStateDisplayByState[workspace.state]

  const handleRenameSave = async (name: string) => {
    setRenameError(undefined)

    try {
      await updateWorkspaceMutation.mutateAsync({
        workspaceId: workspace.id,
        body: { name },
      })
    } catch (error: unknown) {
      if (isWorkspaceUpdateError(error)) {
        setRenameError(error.problem.detail)
      } else {
        setRenameError("Could not rename workspace.")
      }

      throw error
    }
  }

  const handleRenameCancel = () => {
    setRenameError(undefined)
  }

  return (
    <>
      <Panel
        aria-label={`${workspace.name} workspace`}
        className="p-4"
        role="article"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <StatusDot
              variant={stateDisplay.dotVariant}
              aria-label={stateDisplay.label}
              className="mt-[5px]"
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
              className="grid size-7 shrink-0 place-items-center rounded text-dim hover:text-red-400"
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
