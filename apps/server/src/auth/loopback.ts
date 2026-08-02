const LOOPBACK_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
])

export type LoopbackRequest = {
  ip: string
}

export const isLoopbackRequest = (request: LoopbackRequest): boolean =>
  LOOPBACK_ADDRESSES.has(request.ip)
