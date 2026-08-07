import React, { useState } from "react"
import { CircleHelp, Save, Trash2 } from "lucide-react"
import { Button } from "../design-system/Button"
import { IconButton } from "../design-system/IconButton"
import { Modal } from "../design-system/Modal"
import { Panel } from "../design-system/Panel"
import { StatusPill } from "../design-system/StatusPill"
import { TextInput } from "../design-system/TextInput"
import { isRuntimeSettingsUpdateError } from "../runtime-settings/update.runtime.settings"
import { useRuntimeSettingsQuery } from "../runtime-settings/use.runtime.settings.query"
import { useUpdateRuntimeSettingsMutation } from "../runtime-settings/use.update.runtime.settings.mutation"

const FilesystemIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
    <path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h3.1c.73 0 1.42.29 1.94.8l1.2 1.2h6.26A2.75 2.75 0 0 1 21 8.75v7.5A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25v-9.5Z" />
  </svg>
)

const GitHubIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
    <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.26c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
  </svg>
)

const GitLabIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
    <path d="m12 21.2 4.42-13.6h-8.84L12 21.2Zm0 0L3.75 7.6.68 16.98 12 21.2Zm0 0 8.25-13.6 3.07 9.38L12 21.2ZM3.75 7.6.68 16.98l6.9-9.38H3.75Zm16.5 0h-3.83l6.9 9.38-3.07-9.38ZM3.75 7.6 5.2 3.13c.15-.46.8-.46.95 0L7.58 7.6H3.75Zm12.67 0 1.43-4.47c.15-.46.8-.46.95 0l1.45 4.47h-3.83Z" />
  </svg>
)

type ProviderCardProps = {
  title: string
  description: string
  icon: React.ReactNode
  stateLabel?: React.ReactNode
  disabled?: boolean
  children?: React.ReactNode
  action?: React.ReactNode
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  title,
  description,
  icon,
  stateLabel,
  disabled = false,
  children,
  action,
}) => (
  <section
    aria-disabled={disabled ? "true" : undefined}
    className={`rounded-[9px] border p-5 ${disabled ? "border-line-soft bg-[#0a0c10] opacity-55" : "border-lime/35 bg-[linear-gradient(145deg,rgba(182,243,107,0.04),#0b0e13)]"}`}
  >
    <div className="mb-3.5 flex items-start justify-between gap-3">
      <span className="grid size-9 place-items-center rounded-[7px] border border-line bg-panel-2 text-muted">
        {icon}
      </span>
      {stateLabel}
    </div>
    <div className="mb-2 flex items-center gap-1.5">
      <h4 className="m-0 text-base font-semibold">{title}</h4>
      <button
        type="button"
        className="grid size-5 shrink-0 place-items-center rounded text-muted hover:text-body-soft"
        title={description}
        aria-label={description}
      >
        <CircleHelp aria-hidden className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
    {children}
    {action}
  </section>
)

type RemoveRootModalProps = {
  rootPath: string
  open: boolean
  errorMessage?: string
  pending: boolean
  onClose: () => void
  onConfirm: () => void
}

const RemoveRootModal: React.FC<RemoveRootModalProps> = ({
  rootPath,
  open,
  errorMessage,
  pending,
  onClose,
  onConfirm,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Remove allowed root?"
    actions={
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="border-red-500/40 bg-red-500/15 text-red-300 hover:border-red-400 hover:bg-red-500/25 hover:text-red-200"
          disabled={pending}
          onClick={onConfirm}
        >
          Remove root and unregister workspaces
        </Button>
      </>
    }
  >
    <p className="m-0 text-sm text-body-soft">
      Removing <code className="text-[#b8c0cb]">{rootPath}</code> unregisters workspaces under
      this root. Workspace files are not deleted.
    </p>
    {errorMessage ? (
      <p className="mt-4 text-sm text-red-400" role="alert">
        {errorMessage}
      </p>
    ) : null}
  </Modal>
)

const LocalFilesystemProviderCard: React.FC = () => {
  const runtimeSettingsQuery = useRuntimeSettingsQuery()
  const updateRuntimeSettingsMutation = useUpdateRuntimeSettingsMutation()
  const [draftPath, setDraftPath] = useState("")
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [confirmRemoveRoot, setConfirmRemoveRoot] = useState<string | undefined>(undefined)
  const [removeError, setRemoveError] = useState<string | undefined>(undefined)

  const allowedRoots = runtimeSettingsQuery.data?.settings.allowedRoots ?? []
  const pending = updateRuntimeSettingsMutation.isPending

  const saveRoots = async (nextRoots: string[], force = false) => {
    await updateRuntimeSettingsMutation.mutateAsync({
      body: { allowedRoots: nextRoots },
      force,
    })
  }

  const handleAddRoot = async () => {
    const trimmed = draftPath.trim()
    if (trimmed.length === 0) {
      setFormError("Enter an absolute path.")
      return
    }

    setFormError(undefined)

    try {
      await saveRoots([...allowedRoots, trimmed])
      setDraftPath("")
    } catch (error: unknown) {
      setFormError(
        isRuntimeSettingsUpdateError(error)
          ? error.message
          : "Could not add allowed root.",
      )
    }
  }

  const handleRemoveRoot = async (root: string) => {
    setRemoveError(undefined)

    try {
      await saveRoots(
        allowedRoots.filter((allowedRoot) => allowedRoot !== root),
      )
    } catch (error: unknown) {
      if (
        isRuntimeSettingsUpdateError(error) &&
        error.problem?.forceDeleteAvailable === true
      ) {
        setConfirmRemoveRoot(root)
        return
      }

      setRemoveError(
        isRuntimeSettingsUpdateError(error)
          ? error.message
          : "Could not remove allowed root.",
      )
    }
  }

  const handleConfirmRemoveRoot = async () => {
    if (confirmRemoveRoot === undefined) {
      return
    }

    setRemoveError(undefined)

    try {
      await saveRoots(
        allowedRoots.filter((allowedRoot) => allowedRoot !== confirmRemoveRoot),
        true,
      )
      setConfirmRemoveRoot(undefined)
    } catch (error: unknown) {
      setRemoveError(
        isRuntimeSettingsUpdateError(error)
          ? error.message
          : "Could not remove allowed root.",
      )
    }
  }

  return (
    <>
      <ProviderCard
        title="Local filesystem"
        description="Register folders from this machine. Paths outside these roots remain unavailable to remote clients."
        icon={<FilesystemIcon />}
      >
        <div className="mt-4">
          {allowedRoots.length === 0 ? (
            <p className="m-0 text-xs text-muted">No allowed roots configured yet.</p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {allowedRoots.map((root) => (
                <li
                  key={root}
                  className="flex items-center justify-between gap-3 rounded-[7px] border border-line-soft bg-panel-elevated px-3 py-2"
                >
                  <code className="min-w-0 truncate text-xs text-body-soft" title={root}>
                    {root}
                  </code>
                  <IconButton
                    aria-label={`Remove ${root}`}
                    disabled={pending}
                    onClick={() => {
                      void handleRemoveRoot(root)
                    }}
                  >
                    <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center gap-2">
            <TextInput
              aria-label="Allowed root path"
              value={draftPath}
              placeholder="/home/you/projects"
              disabled={pending}
              onInput={(event) => {
                setDraftPath(event.currentTarget.value)
                setFormError(undefined)
              }}
              className="min-w-0 flex-1"
            />
            <IconButton
              aria-label="Add root"
              disabled={pending}
              onClick={() => {
                void handleAddRoot()
              }}
            >
              <Save aria-hidden className="size-4" strokeWidth={1.75} />
            </IconButton>
          </div>

          {formError ? (
            <p className="m-0 mt-2 text-xs text-danger" role="alert">
              {formError}
            </p>
          ) : null}

          {removeError && confirmRemoveRoot === undefined ? (
            <p className="m-0 mt-2 text-xs text-danger" role="alert">
              {removeError}
            </p>
          ) : null}
        </div>
      </ProviderCard>

      <RemoveRootModal
        rootPath={confirmRemoveRoot ?? ""}
        open={confirmRemoveRoot !== undefined}
        errorMessage={removeError}
        pending={pending}
        onClose={() => {
          setConfirmRemoveRoot(undefined)
          setRemoveError(undefined)
        }}
        onConfirm={() => {
          void handleConfirmRemoveRoot()
        }}
      />
    </>
  )
}

export const ProviderPanel: React.FC = () => (
  <Panel className="mb-[25px] p-[22px]">
    <div className="mb-[22px]">
      <h3 className="m-0 text-lg font-semibold">Workspace provider</h3>
      <p className="m-0 mt-2 max-w-2xl text-sm text-muted">
        Control where Agent Server can create workspaces and which folders agents are allowed to
        access.
      </p>
    </div>

    <div className="grid gap-3.5 lg:grid-cols-3">
      <LocalFilesystemProviderCard />

      <ProviderCard
        title="GitHub"
        description="Choose repositories, clone them locally, and create isolated workspaces from branches or pull requests."
        icon={<GitHubIcon />}
        stateLabel={<StatusPill>Coming soon</StatusPill>}
        disabled
        action={
          <Button variant="secondary" className="mt-4 w-full" disabled>
            Connect GitHub
          </Button>
        }
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-[5px] border border-line-soft bg-panel-elevated px-2 py-1 font-mono text-2xs text-dim">
            Repository sync
          </span>
          <span className="rounded-[5px] border border-line-soft bg-panel-elevated px-2 py-1 font-mono text-2xs text-dim">
            Pull request context
          </span>
        </div>
      </ProviderCard>

      <ProviderCard
        title="GitLab"
        description="Connect self-managed or hosted GitLab projects and launch workspaces from merge requests."
        icon={<GitLabIcon />}
        stateLabel={<StatusPill>Coming soon</StatusPill>}
        disabled
        action={
          <Button variant="secondary" className="mt-4 w-full" disabled>
            Connect GitLab
          </Button>
        }
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-[5px] border border-line-soft bg-panel-elevated px-2 py-1 font-mono text-2xs text-dim">
            Project sync
          </span>
          <span className="rounded-[5px] border border-line-soft bg-panel-elevated px-2 py-1 font-mono text-2xs text-dim">
            Merge request context
          </span>
        </div>
      </ProviderCard>
    </div>
  </Panel>
)
