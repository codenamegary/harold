import { AgentIdSchema } from "contracts/http/agent-settings"
import { SessionStreamClientMessage, SessionStreamServerMessage } from "contracts/http/session.stream"
import { useEffect, useRef } from "react"
import { catalogSessionKey } from "./catalog.session.key"
import { openSessionStream } from "./open.session.stream"

export const SESSION_STREAM_RECONNECT_DELAY_MS = 250

type UseSessionStreamParams = {
  agentId: string | null
  sessionId: string | null
  enabled: boolean
  onMessage: (message: SessionStreamServerMessage) => void
  onReconnect?: () => void
}

export type SessionStreamHandle = {
  send: (message: SessionStreamClientMessage) => void
}

const sessionTargetKey = (params: {
  agentId: string | null
  sessionId: string | null
}): string | null => {
  if (params.agentId === null || params.agentId === "") {
    return null
  }
  if (params.sessionId === null || params.sessionId === "") {
    return null
  }

  const agentId = AgentIdSchema.safeParse(params.agentId)
  if (!agentId.success) {
    return null
  }

  return catalogSessionKey({ agentId: agentId.data, sessionId: params.sessionId })
}

const subscribeMessage = (params: {
  agentId: string
  sessionId: string
  previousKey: string | null
}): SessionStreamClientMessage | null => {
  const agentId = AgentIdSchema.safeParse(params.agentId)
  if (!agentId.success) {
    return null
  }

  if (params.previousKey === null) {
    return {
      type: "subscribe",
      agentId: agentId.data,
      sessionId: params.sessionId,
    }
  }

  return {
    type: "switch",
    agentId: agentId.data,
    sessionId: params.sessionId,
  }
}

export const useSessionStream = (
  params: UseSessionStreamParams,
): SessionStreamHandle => {
  const onMessageRef = useRef(params.onMessage)
  const onReconnectRef = useRef(params.onReconnect)
  const streamRef = useRef<ReturnType<typeof openSessionStream> | null>(null)
  const subscribedKeyRef = useRef<string | null>(null)
  const targetKeyRef = useRef<string | null>(null)
  const targetAgentRef = useRef<string | null>(params.agentId)
  const targetSessionRef = useRef<string | null>(params.sessionId)

  useEffect(() => {
    onMessageRef.current = params.onMessage
  }, [params.onMessage])

  useEffect(() => {
    onReconnectRef.current = params.onReconnect
  }, [params.onReconnect])

  useEffect(() => {
    targetAgentRef.current = params.agentId
    targetSessionRef.current = params.sessionId
    targetKeyRef.current = sessionTargetKey({
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
  }, [params.agentId, params.sessionId])

  useEffect(() => {
    if (!params.enabled) {
      streamRef.current = null
      subscribedKeyRef.current = null
      return
    }

    const disposed = { value: false }
    const activeStream = { current: null as ReturnType<typeof openSessionStream> | null }
    const reconnectTimer = { current: null as ReturnType<typeof setTimeout> | null }
    const reconnectScheduled = { value: false }

    const sendSubscribeForTarget = () => {
      const agentId = targetAgentRef.current
      const sessionId = targetSessionRef.current
      const nextKey = targetKeyRef.current
      if (agentId === null || sessionId === null || nextKey === null) {
        subscribedKeyRef.current = null
        return
      }

      if (subscribedKeyRef.current === nextKey) {
        return
      }

      const message = subscribeMessage({
        agentId,
        sessionId,
        previousKey: subscribedKeyRef.current,
      })
      if (message === null) {
        return
      }

      subscribedKeyRef.current = nextKey
      activeStream.current?.send(message)
    }

    const connect = (isReconnect: boolean) => {
      if (disposed.value) {
        return
      }

      reconnectScheduled.value = false
      if (isReconnect) {
        subscribedKeyRef.current = null
        onReconnectRef.current?.()
      }

      activeStream.current = openSessionStream({
        handlers: {
          onMessage: (message) => {
            onMessageRef.current(message)
          },
          onClose: () => {
            scheduleReconnect()
          },
          onError: () => {
            scheduleReconnect()
          },
        },
      })
      streamRef.current = activeStream.current
      sendSubscribeForTarget()
    }

    const scheduleReconnect = () => {
      if (disposed.value || reconnectScheduled.value) {
        return
      }

      reconnectScheduled.value = true
      activeStream.current?.close()
      activeStream.current = null
      streamRef.current = null

      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current)
      }

      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null
        connect(true)
      }, SESSION_STREAM_RECONNECT_DELAY_MS)
    }

    connect(false)

    return () => {
      disposed.value = true
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current)
      }
      activeStream.current?.close()
      streamRef.current = null
    }
  }, [params.enabled])

  useEffect(() => {
    if (!params.enabled) {
      return
    }

    const nextKey = sessionTargetKey({
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
    if (nextKey === null) {
      subscribedKeyRef.current = null
      return
    }

    if (subscribedKeyRef.current === nextKey) {
      return
    }

    if (params.agentId === null || params.sessionId === null) {
      return
    }

    const message = subscribeMessage({
      agentId: params.agentId,
      sessionId: params.sessionId,
      previousKey: subscribedKeyRef.current,
    })
    if (message === null) {
      return
    }

    subscribedKeyRef.current = nextKey
    streamRef.current?.send(message)
  }, [params.enabled, params.agentId, params.sessionId])

  return {
    send: (message) => {
      streamRef.current?.send(message)
    },
  }
}
