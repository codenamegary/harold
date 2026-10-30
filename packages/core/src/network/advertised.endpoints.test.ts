import { describe, expect, test } from "bun:test"
import { AdvertisedEndpointEntry, recordAdvertisedEndpoint } from "./advertised.endpoints"

const entry = (
  url: string,
  overrides: Partial<AdvertisedEndpointEntry> = {},
): AdvertisedEndpointEntry => ({
  url,
  source: "detected",
  lastUsedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
})

describe("recordAdvertisedEndpoint", () => {
  test("prepends the new endpoint and keeps the rest in most-recently-used order", () => {
    const history = [entry("http://10.0.0.5:3847"), entry("http://10.0.0.9:3847")]

    const next = recordAdvertisedEndpoint(history, entry("http://192.168.1.20:3847"))

    expect(next.map((item) => item.url)).toEqual([
      "http://192.168.1.20:3847",
      "http://10.0.0.5:3847",
      "http://10.0.0.9:3847",
    ])
  })

  test("moves a known URL to the front and refreshes its metadata instead of duplicating", () => {
    const history = [
      entry("http://10.0.0.5:3847"),
      entry("http://10.0.0.9:3847", { source: "manual", lastUsedAt: "2026-09-01T00:00:00.000Z" }),
    ]

    const next = recordAdvertisedEndpoint(
      history,
      entry("http://10.0.0.9:3847", { source: "manual", lastUsedAt: "2026-10-02T00:00:00.000Z" }),
    )

    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(
      entry("http://10.0.0.9:3847", { source: "manual", lastUsedAt: "2026-10-02T00:00:00.000Z" }),
    )
  })

  test("caps the history length", () => {
    const history = Array.from({ length: 12 }, (_, index) => entry(`http://10.0.0.${index}:3847`))

    const next = recordAdvertisedEndpoint(history, entry("http://192.168.1.20:3847"))

    expect(next).toHaveLength(10)
    expect(next[0]?.url).toBe("http://192.168.1.20:3847")
  })
})
