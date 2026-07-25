import { useAtomValue } from "jotai"
import { elapsedSecondsFromStartedAt } from "./elapsedSecondsFromStartedAt"
import { nowAtom } from "./nowAtom"

export const useServerElapsedSeconds = (startedAt: string | null) => {
  const now = useAtomValue(nowAtom)

  if (startedAt === null) {
    return null
  }

  return elapsedSecondsFromStartedAt(startedAt, now)
}
