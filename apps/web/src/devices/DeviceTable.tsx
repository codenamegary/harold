import React from "react"
import { Ban, Loader2, Trash2 } from "lucide-react"
import { Device, DeviceState } from "contracts/http/device"
import { IconButton } from "../design-system/IconButton"
import { Panel } from "../design-system/Panel"
import { StatusPill } from "../design-system/StatusPill"
import { formatRelativeLastUsed } from "../workspace/format.relative.last.used"
import { useDeleteDeviceMutation } from "./use.delete.device.mutation"
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

const actionIconButtonClassName =
  "text-danger hover:border-danger/30 hover:bg-danger/5 hover:text-danger"

export const DeviceTable: React.FC<DeviceTableProps> = ({ devices, isLoading, isError }) => {
  const revokeDeviceMutation = useRevokeDeviceMutation()
  const deleteDeviceMutation = useDeleteDeviceMutation()

  if (isLoading) {
    return <Panel className="p-8 text-base text-dim">Loading devices…</Panel>
  }

  if (isError) {
    return (
      <Panel className="p-8 text-base text-danger" role="alert">
        Could not load devices.
      </Panel>
    )
  }

  return (
    <Panel>
      <div
        className="grid min-h-9.5 grid-cols-[minmax(180px,1.7fr)_0.8fr_0.8fr_6.5rem_5.5rem] items-center gap-3 border-b border-line-soft px-4 font-mono text-xs text-dim max-[820px]:hidden"
        role="row"
      >
        {tableHeaders.map((header) => (
          <span key={header || "actions"} role="columnheader">
            {header}
          </span>
        ))}
      </div>
      {devices.length === 0 ? (
        <div className="p-8 text-base text-dim">No paired devices yet.</div>
      ) : (
        devices.map((device) => {
          const isRevoking =
            revokeDeviceMutation.isPending && revokeDeviceMutation.variables === device.id
          const isDeleting =
            deleteDeviceMutation.isPending && deleteDeviceMutation.variables === device.id
          const isRevoked = device.state === "revoked"

          return (
            <div
              key={device.id}
              className="grid min-h-14.5 grid-cols-[minmax(180px,1.7fr)_0.8fr_0.8fr_6.5rem_5.5rem] items-center gap-3 border-b border-line-soft px-4 text-sm last:border-b-0 max-[820px]:grid-cols-1 max-[820px]:items-start max-[820px]:py-4"
              role="row"
            >
              <div>
                <strong className="block text-body">{device.name}</strong>
                <small className="mt-1 block font-mono text-xs text-dim">{device.id}</small>
              </div>
              <span className="text-body-soft">{formatLastSeen(device)}</span>
              <span className="text-body-soft">{device.platform ?? "—"}</span>
              <StatusPill size="md" variant={stateVariantByState[device.state]}>
                {stateLabelByState[device.state]}
              </StatusPill>
              <div className="flex items-center gap-1.5 justify-self-start">
                <IconButton
                  aria-label={`Revoke ${device.name}`}
                  disabled={isRevoked || isRevoking || isDeleting}
                  className={actionIconButtonClassName}
                  onClick={() => revokeDeviceMutation.mutate(device.id)}
                >
                  {isRevoking ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Ban aria-hidden className="size-3.5" strokeWidth={1.75} />
                  )}
                </IconButton>
                <IconButton
                  aria-label={`Delete ${device.name}`}
                  disabled={isDeleting || isRevoking}
                  className={actionIconButtonClassName}
                  onClick={() => deleteDeviceMutation.mutate(device.id)}
                >
                  {isDeleting ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
                  )}
                </IconButton>
              </div>
            </div>
          )
        })
      )}
    </Panel>
  )
}
