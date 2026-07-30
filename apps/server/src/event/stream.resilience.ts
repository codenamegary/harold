import { WebSocket } from "ws"
import { ParsedJournalRecord } from "./journal.repository"

export const HEARTBEAT_INTERVAL_MS = 30_000
export const MAX_BUFFERED_BYTES = 1_048_576
export const MAX_QUEUE_BYTES = 1_048_576
export const MAX_QUEUE_RECORDS = 500
export const SLOW_CONSUMER_CLOSE_CODE = 1008
export const SLOW_CONSUMER_CLOSE_REASON = "slow consumer"

export type QueueMetrics = {
  bytes: number
  records: number
}

export const createQueueMetrics = (): QueueMetrics => ({
  bytes: 0,
  records: 0,
})

export const estimateRecordBytes = (record: ParsedJournalRecord): number =>
  Buffer.byteLength(
    JSON.stringify(record, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
    "utf8",
  )

const exceedsQueueLimits = (metrics: QueueMetrics): boolean =>
  metrics.bytes > MAX_QUEUE_BYTES || metrics.records > MAX_QUEUE_RECORDS

export const exceedsBufferedBytes = (socket: WebSocket): boolean =>
  socket.bufferedAmount > MAX_BUFFERED_BYTES

export const addQueuedRecords = (params: {
  metrics: QueueMetrics
  records: ParsedJournalRecord[]
}): { metrics: QueueMetrics; exceeded: boolean } => {
  const addedBytes = params.records.reduce(
    (total, record) => total + estimateRecordBytes(record),
    0,
  )
  const metrics = {
    bytes: params.metrics.bytes + addedBytes,
    records: params.metrics.records + params.records.length,
  }

  return {
    metrics,
    exceeded: exceedsQueueLimits(metrics),
  }
}

export const removeQueuedRecords = (params: {
  metrics: QueueMetrics
  records: ParsedJournalRecord[]
}): QueueMetrics => {
  const removedBytes = params.records.reduce(
    (total, record) => total + estimateRecordBytes(record),
    0,
  )

  return {
    bytes: Math.max(0, params.metrics.bytes - removedBytes),
    records: Math.max(0, params.metrics.records - params.records.length),
  }
}

export const closeSlowConsumer = (socket: WebSocket): void => {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(SLOW_CONSUMER_CLOSE_CODE, SLOW_CONSUMER_CLOSE_REASON)
  }
}

type CreateHeartbeatManagerParams = {
  socket: WebSocket
  intervalMs?: number
}

export const createHeartbeatManager = (params: CreateHeartbeatManagerParams) => {
  const intervalMs = params.intervalMs ?? HEARTBEAT_INTERVAL_MS
  const aliveState = { isAlive: true }

  const onPong = () => {
    aliveState.isAlive = true
  }

  params.socket.on("pong", onPong)

  const interval = setInterval(() => {
    if (!aliveState.isAlive) {
      stop()
      params.socket.terminate()
      return
    }

    aliveState.isAlive = false
    params.socket.ping()
  }, intervalMs)

  const stop = () => {
    clearInterval(interval)
    params.socket.off("pong", onPong)
  }

  return { stop }
}
