import React from "react"
import { useConnection } from "../connection/ConnectionProvider"
import { Button } from "../design-system/Button"
import { Panel } from "../design-system/Panel"
import { serverDetailsDisplayByPhase } from "./serverDetailsDisplay"

type DetailRowProps = {
  label: string
  value: string
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 border-t border-line-soft py-3.5 first:border-t-0 first:pt-0">
    <span className="text-sm text-muted">{label}</span>
    <code className="font-mono text-xs text-body">{value}</code>
  </div>
)

export const ServerDetailsPanel: React.FC = () => {
  const { connection } = useConnection()
  const details = serverDetailsDisplayByPhase(connection)

  return (
    <Panel aria-label="Server details" className="p-[22px]">
      <h3 className="m-0 mb-1 text-lg font-semibold">Server details</h3>
      <DetailRow label="ACP endpoint" value={details.endpoint} />
      <DetailRow label="Runtime version" value={details.runtimeVersion} />
      <DetailRow label="Node.js" value={details.nodeJs} />
      <Button variant="secondary" className="mt-4 w-full" disabled>
        Download diagnostics
      </Button>
    </Panel>
  )
}
