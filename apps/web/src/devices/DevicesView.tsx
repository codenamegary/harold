import React from "react"
import { DevicePageIntro } from "./DevicePageIntro"
import { DeviceSummary } from "./DeviceSummary"
import { DeviceTable } from "./DeviceTable"
import { DevicesDangerNote } from "./DevicesDangerNote"

export const DevicesView: React.FC = () => (
  <>
    <DevicePageIntro />
    <DeviceSummary />
    <DeviceTable />
    <DevicesDangerNote />
  </>
)
