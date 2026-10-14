import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans"
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono"

const sans = loadSans("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
})

const mono = loadMono("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
})

export const sansFamily = sans.fontFamily
export const monoFamily = mono.fontFamily
