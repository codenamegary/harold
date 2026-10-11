import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans"

const sans = loadSans("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
})

export const sansFamily = sans.fontFamily
