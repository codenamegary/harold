import React, { ComponentPropsWithoutRef, forwardRef } from "react"

export type ActionFieldPosition = "start" | "end"

type ActionFieldProps = {
  action: React.ReactNode
  actionPosition?: ActionFieldPosition
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

const shellClassName =
  "flex min-h-10 w-full items-center gap-1 rounded-md border border-line-input bg-surface-deep px-1.5 focus-within:border-lime/40"

export const ActionField: React.FC<ActionFieldProps> = ({
  action,
  actionPosition = "end",
  disabled = false,
  className = "",
  children,
}) => {
  const disabledClasses = disabled ? "opacity-50 pointer-events-none" : ""

  return (
    <div className={`${shellClassName} ${disabledClasses} ${className}`}>
      {actionPosition === "start" ? action : null}
      {children}
      {actionPosition === "end" ? action : null}
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
  }
> = ({ "aria-label": ariaLabel, disabled, onClick, children, className = "" }) => (
  <button
    type="button"
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
      className = "",
      disabled,
      "aria-disabled": ariaDisabled,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled === true || ariaDisabled === true
    const actionButton = (
      <FieldActionButton
        aria-label={action["aria-label"]}
        disabled={action.disabled === true || isDisabled}
        onClick={action.onClick}
      >
        {action.children}
      </FieldActionButton>
    )

    return (
      <ActionField
        action={actionButton}
        actionPosition={action.position ?? "end"}
        disabled={isDisabled}
      >
        <input
          ref={ref}
          disabled={disabled}
          aria-disabled={ariaDisabled}
          className={`min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-input outline-none ${className}`}
          {...props}
        />
      </ActionField>
    )
  },
)

ActionTextInput.displayName = "ActionTextInput"
