import { describe, expect, test } from "bun:test"
import { parseAdvertisedEndpoint } from "./connection-test.parse.advertised.endpoint"

describe("parseAdvertisedEndpoint", () => {
  test("defaults port 443", () => {
    expect(parseAdvertisedEndpoint("https://agents.example.com")).toEqual({
      hostname: "agents.example.com",
      port: 443,
    })
  })

  test("reads explicit port", () => {
    expect(parseAdvertisedEndpoint("https://agents.example.com:8443/path")).toEqual({
      hostname: "agents.example.com",
      port: 8443,
    })
  })
})
