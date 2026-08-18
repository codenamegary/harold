import React from "react"
import { LogsView } from "../../logs/LogsView"

export const LogsPage: React.FC = () => (
  <main className="flex min-h-0 flex-1 flex-col px-[35px] py-[22px] max-[820px]:px-[18px] max-[820px]:py-[18px]">
    <LogsView />
  </main>
)
