import React, { FormEvent, useState } from "react"
import { Button } from "../design-system/Button"
import { FieldLabel } from "../design-system/FieldLabel"
import { Modal } from "../design-system/Modal"
import { TextInput } from "../design-system/TextInput"
import { isWorkspaceCreateError } from "./createWorkspace"
import { useCreateWorkspaceMutation } from "./useCreateWorkspaceMutation"

type AddWorkspaceModalProps = {
  open: boolean
  onClose: () => void
}

export const AddWorkspaceModal: React.FC<AddWorkspaceModalProps> = ({ open, onClose }) => {
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const createWorkspaceMutation = useCreateWorkspaceMutation()

  const resetForm = () => {
    setName("")
    setPath("")
    setErrorMessage(undefined)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(undefined)

    try {
      await createWorkspaceMutation.mutateAsync({ name, path })
      handleClose()
    } catch (error: unknown) {
      if (isWorkspaceCreateError(error)) {
        const fieldSuffix = error.problem.fieldError ? ` ${error.problem.fieldError}` : ""
        setErrorMessage(`${error.problem.detail}${fieldSuffix}`)
        return
      }

      setErrorMessage("Could not add workspace.")
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add workspace"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            disabled={createWorkspaceMutation.isPending}
            form="add-workspace-form"
            type="submit"
          >
            Add workspace
          </Button>
        </>
      }
    >
      <form id="add-workspace-form" onSubmit={handleSubmit}>
        <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
        <TextInput
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="My project"
          required
        />
        <FieldLabel htmlFor="workspace-path">Path</FieldLabel>
        <TextInput
          id="workspace-path"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="/home/operator/projects/my-project"
          required
        />
        {errorMessage ? (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
