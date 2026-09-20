import React from "react"
import { Device } from "contracts/http/device"
import { formatRelativeLastUsed } from "../workspace/format.relative.last.used"

type DeviceSummaryProps = {
  devices: ReadonlyArray<Device>
  isLoading: boolean
}

const pluralizeDevice = (count: number) => (count === 1 ? "device" : "devices")

const latestPairing = (devices: ReadonlyArray<Device>): Device | undefined =>
  devices.reduce<Device | undefined>((latest, device) => {
    if (latest === undefined) {
      return device
    }

    return device.pairedAt > latest.pairedAt ? device : latest
  }, undefined)

export const DeviceSummary: React.FC<DeviceSummaryProps> = ({ devices, isLoading }) => {
  const onlineCount = devices.filter((device) => device.state === "online").length
  const lastPaired = latestPairing(devices)
  const lastPairingLabel =
    lastPaired === undefined
      ? "None"
      : formatRelativeLastUsed(lastPaired.pairedAt, "1970-01-01T00:00:00.000Z", Date.now())
  const onlineLabel = isLoading
    ? "Loading devices"
    : `${onlineCount} ${pluralizeDevice(onlineCount)} online`

  return (
    <div className="mb-3.5 grid grid-cols-[1.5fr_1fr] overflow-hidden rounded-lg border border-line-soft bg-panel max-[820px]:grid-cols-1">
      <div className="flex min-h-16.5 items-center gap-2.5 border-r border-line-soft px-4 text-sm max-[820px]:border-r-0 max-[820px]:border-b">
        <span
          aria-hidden
          className={`inline-block size-2 shrink-0 rounded-full ${onlineCount > 0 ? "bg-lime" : "bg-offline"}`}
        />
        <strong>{onlineLabel}</strong>
        <small className="text-xs text-dim">of {devices.length} paired</small>
      </div>
      <div className="flex min-h-16.5 flex-col items-start justify-center gap-1.5 px-4 text-sm">
        <span className="text-xs text-dim">Last new pairing</span>
        <strong>{isLoading ? "Loading…" : lastPairingLabel}</strong>
      </div>
    </div>
  )
}
