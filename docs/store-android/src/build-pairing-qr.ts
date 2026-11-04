import { join } from "node:path"
import { renderReviewPairingQrPng, reviewPairingUri } from "./pairing-qr"

const output = join(import.meta.dir, "..", "review-pairing-qr.png")

await Bun.write(output, await renderReviewPairingQrPng())

console.log(`${output}  ${reviewPairingUri()}`)
