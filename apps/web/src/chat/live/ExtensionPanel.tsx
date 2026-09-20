import React, { useState } from "react"
import { Button } from "../../design-system/Button"

export type StreamExtension = {
  requestId: string
  method: string
  params: unknown
}

type ExtensionPanelProps = {
  request: StreamExtension
  onReply: (result: unknown) => void
  onSkip: () => void
}

const encodeParams = (params: unknown): string => {
  try {
    return JSON.stringify(params, null, 2)
  } catch {
    return String(params)
  }
}

export const ExtensionPanel: React.FC<ExtensionPanelProps> = ({ request, onReply, onSkip }) => {
  const [resultText, setResultText] = useState("{}")
  const [parseError, setParseError] = useState<string | null>(null)

  const handleReply = () => {
    try {
      const parsed: unknown = JSON.parse(resultText)
      setParseError(null)
      onReply(parsed)
    } catch {
      setParseError("Result must be JSON.")
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-amber/25 bg-amber/5 px-4 py-3">
      <p className="mb-2 text-base text-body">
        Agent request <span className="font-mono text-body-soft">{request.method}</span>
      </p>
      <pre className="mb-3 max-h-40 overflow-auto rounded-md border border-amber/35 bg-surface-deep px-3 py-2 font-mono text-xs text-dim">
        {encodeParams(request.params)}
      </pre>
      <label className="mb-2 block text-xs text-dim">
        Reply JSON
        <textarea
          aria-label="Extension reply JSON"
          value={resultText}
          onChange={(event) => {
            setResultText(event.target.value)
            setParseError(null)
          }}
          rows={3}
          className="mt-1 block w-full rounded-md border border-amber/35 bg-surface-deep px-3 py-2 font-mono text-xs text-body outline-none"
        />
      </label>
      {parseError !== null ? <p className="mb-2 text-xs text-danger">{parseError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleReply}>
          Send reply
        </Button>
        <Button type="button" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  )
}
