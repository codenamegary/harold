import { Principal } from "./principal"

export const authorizeActiveFullOperator = (principal: Principal): boolean => {
  switch (principal.kind) {
    case "host":
    case "device":
      return true
    case "unauthenticated":
      return false
  }
}
