import { useMutation, UseMutationResult } from "@tanstack/react-query"
import { useRef } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { ConfigOption, SetConfigOptionBody, setConfigOptionPath } from "contracts/http/config.options"
import { sessionConfigBySessionAtom } from "./atoms"

export type ConfigSetError = Error & {
  readonly detail: string
}

export type SetConfigOptionVariables = {
  agentId: string
  sessionId: string
  configId: string
  value: string | boolean
}

type ConfigSetContext = {
  previousConfigBySession: ReadonlyMap<string, ReadonlyArray<ConfigOption>>
}

const createConfigSetError = (detail: string): ConfigSetError => {
  const error = new Error(detail) as ConfigSetError
  error.name = "ConfigSetError"
  return Object.assign(error, { detail })
}

const readProblemDetail = async (response: Response): Promise<string> => {
  try {
    const payload: unknown = await response.json()
    if (
      typeof payload === "object"
      && payload !== null
      && "detail" in payload
      && typeof payload.detail === "string"
    ) {
      return payload.detail
    }
  } catch {
    // Fall through to the generic message.
  }
  return `Setting the config option failed with ${response.status}`
}

const setConfigOption = async (
  params: SetConfigOptionVariables,
  signal?: AbortSignal,
): Promise<void> => {
  const body: SetConfigOptionBody = { value: params.value }
  const response = await fetch(
    `${setConfigOptionPath(params.sessionId, params.configId)}?agentId=${encodeURIComponent(params.agentId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  )

  if (!response.ok) {
    throw createConfigSetError(await readProblemDetail(response))
  }
}

/**
 * PUTs a config option immediately and flips the option's currentValue in
 * place until the server's session_config echo replaces the array. A failed
 * PUT rolls the whole map back to the pre-mutation snapshot. A new set aborts
 * the previous in-flight PUT — v5.101 mutations carry no AbortSignal, so the
 * controller is managed here.
 */
export const useSetConfigOptionMutation = (): UseMutationResult<
  void,
  ConfigSetError | Error,
  SetConfigOptionVariables,
  ConfigSetContext
> => {
  const configBySession = useAtomValue(sessionConfigBySessionAtom)
  const setConfigBySession = useSetAtom(sessionConfigBySessionAtom)
  const abortRef = useRef<AbortController | null>(null)

  return useMutation({
    mutationFn: (variables: SetConfigOptionVariables) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      return setConfigOption(variables, controller.signal)
    },
    onMutate: (variables) => {
      const previousConfigBySession = configBySession
      setConfigBySession((current) => {
        const next = new Map(current)
        const config = next.get(variables.sessionId)
        if (config !== undefined) {
          next.set(
            variables.sessionId,
            config.map((option) =>
              option.id === variables.configId
                ? ({ ...option, currentValue: variables.value } as ConfigOption)
                : option,
            ),
          )
        }
        return next
      })
      return { previousConfigBySession }
    },
    onError: (error, _variables, context) => {
      if (error.name === "AbortError") {
        return
      }
      if (context !== undefined) {
        setConfigBySession(context.previousConfigBySession)
      }
    },
  })
}
