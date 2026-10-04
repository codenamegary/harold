import { describe, expect, test } from "bun:test"
import { isFreshInstall } from "./install.detect"

describe("isFreshInstall", () => {
  test("is fresh when the database file does not exist", () => {
    const fresh = isFreshInstall({ databasePath: "/data/harold.db", fileExists: () => false })

    expect(fresh).toBe(true)
  })

  test("is not fresh once the database file exists", () => {
    const fresh = isFreshInstall({ databasePath: "/data/harold.db", fileExists: () => true })

    expect(fresh).toBe(false)
  })

  test("checks the exact database path it was given", () => {
    const checked: Array<string> = []
    isFreshInstall({
      databasePath: "/data/harold.db",
      fileExists: (path) => {
        checked.push(path)
        return true
      },
    })

    expect(checked).toEqual(["/data/harold.db"])
  })
})
