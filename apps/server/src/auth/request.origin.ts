import { isLoopbackRequest, LoopbackRequest } from "./loopback"
import { ipMatchesAllowlist } from "./ip.match"

export const isTrustedProxyPeer = (
  tcpPeer: string,
  trustedProxies: readonly string[],
): boolean => {
  if (trustedProxies.length === 0) {
    return false
  }

  return ipMatchesAllowlist(tcpPeer, trustedProxies)
}

export type HostPrincipalRequest = LoopbackRequest

export const isHostPrincipalRequest = (
  request: HostPrincipalRequest,
  trustedProxies: readonly string[],
): boolean => {
  if (!isLoopbackRequest(request)) {
    return false
  }

  return !isTrustedProxyPeer(request.ip, trustedProxies)
}
