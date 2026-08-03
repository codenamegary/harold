import ipaddr from "ipaddr.js"
import { isLoopbackRequest, LoopbackRequest } from "./loopback"

export type ForwardedHeaderRequest = {
  headers: Record<string, string | string[] | undefined>
}

const hasHeaderValue = (
  headers: ForwardedHeaderRequest["headers"],
  name: string,
): boolean => {
  const value = headers[name]
  if (value === undefined) {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((entry) => entry.trim().length > 0)
  }

  return value.trim().length > 0
}

const forwardedHeaderPresenceChecks = [
  (headers: ForwardedHeaderRequest["headers"]) =>
    hasHeaderValue(headers, "x-forwarded-for"),
  (headers: ForwardedHeaderRequest["headers"]) =>
    hasHeaderValue(headers, "x-forwarded-proto"),
  (headers: ForwardedHeaderRequest["headers"]) =>
    hasHeaderValue(headers, "x-real-ip"),
  (headers: ForwardedHeaderRequest["headers"]) =>
    hasHeaderValue(headers, "forwarded"),
] as const

export const hasHonoredForwardedHeaders = (
  request: ForwardedHeaderRequest,
  tcpPeerTrusted: boolean,
): boolean => {
  if (!tcpPeerTrusted) {
    return false
  }

  return forwardedHeaderPresenceChecks.some((check) => check(request.headers))
}

const parseTcpPeer = (tcpPeer: string): ipaddr.IPv4 | ipaddr.IPv6 | undefined => {
  try {
    return ipaddr.process(tcpPeer)
  } catch {
    return undefined
  }
}

const peerMatchesTrustedProxy = (
  peer: ipaddr.IPv4 | ipaddr.IPv6,
  trustedProxy: string,
): boolean => {
  if (trustedProxy.includes("/")) {
    const [network, prefix] = ipaddr.parseCIDR(trustedProxy)
    return peer.match(network, prefix)
  }

  const allowed = ipaddr.process(trustedProxy)
  return peer.toNormalizedString() === allowed.toNormalizedString()
}

export const isTrustedProxyPeer = (
  tcpPeer: string,
  trustedProxies: readonly string[],
): boolean => {
  if (trustedProxies.length === 0) {
    return false
  }

  const peer = parseTcpPeer(tcpPeer)
  if (peer === undefined) {
    return false
  }

  return trustedProxies.some((trustedProxy) =>
    peerMatchesTrustedProxy(peer, trustedProxy),
  )
}

export type HostPrincipalRequest = LoopbackRequest & ForwardedHeaderRequest

export const isHostPrincipalRequest = (
  request: HostPrincipalRequest,
  trustedProxies: readonly string[],
): boolean => {
  if (!isLoopbackRequest(request)) {
    return false
  }

  const tcpPeerTrusted = isTrustedProxyPeer(request.ip, trustedProxies)
  const forwarded = hasHonoredForwardedHeaders(request, tcpPeerTrusted)
  return !(tcpPeerTrusted && forwarded)
}
