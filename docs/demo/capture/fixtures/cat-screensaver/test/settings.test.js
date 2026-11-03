import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_SETTINGS,
  SETTINGS_CONTROLS,
  controlFor,
  loadSettings,
  saveSettings,
  setSetting,
} from "../src/settings.js"

const memoryStorage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test("loads the default settings when storage is empty", () => {
  assert.deepEqual(loadSettings(memoryStorage()), { ...DEFAULT_SETTINGS })
})

test("merges stored settings over the defaults", () => {
  const storage = memoryStorage()
  storage.setItem("cat-screensaver.settings", JSON.stringify({ speed: 2 }))

  assert.deepEqual(loadSettings(storage), { ...DEFAULT_SETTINGS, speed: 2 })
})

test("falls back to the defaults when storage is corrupt", () => {
  const storage = memoryStorage()
  storage.setItem("cat-screensaver.settings", "{not json")

  assert.deepEqual(loadSettings(storage), { ...DEFAULT_SETTINGS })
})

test("saves settings and returns them", () => {
  const storage = memoryStorage()
  const settings = setSetting(DEFAULT_SETTINGS, "speed", 1.5)

  assert.deepEqual(saveSettings(settings, storage), settings)
  assert.deepEqual(loadSettings(storage), settings)
})

test("lists the speed and clock controls", () => {
  assert.equal(controlFor("speed")?.type, "range")
  assert.equal(controlFor("showClock")?.type, "toggle")
  assert.deepEqual(
    SETTINGS_CONTROLS.map((control) => control.key),
    ["speed", "showClock"],
  )
})
