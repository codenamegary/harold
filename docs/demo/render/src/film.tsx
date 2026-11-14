import { AbsoluteFill } from "remotion"
import { FontLoader, sansFamily } from "./fonts"
import { Music } from "./music"
import { ink } from "./theme"

/** The shared shell around a film: background, fonts, and the music bed. */
export const FilmShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: ink, fontFamily: sansFamily }}>
    <FontLoader />
    <Music />
    {children}
  </AbsoluteFill>
)
