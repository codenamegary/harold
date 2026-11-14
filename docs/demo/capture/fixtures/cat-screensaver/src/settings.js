const STORAGE_KEY = "cat-screensaver.settings"

export const DEFAULT_SETTINGS = Object.freeze({
  speed: 1,
  showClock: true,
})

export const SETTINGS_CONTROLS = Object.freeze([
  { key: "speed", label: "Speed", type: "range", min: 0.5, max: 2, step: 0.5 },
  { key: "showClock", label: "Show clock", type: "toggle" },
])

export const loadSettings = (storage = globalThis.localStorage) => {
  if (!storage) {
    return { ...DEFAULT_SETTINGS }
  }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export const saveSettings = (settings, storage = globalThis.localStorage) => {
  storage?.setItem(STORAGE_KEY, JSON.stringify(settings))
  return settings
}

export const setSetting = (settings, key, value) => ({ ...settings, [key]: value })

export const controlFor = (key) => SETTINGS_CONTROLS.find((control) => control.key === key)

export const renderSettingsPanel = (settings, onChange, documentRef = globalThis.document) => {
  if (!documentRef) {
    return []
  }
  return SETTINGS_CONTROLS.map((control) => {
    const row = documentRef.createElement("label")
    row.className = "setting"
    row.dataset.setting = control.key

    const name = documentRef.createElement("span")
    name.textContent = control.label

    const input = documentRef.createElement("input")
    input.name = control.key
    input.setAttribute("aria-label", control.label)

    if (control.type === "toggle") {
      input.type = "checkbox"
      input.checked = Boolean(settings[control.key])
      input.addEventListener("change", () => onChange(control.key, input.checked))
    } else {
      input.type = "range"
      input.min = String(control.min)
      input.max = String(control.max)
      input.step = String(control.step)
      input.value = String(settings[control.key])
      input.addEventListener("input", () => onChange(control.key, Number(input.value)))
    }

    row.append(name, input)
    return row
  })
}
