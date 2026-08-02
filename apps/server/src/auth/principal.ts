export type HostPrincipal = {
  kind: "host"
}

export type DevicePrincipal = {
  kind: "device"
  deviceId: string
}

export type UnauthenticatedPrincipal = {
  kind: "unauthenticated"
}

export type Principal = HostPrincipal | DevicePrincipal | UnauthenticatedPrincipal

export const hostPrincipal = (): HostPrincipal => ({ kind: "host" })

export const devicePrincipal = (deviceId: string): DevicePrincipal => ({
  kind: "device",
  deviceId,
})

export const unauthenticatedPrincipal = (): UnauthenticatedPrincipal => ({
  kind: "unauthenticated",
})

export const formatPrincipal = (principal: Principal): string => {
  switch (principal.kind) {
    case "host":
      return "host"
    case "device":
      return `device:${principal.deviceId}`
    case "unauthenticated":
      return "unauthenticated"
  }
}
