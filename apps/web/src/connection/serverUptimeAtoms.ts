import { atom } from "jotai"
import { elapsedSecondsFromStartedAt } from "../overview/elapsedSecondsFromStartedAt"
import { nowAtom } from "./nowAtom"

export const serverStartedAtAtom = atom<string | null>(null)

export const serverElapsedSecondsAtom = atom((get) => {
  const startedAt = get(serverStartedAtAtom)

  if (startedAt === null) {
    return null
  }

  return elapsedSecondsFromStartedAt(startedAt, get(nowAtom))
})
