import { AgentId } from "contracts/http/agent-settings"
import {
  BroadcastSessionTitle,
  ForgetSessionTitle,
  GetSessionTitle,
  RememberSessionTitle,
} from "./session.ports"

export type ApplySessionTitleInput = Readonly<{
  agentId: AgentId
  sessionId: string
  title: string | null
}>

export type ApplySessionTitleResult =
  | { readonly kind: "renamed" }
  | { readonly kind: "cleared" }
  | { readonly kind: "unchanged" }

export type ApplySessionTitleDeps = Readonly<{
  getSessionTitle: GetSessionTitle
  rememberSessionTitle: RememberSessionTitle
  forgetSessionTitle: ForgetSessionTitle
  broadcastSessionTitle: BroadcastSessionTitle
}>

export type ApplySessionTitle = (input: ApplySessionTitleInput) => ApplySessionTitleResult

export const makeApplySessionTitle =
  (deps: ApplySessionTitleDeps): ApplySessionTitle =>
  (input) => {
    const key = { agentId: input.agentId, sessionId: input.sessionId }
    const current = deps.getSessionTitle(key)

    if (input.title === null) {
      if (current === undefined) {
        return { kind: "unchanged" }
      }

      deps.forgetSessionTitle(key)
      deps.broadcastSessionTitle({ ...key, title: null })
      return { kind: "cleared" }
    }

    if (current === input.title) {
      return { kind: "unchanged" }
    }

    deps.rememberSessionTitle({ ...key, title: input.title })
    deps.broadcastSessionTitle({ ...key, title: input.title })
    return { kind: "renamed" }
  }
