import React from "react"
import { DevicePageIntro } from "./DevicePageIntro"
import { DeviceSummary } from "./DeviceSummary"
import { DeviceTable } from "./DeviceTable"
import { DevicesDangerNote } from "./DevicesDangerNote"
import { useDevicesQuery } from "./use.devices.query"

export const DevicesView: React.FC = () => {
  const devicesQuery = useDevicesQuery()
  const devices = devicesQuery.data?.items ?? []

  return (
    <>
      <DevicePageIntro />
      <DeviceSummary devices={devices} isLoading={devicesQuery.isLoading} />
      <DeviceTable
        devices={devices}
        isLoading={devicesQuery.isLoading}
        isError={devicesQuery.isError}
      />
      <DevicesDangerNote />
    </>
  )
}
