import { qrRows } from "./qr-rows"

// qrcode's terminal-small renderer packs two module rows into one text row:
// '█' = both dark, '▀' = top dark, '▄' = bottom dark, ' ' = both light.
// Text row 0 starts at module row -1 (the quiet row), and column 0 is the
// quiet column, so module (x, y) lives at char x + 1 of text row (y + 1) / 2.
// Decoding back to a module grid lets the video draw crisp squares instead
// of relying on a font's block glyphs lining up.
const decode = (rows: readonly string[]): boolean[][] => {
  const textRows = rows.filter((row) => row.length > 0)
  const size = textRows[0].length - 2
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  )
  textRows.forEach((row, textIndex) => {
    const top = textIndex * 2 - 1
    const bottom = top + 1
    Array.from(row).forEach((char, charIndex) => {
      const x = charIndex - 1
      if (x < 0 || x >= size) {
        return
      }
      const topDark = char === "█" || char === "▀"
      const bottomDark = char === "█" || char === "▄"
      if (top >= 0 && top < size && topDark) {
        grid[top][x] = true
      }
      if (bottom >= 0 && bottom < size && bottomDark) {
        grid[bottom][x] = true
      }
    })
  })
  return grid
}

export const qrModules: ReadonlyArray<ReadonlyArray<boolean>> = decode(qrRows)
export const qrSize = qrModules.length
