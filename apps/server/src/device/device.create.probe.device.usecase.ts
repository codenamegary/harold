import { DeviceCredentialResponse } from "contracts/http/device"
import { InsertProbeDevice } from "./device.ports"
import { DeviceError } from "./device.errors"
import { createDeviceCredential } from "./device.create.credential"
import { hashDeviceCredential } from "./device.hash.credential"

const PROBE_DEVICE_NAME = "Connection test probe"

export type CreateProbeDeviceDeps = Readonly<{
  insertProbeDevice: InsertProbeDevice
}>

export type CreateProbeDeviceResult =
  | { ok: true; value: DeviceCredentialResponse }
  | { ok: false; error: DeviceError }

export const makeCreateProbeDevice =
  (deps: CreateProbeDeviceDeps) =>
  (): CreateProbeDeviceResult => {
    const credential = createDeviceCredential()
    const credentialHash = hashDeviceCredential(credential)

    const inserted = deps.insertProbeDevice({
      name: PROBE_DEVICE_NAME,
      platform: null,
      credentialHash,
      pairedAt: new Date().toISOString(),
    })

    if (!inserted.ok) {
      return inserted
    }

    return {
      ok: true,
      value: {
        device: inserted.value,
        credential,
      },
    }
  }
