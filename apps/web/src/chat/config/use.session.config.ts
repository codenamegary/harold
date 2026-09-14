import { useCallback, useEffect } from "react"
import { useAtomValue } from "jotai"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { categoryOf } from "contracts/http/config.options"
import { selectionAtom } from "../selection/atoms"
import { sessionConfigBySessionAtom } from "./atoms"
import { useSetConfigOptionMutation } from "./use.set.config.option.mutation"

export const findReservedOption = (
  config: ReadonlyArray<ConfigOption>,
  category: "model" | "mode" | "thought_level",
): ConfigOption | undefined =>
  config.find((option) => categoryOf(option) === category)

const detailOf = (error: Error): string =>
  "detail" in error && typeof error.detail === "string"
    ? error.detail
    : "Setting the config option failed"

export const useSessionConfig = () => {
  const selection = useAtomValue(selectionAtom)
  const configBySession = useAtomValue(sessionConfigBySessionAtom)
  const { sessionId, agentId } = selection

  const { error, isPending, mutate, reset } = useSetConfigOptionMutation()

  useEffect(() => {
    reset()
  }, [sessionId, reset])

  const config = sessionId === "" ? undefined : configBySession.get(sessionId)

  const setOption = useCallback(
    (params: { configId: string; value: ConfigOptionValue | string | boolean }) => {
      const value =
        typeof params.value === "object" && params.value !== null && "value" in params.value
          ? params.value.value
          : params.value
      if (sessionId === "") {
        return
      }
      mutate({ agentId, sessionId, configId: params.configId, value })
    },
    [agentId, sessionId, mutate],
  )

  return {
    config,
    model: config === undefined ? undefined : findReservedOption(config, "model"),
    mode: config === undefined ? undefined : findReservedOption(config, "mode"),
    thinking:
      config === undefined ? undefined : findReservedOption(config, "thought_level"),
    error: error === null ? null : detailOf(error),
    saving: isPending,
    setOption,
  }
}
