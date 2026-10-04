import QRCode from "qrcode"

export type RenderQrText = (text: string) => Promise<string>

/**
 * qrcode "terminal" mode renders the QR as UTF-8 half-blocks so a phone
 * camera can read it directly off a console without an image renderer.
 */
export const renderTerminalQr: RenderQrText = (text) =>
  QRCode.toString(text, { type: "terminal", small: true })
