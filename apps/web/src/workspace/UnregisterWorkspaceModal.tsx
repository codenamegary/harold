import React, { useState } from "react"
import { Button } from "../design-system/Button"
import { Modal } from "../design-system/Modal"
import { isWorkspaceDeleteError } from "./delete.workspace"
import { useDeleteWorkspaceMutation } from "./use.delete.workspace.mutation"
import { workspaceMutationErrorMessage } from "./workspace.mutation.error.message"

type UnregisterWorkspaceModalProps = {
  workspaceId: string
  workspaceName: string
  open: boolean
  onClose: () => void
}

export const UnregisterWorkspaceModal: React.FC<UnregisterWorkspaceModalProps> = ({
  workspaceId,
  workspaceName,
  open,
  onClose,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const deleteWorkspaceMutation = useDeleteWorkspaceMutation()

  const handleClose = () => {
    setErrorMessage(undefined)
    onClose()
  }

  const handleUnregister = () => {
    setErrorMessage(undefined)

    deleteWorkspaceMutation.mutate(workspaceId, {
      onSuccess: () => {
        handleClose()
      },
      onError: (error) => {
        setErrorMessage(
          workspaceMutationErrorMessage(
            error,
            isWorkspaceDeleteError,
            "Could not unregister workspace.",
          ),
        )
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Unregister ${workspaceName}?`}
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            className="border-danger/40 bg-danger/15 text-danger hover:border-danger/60 hover:bg-danger/25 hover:text-danger/90"
            disabled={deleteWorkspaceMutation.isPending}
            onClick={handleUnregister}
          >
            Unregister
          </Button>
        </>
      }
    >
      <p className="m-0 text-base text-body-soft">
        This removes Agent Server metadata for this workspace. Workspace files are not deleted.
      </p>
      {errorMessage ? (
        <p className="mt-4 text-base text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </Modal>
  )
}
