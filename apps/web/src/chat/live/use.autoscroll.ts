import { RefObject, useLayoutEffect } from "react"
import { useAtomValue } from "jotai"
import { extensionAtom, permissionAtom, transcriptAtom } from "./atoms"

type UseTranscriptAutoscrollParams = {
  showWelcome: boolean
  running: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  bottomRef: RefObject<HTMLDivElement | null>
}

export const useTranscriptAutoscroll = (
  params: UseTranscriptAutoscrollParams,
): void => {
  const { showWelcome, running, scrollRef, bottomRef } = params
  const transcript = useAtomValue(transcriptAtom)
  const permission = useAtomValue(permissionAtom)
  const extension = useAtomValue(extensionAtom)

  useLayoutEffect(() => {
    if (showWelcome) {
      return
    }

    const container = scrollRef.current
    if (container !== null) {
      container.scrollTop = container.scrollHeight
      return
    }

    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [
    showWelcome,
    transcript.rows,
    running,
    permission,
    extension,
    scrollRef,
    bottomRef,
  ])
}
