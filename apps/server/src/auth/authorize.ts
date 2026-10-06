import { Principal } from "./principal"

export const authorizeActiveDevice = (principal: Principal): boolean => principal.kind === "device"
