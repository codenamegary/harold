import { useCallback, useEffect, useMemo, useRef } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { categoryOf } from "contracts/http/config.options"
import { selectionAtom } from "../selection/atoms"
import {
  configErrorBySessionAtom,
  pendingConfigBySessionAtom,
  sessionConfigBySessionAtom,
} from "./atoms"
import { createConfigSetController } from "./set.controller"
import { setConfigOption } from "./set.config.option"

const DEFAULT_DEBOUNCE_MS = 1_500

export const findReservedOption = (
  config: ReadonlyArray<ConfigOption>,
  category: "model" | "mode" | "thought_level",
): ConfigOption | undefined =>
  config.find((option) => categoryOf(option) === category)

export const useSessionConfig = (options?: { debounceMs?: number }) => {
  const selection = useAtomValue(selectionAtom)
  const configBySession = useAtomValue(sessionConfigBySessionAtom)
  const pendingBySession = useAtomValue(pendingConfigBySessionAtom)
  const errorBySession = useAtomValue(configErrorBySessionAtom)
  const setPendingBySession = useSetAtom(pendingConfigBySessionAtom)
  const setErrorBySession = useSetAtom(configErrorBySessionAtom)

  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const { sessionId, agentId } = selection

  const onFire = useCallback(
    ({ sessionId: fireSessionId, configId, value }: {
      sessionId: string
      configId: string
      value: string | boolean
    }) => {
      void setConfigOption({ agentId, sessionId: fireSessionId, configId, value })
        .then(() => undefined)
        .catch((error: unknown) => {
          const detail =
            error instanceof Error && "detail" in error && typeof error.detail === "string"
              ? error.detail
              : "Setting the config option failed"
          setErrorBySession((current) => {
            const next = new Map(current)
            next.set(fireSessionId, detail)
            return next
          })
          setPendingBySession((current) => {
            const next = new Map(current)
            const pending = next.get(fireSessionId)
            if (pending?.configId === configId) {
              next.delete(fireSessionId)
            }
            return next
          })
        })
    },
    [agentId, setErrorBySession, setPendingBySession],
  )

  const controllerRef = useRef<ReturnType<typeof createConfigSetController> | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createConfigSetController({ delayMs: debounceMs, onFire })
  }
  useEffect(() => {
    controllerRef.current?.dispose()
    controllerRef.current = createConfigSetController({ delayMs: debounceMs, onFire })
    return () => {
      controllerRef.current?.dispose()
    }
  }, [debounceMs, onFire])

  useEffect(() => {
    return () => {
      controllerRef.current?.flush(sessionId)
      setPendingBySession((current) => {
        const next = new Map(current)
        next.delete(sessionId)
        return next
      })
    }
  }, [sessionId, setPendingBySession])

  const config = sessionId === "" ? undefined : configBySession.get(sessionId)
  const pending = sessionId === "" ? undefined : pendingBySession.get(sessionId)
  const error = sessionId === "" ? undefined : errorBySession.get(sessionId)

  const effectiveConfig = useMemo(() => {
    if (config === undefined) {
      return undefined
    }
    if (pending === undefined) {
      return config
    }
    return config.map((option) =>
      option.id === pending.configId
        ? ({ ...option, currentValue: pending.value } as ConfigOption)
        : option,
    )
  }, [config, pending])

  const setOption = useCallback(
    (params: { configId: string; value: ConfigOptionValue | string | boolean }) => {
      const value =
        typeof params.value === "object" && params.value !== null && "value" in params.value
          ? params.value.value
          : params.value
      if (sessionId === "") {
        return
      }
      setErrorBySession((current) => {
        const next = new Map(current)
        next.delete(sessionId)
        return next
      })
      setPendingBySession((current) => {
        const next = new Map(current)
        next.set(sessionId, { configId: params.configId, value })
        return next
      })
      controllerRef.current?.schedule({
        sessionId,
        configId: params.configId,
        value,
      })
    },
    [sessionId, setErrorBySession, setPendingBySession],
  )

  return {
    config: effectiveConfig,
    model:
      effectiveConfig === undefined ? undefined : findReservedOption(effectiveConfig, "model"),
    mode:
      effectiveConfig === undefined ? undefined : findReservedOption(effectiveConfig, "mode"),
    thinking:
      effectiveConfig === undefined
        ? undefined
        : findReservedOption(effectiveConfig, "thought_level"),
    pending: pending ?? null,
    error: error ?? null,
    setOption,
  }
}
