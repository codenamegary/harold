import { DemoRouteContext } from "../demo.context"
import {
  badRequest,
  conflict,
  discardBody,
  noContentResponse,
  notFound,
  readJsonObject,
  readString,
} from "./http"

const replyOutcome = (outcome: "settled" | "already_settled" | "unknown"): Response => {
  if (outcome === "settled") {
    return noContentResponse()
  }
  if (outcome === "already_settled") {
    return conflict("That request was already resolved")
  }
  return notFound("Request not found")
}

export const permissionReplyResponse = async (
  context: DemoRouteContext,
  requestId: string,
): Promise<Response> => {
  const body = await readJsonObject(context.request)
  if (body === null) {
    return badRequest("#", "validation.body.invalid")
  }
  const optionId = readString(body, "optionId", 1, 200)
  if (optionId === null) {
    return badRequest("#/optionId", "validation.optionId.invalid")
  }

  return replyOutcome(
    context.store.resolvePendingReply({
      requestId,
      deviceId: context.deviceId,
      kind: "permission",
      value: { optionId },
    }),
  )
}

export const elicitationReplyResponse = async (
  context: DemoRouteContext,
  requestId: string,
): Promise<Response> => {
  // The body is deliberately unread. The demo returns a fixed result.
  await discardBody(context.request)
  return replyOutcome(
    context.store.resolvePendingReply({
      requestId,
      deviceId: context.deviceId,
      kind: "elicitation",
      value: { cancelled: false },
    }),
  )
}

export const extensionReplyResponse = async (
  context: DemoRouteContext,
  requestId: string,
): Promise<Response> => {
  // The body is deliberately unread. The demo returns a fixed result.
  await discardBody(context.request)
  return replyOutcome(
    context.store.resolvePendingReply({
      requestId,
      deviceId: context.deviceId,
      kind: "extension",
      value: { cancelled: false },
    }),
  )
}

export const deleteDeviceResponse = (context: DemoRouteContext, deviceId: string): Response => {
  if (deviceId !== context.deviceId) {
    return notFound("Device not found")
  }
  context.store.removeDevice(deviceId)
  return noContentResponse()
}
