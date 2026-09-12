import React from "react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"

type MarkdownMessageProps = {
  text: string
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ text }) => {
  return (
    <div className="markdown-message text-base leading-relaxed text-body">
      <Streamdown controls={false} linkSafety={{ enabled: false }}>
        {text}
      </Streamdown>
    </div>
  )
}
