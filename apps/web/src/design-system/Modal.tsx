import React, { ReactNode, useId } from "react"

type ModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  actions?: ReactNode
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, actions }) => {
  const titleId = useId()

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-60 grid place-items-center bg-ink/70 p-5 backdrop-blur-xs"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-107.5 rounded-lg border border-line-modal bg-surface p-5.5 shadow-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <h3 id={titleId} className="m-0 text-base font-semibold">
            {title}
          </h3>
        </header>
        <div>{children}</div>
        {actions ? (
          <footer className="mt-5.5 flex justify-end gap-2 border-t border-line-soft pt-4">
            {actions}
          </footer>
        ) : null}
      </section>
    </div>
  )
}
