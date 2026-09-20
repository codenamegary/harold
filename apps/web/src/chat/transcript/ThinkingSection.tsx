import React from "react"

type ThinkingSectionProps = {
  text: string
}

export const ThinkingSection: React.FC<ThinkingSectionProps> = ({ text }) => {
  return (
    <details className="group rounded-md border border-line-soft bg-panel open:bg-panel-2">
      <summary className="cursor-pointer list-none px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="text-base text-dim transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          <span className="font-mono text-base tracking-wider text-dim">Thinking</span>
        </span>
      </summary>
      <div className="border-t border-line-soft px-3 py-2 text-base leading-relaxed text-body whitespace-pre-wrap">
        {text}
      </div>
    </details>
  )
}
