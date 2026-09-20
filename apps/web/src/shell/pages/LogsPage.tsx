import React from "react"
import { LogsView } from "../../logs/LogsView"

export const LogsPage: React.FC = () => (
  <main className="flex min-h-0 flex-1 flex-col px-9 py-5.5 max-[820px]:px-4.5 max-[820px]:py-4.5">
    <LogsView />
  </main>
)
