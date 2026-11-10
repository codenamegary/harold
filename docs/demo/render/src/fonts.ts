import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono"
import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans"
import { loadFont as loadDisplay } from "@remotion/google-fonts/LilitaOne"

const sans = loadSans("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
})

const mono = loadMono("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
})

const display = loadDisplay("normal", {
  weights: ["400"],
  subsets: ["latin"],
})

export const sansFamily = sans.fontFamily
export const monoFamily = mono.fontFamily
export const displayFamily = display.fontFamily
