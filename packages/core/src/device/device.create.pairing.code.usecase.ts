import { CreatePairingCodeBody, CreatePairingCodeResponse } from "contracts/http/pairing-code"
import { DeviceError } from "./device.errors"
import {
  AdvertisedEndpointSettings,
  GetAdvertisedEndpointSettings,
  InsertPairingCode,
} from "./device.ports"
import { generatePairingCode } from "./device.generate.pairing.code"
import { hashPairingCode } from "./device.hash.pairing.code"

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000

export type CreatePairingCodeDeps = Readonly<{
  loopbackEndpoint: string
  getAdvertisedEndpointSettings: GetAdvertisedEndpointSettings
  insertPairingCode: InsertPairingCode
}>

export type CreatePairingCodeResult =
  | { ok: true; value: CreatePairingCodeResponse }
  | { ok: false; error: DeviceError }

const isAdvertisedAvailable = (
  settings: AdvertisedEndpointSettings,
): settings is AdvertisedEndpointSettings & { readonly advertisedUrl: string } =>
  settings.advertisedUrl !== null && settings.advertisedUrlEnabled

export const makeCreatePairingCode =
  (deps: CreatePairingCodeDeps) =>
  async (body: CreatePairingCodeBody = {}): Promise<CreatePairingCodeResult> => {
    const issue = async (endpoint: string): Promise<CreatePairingCodeResult> => {
      const code = generatePairingCode()
      const codeHash = await hashPairingCode(code)
      const createdAt = new Date().toISOString()
      const expiresAt = new Date(Date.parse(createdAt) + PAIRING_CODE_TTL_MS).toISOString()

      const inserted = deps.insertPairingCode({ codeHash, createdAt, expiresAt })
      if (!inserted.ok) {
        return inserted
      }

      return {
        ok: true,
        value: {
          id: inserted.value.id,
          code,
          endpoint,
          state: "active",
          createdAt: inserted.value.createdAt,
          expiresAt: inserted.value.expiresAt,
        },
      }
    }

    const settings = deps.getAdvertisedEndpointSettings()

    if (body.endpoint === "loopback") {
      return issue(deps.loopbackEndpoint)
    }

    if (body.endpoint === "advertised") {
      if (!isAdvertisedAvailable(settings)) {
        return { ok: false, error: { kind: "advertised_endpoint_unavailable" } }
      }
      return issue(settings.advertisedUrl)
    }

    if (isAdvertisedAvailable(settings)) {
      return issue(settings.advertisedUrl)
    }

    return issue(deps.loopbackEndpoint)
  }
