import { SseStream } from "../session-stream/session.stream.client"
import { openDeviceEventStream } from "./second.client.streams"

export type SecondClient = {
  httpBase: string
  deviceId: string
  credential: string
  fetch: (path: string, init?: RequestInit) => Promise<Response>
  openEventStream: (input: { agentId: string; sessionId: string }) => Promise<SseStream>
  reconnect: () => SecondClient
}

export const createSecondClient = (params: {
  httpBase: string
  deviceId: string
  credential: string
}): SecondClient => ({
  httpBase: params.httpBase,
  deviceId: params.deviceId,
  credential: params.credential,
  fetch: (path, init) => {
    const headers = new Headers(init?.headers)
    headers.set("authorization", `Bearer ${params.credential}`)
    return fetch(`${params.httpBase}${path}`, {
      ...init,
      headers,
    })
  },
  openEventStream: ({ agentId, sessionId }) =>
    openDeviceEventStream({
      httpBase: params.httpBase,
      credential: params.credential,
      agentId,
      sessionId,
    }),
  reconnect: () => createSecondClient(params),
})
