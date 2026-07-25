import { ReactNode } from "react"

type ModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  actions?: ReactNode
}

export const Modal = ({ open, onClose, title, children, actions }: ModalProps) => {
  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-60 grid place-items-center bg-black/68 p-5 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-[430px] rounded-[10px] border border-[#303844] bg-[#101319] p-[22px] shadow-[0_25px_80px_rgba(0,0,0,0.6)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <h3 id="modal-title" className="m-0 text-base font-semibold">
            {title}
          </h3>
        </header>
        <div>{children}</div>
        {actions ? (
          <footer className="mt-[22px] flex justify-end gap-2 border-t border-[#1a1f28] pt-4">
            {actions}
          </footer>
        ) : null}
      </section>
    </div>
  )
}