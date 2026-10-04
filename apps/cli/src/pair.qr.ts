import QRCode from "qrcode"

export type RenderQrText = (text: string) => Promise<string>

/**
 * qrcode "terminal" mode: UTF-8 half-blocks with explicit background colors,
 * which is the rendering a phone camera reads reliably off a console.
 */
export const renderTerminalQr: RenderQrText = (text) =>
  QRCode.toString(text, { type: "terminal", small: true })
