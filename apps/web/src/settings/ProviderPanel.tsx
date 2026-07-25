import React from "react"
import { Button } from "../design-system/Button"
import { Panel } from "../design-system/Panel"
import { SectionKicker } from "../design-system/SectionKicker"
import { StatusPill } from "../design-system/StatusPill"

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
  stateLabel: React.ReactNode
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
    <h4 className="m-0 mb-2 text-base font-semibold">{title}</h4>
    <p className="m-0 text-sm leading-[1.55] text-muted">{description}</p>
    {children}
    {action}
  </section>
)

const ActiveState: React.FC = () => (
  <span className="flex items-center gap-1.5 font-mono text-2xs text-lime">
    <span aria-hidden className="size-1.5 rounded-full bg-lime" />
    Active
  </span>
)

export const ProviderPanel: React.FC = () => (
  <Panel className="mb-[25px] p-[22px]">
    <div className="mb-[22px] flex items-start justify-between gap-4 max-[820px]:flex-col">
      <div>
        <SectionKicker>WORKSPACE SOURCES</SectionKicker>
        <h3 className="m-0 text-lg font-semibold">Workspace provider</h3>
        <p className="m-0 mt-2 max-w-2xl text-sm text-muted">
          Control where Relay can create workspaces and which folders agents are allowed to access.
        </p>
      </div>
      <StatusPill variant="success">0 configured</StatusPill>
    </div>

    <div className="grid gap-3.5 lg:grid-cols-3">
      <ProviderCard
        title="Local filesystem"
        description="Register folders from this machine. Paths outside these roots remain unavailable to remote clients."
        icon={<FilesystemIcon />}
        stateLabel={<ActiveState />}
        action={
          <Button variant="secondary" className="mt-4 w-full" disabled>
            + Allow another folder
          </Button>
        }
      />

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

    <div className="mt-[18px] flex gap-2.5 rounded-[7px] border border-line-soft bg-panel-elevated p-3.5 text-xs leading-[1.55] text-muted">
      <span aria-hidden>⌾</span>
      <p className="m-0">
        Allowed roots are enforced by the server after canonicalizing paths and resolving symlinks.
        Removing a root unregisters access. It never deletes files.
      </p>
    </div>
  </Panel>
)
