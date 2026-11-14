import { loadSettings, renderSettingsPanel, saveSettings, setSetting } from "./settings.js"

const canvas = document.querySelector("#screen")
const settingsPanel = document.querySelector("#settings")
const context = canvas.getContext("2d")

let settings = loadSettings()
let startedAt = performance.now()

const resize = () => {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  startedAt = performance.now()
}

const drawClock = (now) => {
  if (!settings.showClock) {
    return
  }
  const elapsed = Math.floor((now - startedAt) / 1000)
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0")
  const seconds = String(elapsed % 60).padStart(2, "0")
  context.fillStyle = "#f4f1e8"
  context.font = "48px ui-monospace, monospace"
  context.textAlign = "center"
  context.fillText(`${minutes}:${seconds}`, canvas.width / 2, canvas.height / 2)
}

const draw = (now) => {
  context.fillStyle = "#070b12"
  context.fillRect(0, 0, canvas.width, canvas.height)

  for (let index = 0; index < 48; index += 1) {
    const x = (index * 137 + (now - startedAt) * 0.01 * settings.speed) % canvas.width
    const y = (index * 89) % canvas.height
    context.fillStyle = index % 7 === 0 ? "#b6f36b" : "#43506b"
    context.fillRect(x, y, 2, 2)
  }

  drawClock(now)
  window.requestAnimationFrame(draw)
}

const paintSettings = () => {
  settingsPanel.replaceChildren(
    ...renderSettingsPanel(settings, (key, value) => {
      settings = setSetting(settings, key, value)
      saveSettings(settings)
      paintSettings()
    }),
  )
}

window.addEventListener("resize", resize)
resize()
paintSettings()
window.requestAnimationFrame(draw)
