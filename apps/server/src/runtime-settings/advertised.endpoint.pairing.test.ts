import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"
import { makeCreatePairingCode } from "core/device/create.pairing.code.usecase"
import { makeCanonicalizePath } from "../filesystem/filesystem.node.adapters"
import { makeRuntimeSettingsFileStore, settingsFileName } from "./runtime-settings.file.adapters"
import { makeUpdateRuntimeSettings } from "./runtime-settings.update.usecase"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harold-connect-pairing-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

/**
 * The connect flow (#320) only patches advertisedUrl and advertisedUrlEnabled,
 * so the workspace ports of the shared update use case stay unused here and
 * fail loudly if that ever changes.
 */
const makeConnectUpdateUseCase = (dataDir: string) => {
  const store = makeRuntimeSettingsFileStore({ dataDir })
  return makeUpdateRuntimeSettings({
    getSettings: store.get,
    saveSettings: store.save,
    canonicalizePath: makeCanonicalizePath(),
    listAllWorkspaces: () => {
      throw new Error("connect does not manage allowed roots")
    },
    deleteWorkspace: () => {
      throw new Error("connect does not manage allowed roots")
    },
  })
}

const makePairingCodeAgainstPersistedSettings = (dataDir: string) => {
  const persisted = makeRuntimeSettingsFileStore({ dataDir }).get()
  return makeCreatePairingCode({
    loopbackEndpoint: "http://127.0.0.1:3847",
    getAdvertisedEndpointSettings: () => ({
      advertisedUrl: persisted.advertisedUrl,
      advertisedUrlEnabled: persisted.advertisedUrlEnabled,
    }),
    insertPairingCode: (input) => ({
      ok: true,
      value: {
        id: "pair_1",
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        state: "active",
      },
    }),
  })
}

describe("connect persistence feeding pairing endpoint selection", () => {
  test("pairing issues against the advertised URL persisted by connect", async () => {
    const dataDir = await createTempDataDir()
    const updateRuntimeSettings = makeConnectUpdateUseCase(dataDir)

    const updated = await updateRuntimeSettings({
      body: { advertisedUrl: "https://agents.example.com", advertisedUrlEnabled: true },
      force: false,
    })

    expect(updated.ok).toBe(true)

    const raw = YAML.parse(await readFile(path.join(dataDir, settingsFileName), "utf8")) as {
      advertisedUrl: string | null
      advertisedUrlEnabled: boolean
    }
    expect(raw.advertisedUrl).toBe("https://agents.example.com")
    expect(raw.advertisedUrlEnabled).toBe(true)

    const createPairingCode = makePairingCodeAgainstPersistedSettings(dataDir)
    const issued = await createPairingCode({})

    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    expect(issued.value.endpoint).toBe("https://agents.example.com")
  })

  test("pairing issues against a persisted loopback http advertised URL", async () => {
    const dataDir = await createTempDataDir()
    const updateRuntimeSettings = makeConnectUpdateUseCase(dataDir)

    const updated = await updateRuntimeSettings({
      body: { advertisedUrl: "http://127.0.0.1:3847", advertisedUrlEnabled: true },
      force: false,
    })

    expect(updated.ok).toBe(true)

    const createPairingCode = makePairingCodeAgainstPersistedSettings(dataDir)
    const issued = await createPairingCode({ endpoint: "advertised" })

    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    expect(issued.value.endpoint).toBe("http://127.0.0.1:3847")
  })
})
