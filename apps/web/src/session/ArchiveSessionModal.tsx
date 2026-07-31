import React, { useState } from "react"
import { Button } from "../design-system/Button"
import { Modal } from "../design-system/Modal"
import { isSessionArchiveError } from "./archive.session"
import { sessionMutationErrorMessage } from "./session.mutation.error.message"
import { useArchiveSessionMutation } from "./use.archive.session.mutation"

type ArchiveSessionModalProps = {
  sessionId: string
  sessionName: string
  open: boolean
  onClose: () => void
  onArchived: () => void
}

export const ArchiveSessionModal: React.FC<ArchiveSessionModalProps> = ({
  sessionId,
  sessionName,
  open,
  onClose,
  onArchived,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const archiveSessionMutation = useArchiveSessionMutation()

  const handleClose = () => {
    setErrorMessage(undefined)
    onClose()
  }

  const handleArchive = () => {
    setErrorMessage(undefined)

    archiveSessionMutation.mutate(sessionId, {
      onSuccess: () => {
        onClose()
        onArchived()
      },
      onError: (error) => {
        setErrorMessage(
          sessionMutationErrorMessage(
            error,
            isSessionArchiveError,
            "Could not archive session.",
          ),
        )
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Archive ${sessionName}?`}
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            className="border-red-500/40 bg-red-500/15 text-red-300 hover:border-red-400 hover:bg-red-500/25 hover:text-red-200"
            disabled={archiveSessionMutation.isPending}
            onClick={handleArchive}
          >
            Archive
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-body-soft">
        This removes the session from the live list. Journal history is kept.
      </p>
      {errorMessage ? (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </Modal>
  )
}
