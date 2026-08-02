import { claimPairingCodePath } from "contracts/http/pairing-code"

export type RoutePolicyRequest = {
  method: string
  routerPath: string
}

const CLAIM_ROUTE = claimPairingCodePath(":code")

export const isOpenRoute = (request: RoutePolicyRequest): boolean => {
  if (request.method === "GET" && request.routerPath === "/v1/status") {
    return true
  }

  if (request.method === "POST" && request.routerPath === CLAIM_ROUTE) {
    return true
  }

  if (request.routerPath.startsWith("/v1/_test")) {
    return true
  }

  return false
}
