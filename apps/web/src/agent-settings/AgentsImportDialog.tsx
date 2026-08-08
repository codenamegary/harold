import React, { useEffect, useMemo, useState } from "react"
import { ImportDetectCandidate } from "contracts/http/agent-settings"
import { Button } from "../design-system/Button"
import { Modal } from "../design-system/Modal"

type AgentsImportDialogProps = {
  open: boolean
  candidates: readonly ImportDetectCandidate[]
  isApplying: boolean
  errorMessage: string
  onClose: () => void
  onApply: (selectedIds: readonly string[]) => void
}

export const AgentsImportDialog: React.FC<AgentsImportDialogProps> = ({
  open,
  candidates,
  isApplying,
  errorMessage,
  onClose,
  onApply,
}) => {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedIds(
      new Set(
        candidates.filter((candidate) => !candidate.alreadyEnabled).map((candidate) => candidate.id),
      ),
    )
  }, [open, candidates])

  const selectable = useMemo(
    () => candidates.filter((candidate) => !candidate.alreadyEnabled),
    [candidates],
  )

  const allSelected =
    selectable.length > 0 && selectable.every((candidate) => selectedIds.has(candidate.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
      return
    }

    setSelectedIds(new Set(selectable.map((candidate) => candidate.id)))
  }

  const toggleOne = (agentId: string) => {
    const next = new Set(selectedIds)
    if (next.has(agentId)) {
      next.delete(agentId)
    } else {
      next.add(agentId)
    }
    setSelectedIds(next)
  }

  const handleApply = () => {
    onApply([...selectedIds])
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import agents"
      actions={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={isApplying || selectedIds.size === 0}
          >
            {isApplying ? "Enabling…" : "Enable selected"}
          </Button>
        </>
      }
    >
      <p className="m-0 mb-4 text-sm text-muted">
        Present agents from the live registry. Nothing is enabled until you confirm.
      </p>

      {candidates.length === 0 ? (
        <p className="m-0 text-sm text-muted">No present agents found to import.</p>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-body-soft hover:text-lime disabled:cursor-not-allowed disabled:opacity-50"
              onClick={toggleAll}
              disabled={selectable.length === 0 || isApplying}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
            <span className="font-mono text-2xs text-dim">
              {selectedIds.size} selected
            </span>
          </div>

          <ul className="m-0 max-h-72 list-none overflow-y-auto p-0">
            {candidates.map((candidate) => {
              const disabled = candidate.alreadyEnabled || isApplying
              const checked = candidate.alreadyEnabled || selectedIds.has(candidate.id)

              return (
                <li
                  key={candidate.id}
                  className="flex items-start gap-3 border-b border-line-soft py-3 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    disabled={disabled}
                    aria-label={`Enable ${candidate.displayName}`}
                    onChange={() => toggleOne(candidate.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{candidate.displayName}</div>
                    <div className="font-mono text-2xs text-dim">{candidate.id}</div>
                    {candidate.alreadyEnabled ? (
                      <div className="mt-1 text-xs text-muted">Already enabled</div>
                    ) : null}
                    {!candidate.inCatalog ? (
                      <div className="mt-1 text-xs text-muted">Not in pinned catalog yet</div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {errorMessage ? (
        <p className="m-0 mt-3 text-sm text-red-400" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </Modal>
  )
}
