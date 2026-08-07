import React, {
  ComponentPropsWithoutRef,
  FormEvent,
  forwardRef,
} from "react"

export type ActionFieldPosition = "start" | "end"

type ActionFieldProps = {
  action: React.ReactNode
  actionPosition?: ActionFieldPosition
  disabled?: boolean
  className?: string
  children: React.ReactNode
  as?: "div" | "form"
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
}

const shellClassName =
  "flex min-h-10 w-full items-center gap-1 rounded-md border border-line-input bg-surface-deep px-1.5 focus-within:border-lime/40"

export const ActionField: React.FC<ActionFieldProps> = ({
  action,
  actionPosition = "end",
  disabled = false,
  className = "",
  children,
  as = "div",
  onSubmit,
}) => {
  const disabledClasses = disabled ? "opacity-50 pointer-events-none" : ""
  const content = (
    <>
      {actionPosition === "start" ? action : null}
      {children}
      {actionPosition === "end" ? action : null}
    </>
  )

  if (as === "form") {
    return (
      <form
        className={`${shellClassName} ${disabledClasses} ${className}`}
        onSubmit={onSubmit}
      >
        {content}
      </form>
    )
  }

  return (
    <div className={`${shellClassName} ${disabledClasses} ${className}`}>
      {content}
    </div>
  )
}

export type FieldAction = {
  position?: ActionFieldPosition
  "aria-label": string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}

type ActionTextInputProps = {
  action: FieldAction
  /** When true (default), Enter in the input runs the action if it is enabled. */
  submitOnEnter?: boolean
  "aria-disabled"?: boolean
} & Omit<ComponentPropsWithoutRef<"input">, "children">

const fieldActionButtonClassName =
  "grid size-7 shrink-0 place-items-center rounded text-muted cursor-pointer hover:bg-hover-surface hover:text-body-soft disabled:cursor-not-allowed disabled:opacity-50"

export const FieldActionButton: React.FC<
  {
    "aria-label": string
    disabled?: boolean
    onClick?: () => void
    children: React.ReactNode
    className?: string
    type?: "button" | "submit"
  }
> = ({
  "aria-label": ariaLabel,
  disabled,
  onClick,
  children,
  className = "",
  type = "button",
}) => (
  <button
    type={type}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={onClick}
    className={`${fieldActionButtonClassName} ${className}`}
  >
    {children}
  </button>
)

export const ActionTextInput = forwardRef<HTMLInputElement, ActionTextInputProps>(
  (
    {
      action,
      submitOnEnter = true,
      className = "",
      disabled,
      "aria-disabled": ariaDisabled,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled === true || ariaDisabled === true
    const actionDisabled = action.disabled === true || isDisabled

    const runAction = () => {
      if (actionDisabled || action.onClick === undefined) {
        return
      }
      action.onClick()
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!submitOnEnter) {
        return
      }
      runAction()
    }

    const actionButton = (
      <FieldActionButton
        type={submitOnEnter ? "submit" : "button"}
        aria-label={action["aria-label"]}
        disabled={actionDisabled}
        onClick={submitOnEnter ? undefined : runAction}
      >
        {action.children}
      </FieldActionButton>
    )

    return (
      <ActionField
        as="form"
        action={actionButton}
        actionPosition={action.position ?? "end"}
        disabled={isDisabled}
        onSubmit={handleSubmit}
      >
        <input
          ref={ref}
          {...props}
          disabled={disabled}
          aria-disabled={ariaDisabled}
          className={`min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-input outline-none ${className}`}
        />
      </ActionField>
    )
  },
)

ActionTextInput.displayName = "ActionTextInput"
