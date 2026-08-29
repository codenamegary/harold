import { KeyboardEventHandler, useMemo } from "react"
import {
  dispatchKeyboard,
  isAppleNavigator,
  KeyboardHandler,
  readKeyEvent,
} from "./prompt.input.keyboard"
import { EditorState } from "./prompt.input.model"

type UseKeyboardInputParams = {
  handlers: ReadonlyArray<KeyboardHandler>
  state: EditorState
  onState: (next: EditorState) => void
  disabled?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

export const useKeyboardInput = (
  params: UseKeyboardInputParams,
): KeyboardEventHandler<HTMLDivElement> => {
  const { handlers, state, onState, disabled = false, onKeyDown } = params
  const apple = useMemo(
    () => isAppleNavigator(navigator.platform, navigator.userAgent),
    [],
  )

  return (event) => {
    onKeyDown?.(event)
    if (disabled || event.defaultPrevented) {
      return
    }
    const next = dispatchKeyboard(handlers, state, readKeyEvent(event, apple))
    if (next === null) {
      return
    }
    event.preventDefault()
    onState(next)
  }
}
