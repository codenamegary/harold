import React from "react"
import { Device, DeviceState } from "contracts/http/device"
import { Panel } from "../design-system/Panel"
import { StatusPill } from "../design-system/StatusPill"
import { formatRelativeLastUsed } from "../workspace/format.relative.last.used"
import { useRevokeDeviceMutation } from "./use.revoke.device.mutation"

const tableHeaders = ["DEVICE", "LAST SEEN", "PLATFORM", "STATUS", ""] as const

type DeviceTableProps = {
  devices: ReadonlyArray<Device>
  isLoading: boolean
  isError: boolean
}

const stateVariantByState: Record<DeviceState, "default" | "success" | "violet"> = {
  online: "success",
  offline: "default",
  revoked: "violet",
}

const stateLabelByState: Record<DeviceState, string> = {
  online: "Online",
  offline: "Offline",
  revoked: "Revoked",
}

const formatLastSeen = (device: Device): string =>
  device.lastSeenAt === null
    ? "Never"
    : formatRelativeLastUsed(device.lastSeenAt, device.pairedAt, Date.now())

export const DeviceTable: React.FC<DeviceTableProps> = ({
  devices,
  isLoading,
  isError,
}) => {
  const revokeDeviceMutation = useRevokeDeviceMutation()

  if (isLoading) {
    return (
      <Panel className="p-8 text-sm text-dim">
        Loading devices…
      </Panel>
    )
  }

  if (isError) {
    return (
      <Panel className="p-8 text-sm text-danger" role="alert">
        Could not load devices.
      </Panel>
    )
  }

  return (
    <Panel className="table-panel">
      <div
        className="grid min-h-[38px] grid-cols-[minmax(180px,1.7fr)_0.8fr_0.8fr_80px_80px] items-center gap-3 border-b border-line-soft px-[17px] font-mono text-2xs text-dim max-[820px]:hidden"
        role="row"
      >
        {tableHeaders.map((header) => (
          <span key={header || "actions"} role="columnheader">
            {header}
          </span>
        ))}
      </div>
      {devices.length === 0 ? (
        <div className="p-8 text-sm text-dim">No paired devices yet.</div>
      ) : (
        devices.map((device) => {
          const isRevoking =
            revokeDeviceMutation.isPending &&
            revokeDeviceMutation.variables === device.id
          const isRevoked = device.state === "revoked"

          return (
            <div
              key={device.id}
              className="grid min-h-[58px] grid-cols-[minmax(180px,1.7fr)_0.8fr_0.8fr_80px_80px] items-center gap-3 border-b border-line-soft px-[17px] text-sm last:border-b-0 max-[820px]:grid-cols-1 max-[820px]:items-start max-[820px]:py-4"
              role="row"
            >
              <div>
                <strong className="block text-body">{device.name}</strong>
                <small className="mt-1 block font-mono text-2xs text-dim">{device.id}</small>
              </div>
              <span className="text-body-soft">{formatLastSeen(device)}</span>
              <span className="text-body-soft">{device.platform ?? "—"}</span>
              <StatusPill variant={stateVariantByState[device.state]}>
                {stateLabelByState[device.state]}
              </StatusPill>
              <button
                type="button"
                aria-label={`Revoke ${device.name}`}
                disabled={isRevoked || isRevoking}
                className="justify-self-start border-0 bg-transparent p-0 text-xs text-danger hover:text-white disabled:cursor-not-allowed disabled:text-dim"
                onClick={() => revokeDeviceMutation.mutate(device.id)}
              >
                {isRevoking ? "Revoking…" : "Revoke"}
              </button>
            </div>
          )
        })
      )}
    </Panel>
  )
}
