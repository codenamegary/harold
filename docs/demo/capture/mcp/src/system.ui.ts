/**
 * The system pickers are outside the app, so the probe cannot see their layouts.
 *
 * The plan beat taps fixed points on the capture AVD's 1080x2400 picker layout
 * and proves the result through app facts. The UIAutomator parser here remains
 * for a fallback; every tap is a real adb tap, and the caller stamps the
 * coordinates so `capture.json` and the renderer can draw the ripple.
 */

import { adb, tap as adbTap } from "./adb"

const DUMP_PATH = "/sdcard/harold-system-ui.xml"

export type SystemNode = Readonly<{
  text: string
  description: string
  className: string
  packageName: string
  clickable: boolean
  selected: boolean
  left: number
  top: number
  right: number
  bottom: number
}>

export type SystemUi = Readonly<{
  nodes: () => Promise<readonly SystemNode[]>
  /** Tap the node centre and return the device-pixel point that was tapped. */
  tap: (node: SystemNode) => Promise<{ x: number; y: number }>
  /** Tap a fixed device-pixel point. The picker layouts are stable per AVD. */
  tapPoint: (x: number, y: number) => Promise<{ x: number; y: number }>
}>

const decodeEntities = (value: string): string =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&#10;", "\n")

const attribute = (attributes: string, name: string): string => {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return match === null ? "" : decodeEntities(match[1])
}

const bounds = (
  value: string,
): { left: number; top: number; right: number; bottom: number } | null => {
  const match = value.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/)
  if (match === null) {
    return null
  }
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  }
}

export const parseSystemNodes = (xml: string): readonly SystemNode[] => {
  const nodes: SystemNode[] = []
  const pattern = /<node\b([^>]*)>/g
  const found = xml.matchAll(pattern)
  for (const match of found) {
    const attributes = match[1]
    const rect = bounds(attribute(attributes, "bounds"))
    if (rect === null) {
      continue
    }
    nodes.push({
      text: attribute(attributes, "text"),
      description: attribute(attributes, "content-desc"),
      className: attribute(attributes, "class"),
      packageName: attribute(attributes, "package"),
      clickable: attribute(attributes, "clickable") === "true",
      selected: attribute(attributes, "selected") === "true",
      ...rect,
    })
  }
  return nodes
}

const dumpXml = async (): Promise<string> => {
  const attempt = async (remaining: number): Promise<string> => {
    try {
      await adb(["shell", "uiautomator", "dump", DUMP_PATH])
      return await adb(["exec-out", "cat", DUMP_PATH])
    } catch (error) {
      if (remaining <= 1) {
        throw error
      }
      await new Promise((done) => setTimeout(done, 250))
      return attempt(remaining - 1)
    }
  }
  return attempt(3)
}

export const makeSystemUi = (): SystemUi => ({
  nodes: async () => parseSystemNodes(await dumpXml()),
  tap: async (node) => {
    const x = Math.round((node.left + node.right) / 2)
    const y = Math.round((node.top + node.bottom) / 2)
    await adbTap(x, y)
    return { x, y }
  },
  tapPoint: async (x, y) => {
    const point = { x: Math.round(x), y: Math.round(y) }
    await adbTap(point.x, point.y)
    return point
  },
})
