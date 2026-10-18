import { sessionEventsPath } from "contracts/http/session.stream"
import { openSseStream, SseStream } from "../session-stream/session.stream.client"

const defaultStreamTimeoutMs = 2_000

/** Opens the device's session event stream (presence attach path) over SSE. */
export const openDeviceEventStream = (params: {
  httpBase: string
  credential: string
  agentId: string
  sessionId: string
}): Promise<SseStream> =>
  openSseStream({
    url: `${params.httpBase}${sessionEventsPath(params.sessionId, { agentId: params.agentId })}`,
    credential: params.credential,
    openTimeoutMs: defaultStreamTimeoutMs,
  })
