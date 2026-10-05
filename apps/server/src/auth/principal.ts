export type DevicePrincipal = {
  kind: "device"
  deviceId: string
}

export type UnauthenticatedPrincipal = {
  kind: "unauthenticated"
}

export type Principal = DevicePrincipal | UnauthenticatedPrincipal

export const devicePrincipal = (deviceId: string): DevicePrincipal => ({
  kind: "device",
  deviceId,
})

export const unauthenticatedPrincipal = (): UnauthenticatedPrincipal => ({
  kind: "unauthenticated",
})

export const formatPrincipal = (principal: Principal): string => {
  switch (principal.kind) {
    case "device":
      return `device:${principal.deviceId}`
    case "unauthenticated":
      return "unauthenticated"
  }
}
