import { AuthStepV1 } from "contracts/http/agent-auth"
import { AuthAdapter, AdapterAuthContext } from "./adapter"

const HOST_LOGIN_STEP_ID = "host-login"

const buildHostLoginSteps = (
  instructions: string,
  retry: boolean,
): AuthStepV1[] => {
  const prefix = retry
    ? "That didn't work. Sign in on the host and try again.\n\n"
    : ""
  return [
    {
      type: "show_message",
      level: retry ? "error" : "info",
      body: `${prefix}${instructions}`,
    },
    {
      type: "confirm",
      stepId: HOST_LOGIN_STEP_ID,
      title: "Sign in on the host",
      body: "When you have finished signing in on the host machine, confirm below.",
      confirmLabel: "I have logged in",
    },
  ]
}

export const createDefaultAuthAdapter = (): AuthAdapter => {
  const instructions = (ctx: AdapterAuthContext) =>
    `This agent may require sign-in on the host machine (${ctx.hostMachineName}). Open a terminal on that machine and complete the agent's normal login flow.\n\nWhen finished, tap I have logged in.`

  return {
    id: "default",
    matches: () => true,
    clientAuthCapabilities: () => ({}),
    hostLoginInstructions: instructions,
    probe: async () => ({
      status: "unknown",
      error: null,
      canLogout: false,
    }),
    onStart: async () => undefined,
    completionPolicy: "reconnect",
    start: async (ctx, input) => ({
      steps: buildHostLoginSteps(instructions(ctx), input.retry),
    }),
    continue: async () => ({
      steps: [{ type: "working", label: "Checking sign-in…" }],
    }),
    abort: async () => undefined,
    logout: async () => undefined,
  }
}

export const defaultAuthAdapter = createDefaultAuthAdapter()

export const HOST_LOGIN_CONFIRM_STEP_ID = HOST_LOGIN_STEP_ID
