import { useAtomValue } from "jotai"
import { elapsedSecondsFromStartedAt } from "./elapsed.seconds.from.started.at"
import { nowAtom } from "./now.atom"

export const useServerElapsedSeconds = (startedAt: string | null) => {
  const now = useAtomValue(nowAtom)

  if (startedAt === null) {
    return null
  }

  return elapsedSecondsFromStartedAt(startedAt, now)
}
