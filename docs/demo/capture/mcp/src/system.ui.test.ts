import { describe, expect, it } from "bun:test"
import { parseSystemNodes } from "./system.ui"

describe("system ui dump", () => {
  it("reads text, content-desc, bounds, clickable and selected", () => {
    const xml = [
      "<hierarchy>",
      '<node text="" content-desc="Photo taken on Aug 29, 2026, 10:18:06 AM"',
      ' class="android.widget.FrameLayout" package="com.google.android.providers.media.module"',
      ' clickable="true" selected="true" bounds="[725,640][1080,995]" />',
      '<node text="Add (1)" content-desc="" class="android.widget.Button"',
      ' package="com.google.android.providers.media.module"',
      ' clickable="true" selected="false" bounds="[807,2176][1038,2309]" />',
      "</hierarchy>",
    ].join("")

    const nodes = parseSystemNodes(xml)

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toEqual({
      text: "",
      description: "Photo taken on Aug 29, 2026, 10:18:06 AM",
      className: "android.widget.FrameLayout",
      packageName: "com.google.android.providers.media.module",
      clickable: true,
      selected: true,
      left: 725,
      top: 640,
      right: 1080,
      bottom: 995,
    })
    expect(nodes[1].text).toBe("Add (1)")
    expect(nodes[1].clickable).toBe(true)
  })

  it("decodes entities in text and content-desc", () => {
    const xml =
      '<node text="cat &amp; dog" content-desc="Mia&apos;s photo" bounds="[0,0][10,10]" />'

    const nodes = parseSystemNodes(xml)

    expect(nodes[0].text).toBe("cat & dog")
    expect(nodes[0].description).toBe("Mia's photo")
  })
})
