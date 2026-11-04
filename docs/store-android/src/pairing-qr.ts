import QRCode from "qrcode"
import { formatPairingQrUri } from "contracts/pairing/qr-uri"

export const REVIEW_ENDPOINT = "https://harold-demo.codenamegary.com"
export const REVIEW_CODE = "DEM-O01"

const QR_WIDTH = 1024
const QR_MARGIN = 4

export const reviewPairingUri = (): string =>
  formatPairingQrUri({ endpoint: REVIEW_ENDPOINT, code: REVIEW_CODE })

/**
 * The demo server accepts any code shaped XXX-XXX, so this QR keeps working
 * after restarts and does not expire like a live `harold pair` code.
 */
export const renderReviewPairingQrPng = (): Promise<Buffer> =>
  QRCode.toBuffer(reviewPairingUri(), {
    type: "png",
    width: QR_WIDTH,
    margin: QR_MARGIN,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  })
