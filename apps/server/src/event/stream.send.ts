import { Event } from "contracts/events/event"
import { EventFrameSchema } from "contracts/events/stream"
import { WebSocket } from "ws"
import { closeSlowConsumer, exceedsBufferedBytes } from "./stream.resilience"

type SendStreamFrameParams = {
  socket: WebSocket
  events: Event[]
}

export const sendStreamFrame = (params: SendStreamFrameParams): Promise<void> =>
  new Promise((resolve, reject) => {
    if (exceedsBufferedBytes(params.socket)) {
      closeSlowConsumer(params.socket)
      reject(new Error("slow consumer"))
      return
    }

    const frame = EventFrameSchema.parse(params.events)
    const payload = JSON.stringify(frame)

    params.socket.send(payload, (error) => {
      if (error !== undefined) {
        reject(error)
        return
      }

      if (exceedsBufferedBytes(params.socket)) {
        closeSlowConsumer(params.socket)
        reject(new Error("slow consumer"))
        return
      }

      resolve()
    })
  })
