import { WebSocket } from "ws"
import { openDeviceEventStream } from "./second.client.streams"

export type SecondClient = {
  httpBase: string
  wsUrl: string
  deviceId: string
  credential: string
  fetch: (path: string, init?: RequestInit) => Promise<Response>
  openEventStream: () => Promise<WebSocket>
  reconnect: () => SecondClient
}

export const createSecondClient = (params: {
  httpBase: string
  wsUrl: string
  deviceId: string
  credential: string
}): SecondClient => ({
  httpBase: params.httpBase,
  wsUrl: params.wsUrl,
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
  openEventStream: () =>
    openDeviceEventStream({ wsUrl: params.wsUrl, credential: params.credential }),
  reconnect: () => createSecondClient(params),
})
