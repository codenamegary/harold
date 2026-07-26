import React, { useState } from "react"
import { Button } from "../design-system/Button"
import { Modal } from "../design-system/Modal"
import { isWorkspaceDeleteError } from "./deleteWorkspace"
import { useDeleteWorkspaceMutation } from "./useDeleteWorkspaceMutation"
import { workspaceMutationErrorMessage } from "./workspaceMutationErrorMessage"

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
            className="border-red-500/40 bg-red-500/15 text-red-300 hover:border-red-400 hover:bg-red-500/25 hover:text-red-200"
            disabled={deleteWorkspaceMutation.isPending}
            onClick={handleUnregister}
          >
            Unregister
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-body-soft">
        This removes Agent Server metadata for this workspace. Workspace files are not deleted.
      </p>
      {errorMessage ? (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </Modal>
  )
}
