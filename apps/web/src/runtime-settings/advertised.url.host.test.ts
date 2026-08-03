import { describe, expect, test } from "bun:test"
import {
  advertisedUrlFromHost,
  hostFromAdvertisedUrl,
  normalizeExternalUrlHost,
} from "./advertised.url.host"

describe("advertised.url.host", () => {
  test("extracts host from https URL", () => {
    expect(hostFromAdvertisedUrl("https://agents.example.com")).toBe("agents.example.com")
  })

  test("returns empty string for null", () => {
    expect(hostFromAdvertisedUrl(null)).toBe("")
  })

  test("builds https URL from host", () => {
    expect(advertisedUrlFromHost("agents.example.com")).toBe("https://agents.example.com")
  })

  test("strips pasted https prefix from host input", () => {
    expect(normalizeExternalUrlHost("https://agents.example.com")).toBe("agents.example.com")
  })
})
