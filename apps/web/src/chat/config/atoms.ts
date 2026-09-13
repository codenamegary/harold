import { atom } from "jotai"
import { SessionConfig } from "contracts/http/config.options"

export const sessionConfigBySessionAtom = atom<ReadonlyMap<string, SessionConfig>>(
  new Map(),
)
