import React, { FormEvent, useMemo, useState } from "react"
import { Link } from "react-router"
import { Button } from "../design-system/Button"
import { Combobox, ComboboxOptionItem } from "../design-system/Combobox"
import { FieldLabel } from "../design-system/FieldLabel"
import { Modal } from "../design-system/Modal"
import { TextInput } from "../design-system/TextInput"
import { useFilesystemDirectoriesQuery } from "../filesystem/use.filesystem.directories.query"
import { useRuntimeSettingsQuery } from "../runtime-settings/use.runtime.settings.query"
import { isWorkspaceCreateError } from "./create.workspace"
import { useCreateWorkspaceMutation } from "./use.create.workspace.mutation"
import { workspaceMutationErrorMessage } from "./workspace.mutation.error.message"

type AddWorkspaceModalProps = {
  open: boolean
  onClose: () => void
}

const folderBasename = (folderPath: string) => {
  const segments = folderPath.split("/").filter((segment) => segment !== "")
  const last = segments[segments.length - 1]
  if (last === undefined) {
    throw new Error("folder path must include a basename")
  }
  return last
}

export const AddWorkspaceModal: React.FC<AddWorkspaceModalProps> = ({ open, onClose }) => {
  const [name, setName] = useState("")
  const [root, setRoot] = useState("")
  const [folderPath, setFolderPath] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const createWorkspaceMutation = useCreateWorkspaceMutation()
  const runtimeSettingsQuery = useRuntimeSettingsQuery({ enabled: open })
  const directoriesQuery = useFilesystemDirectoriesQuery(root === "" ? undefined : root, {
    enabled: open,
  })

  const allowedRoots = useMemo(
    () => runtimeSettingsQuery.data?.settings.allowedRoots ?? [],
    [runtimeSettingsQuery.data?.settings.allowedRoots],
  )
  const hasNoRoots = runtimeSettingsQuery.isSuccess && allowedRoots.length === 0

  const rootOptions = useMemo((): ComboboxOptionItem[] => {
    return allowedRoots.map((allowedRoot) => ({
      value: allowedRoot,
      label: allowedRoot,
    }))
  }, [allowedRoots])

  const folderOptions = useMemo((): ComboboxOptionItem[] => {
    const items = directoriesQuery.data?.items ?? []
    return items.map((directory) => ({
      value: directory.path,
      label: directory.name,
      description: directory.path,
    }))
  }, [directoriesQuery.data])

  const resetForm = () => {
    setName("")
    setRoot("")
    setFolderPath("")
    setErrorMessage(undefined)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleRootChange = (nextRoot: string) => {
    setRoot(nextRoot)
    setFolderPath("")
    setErrorMessage(undefined)
  }

  const handleFolderChange = (nextFolderPath: string) => {
    setFolderPath(nextFolderPath)
    setName(folderBasename(nextFolderPath))
    setErrorMessage(undefined)
  }

  const canSubmit =
    name.trim() !== "" &&
    folderPath !== "" &&
    !createWorkspaceMutation.isPending &&
    !hasNoRoots &&
    !runtimeSettingsQuery.isError &&
    !directoriesQuery.isError

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }

    setErrorMessage(undefined)

    createWorkspaceMutation.mutate(
      { name: name.trim(), path: folderPath },
      {
        onSuccess: () => {
          handleClose()
        },
        onError: (error) => {
          setErrorMessage(
            workspaceMutationErrorMessage(
              error,
              isWorkspaceCreateError,
              "Could not add workspace.",
            ),
          )
        },
      },
    )
  }

  const folderEmptyMessage = (() => {
    if (root === "") {
      return "Select a root first"
    }
    if (directoriesQuery.isPending) {
      return "Loading folders…"
    }
    if (directoriesQuery.isError) {
      return "Could not load folders"
    }
    return "No folders in this root"
  })()

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
          <Button disabled={!canSubmit} form="add-workspace-form" type="submit">
            Add workspace
          </Button>
        </>
      }
    >
      <form id="add-workspace-form" onSubmit={handleSubmit}>
        {hasNoRoots ? (
          <p className="m-0 mb-4 text-base text-body-soft" role="status">
            Add an allowed root in{" "}
            <Link className="text-lime underline" to="/settings" onClick={handleClose}>
              Settings
            </Link>{" "}
            before creating a workspace.
          </p>
        ) : null}

        <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
        <TextInput
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="My project"
          required
          disabled={hasNoRoots}
        />

        <div className="mt-4 flex flex-col gap-4">
          <Combobox
            label="Root"
            aria-label="Root"
            value={root}
            onChange={handleRootChange}
            options={rootOptions}
            placeholder="Select root…"
            disabled={hasNoRoots || runtimeSettingsQuery.isPending}
            emptyMessage={
              runtimeSettingsQuery.isError ? "Could not load roots" : "No roots configured"
            }
          />
          <Combobox
            label="Folder"
            aria-label="Folder"
            value={folderPath}
            onChange={handleFolderChange}
            options={folderOptions}
            placeholder="Select folder…"
            disabled={
              hasNoRoots || root === "" || directoriesQuery.isPending || directoriesQuery.isError
            }
            emptyMessage={folderEmptyMessage}
          />
        </div>

        {errorMessage ? (
          <p className="mt-4 text-base text-danger" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
