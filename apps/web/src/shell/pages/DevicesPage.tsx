import React from "react"
import { DevicesView } from "../../devices/DevicesView"

export const DevicesPage: React.FC = () => (
  <main>
    <h1 className="sr-only">Devices</h1>
    <DevicesView />
  </main>
)
