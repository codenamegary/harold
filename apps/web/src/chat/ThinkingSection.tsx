import React from "react"
import { ThinkingIndicator } from "./ThinkingIndicator"

type ThinkingSectionProps = {
  text: string
  isActive: boolean
}

export const ThinkingSection: React.FC<ThinkingSectionProps> = ({
  text,
  isActive,
}) => {
  return (
    <details className="group rounded-md border border-line-soft bg-[#0d1117] open:bg-[#0f141b]">
      <summary className="cursor-pointer list-none px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="text-sm text-dim transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          {isActive ? (
            <ThinkingIndicator />
          ) : (
            <span className="font-mono text-base tracking-[0.06em] text-dim">
              Thinking
            </span>
          )}
        </span>
      </summary>
      <div className="border-t border-line-soft px-3 py-2 text-sm leading-relaxed text-body whitespace-pre-wrap">
        {text}
      </div>
    </details>
  )
}
