import { atom } from "jotai"
import { SessionConfig } from "contracts/http/config.options"

export const sessionConfigBySessionAtom = atom<ReadonlyMap<string, SessionConfig>>(
  new Map(),
)

export type PendingConfigSet = {
  readonly configId: string
  readonly value: string | boolean
}

export const pendingConfigBySessionAtom = atom<ReadonlyMap<string, PendingConfigSet>>(
  new Map(),
)

export const configErrorBySessionAtom = atom<ReadonlyMap<string, string>>(new Map())
