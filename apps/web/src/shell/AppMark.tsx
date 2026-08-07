import React from "react"

type AppMarkProps = {
  className?: string
}

export const AppMark: React.FC<AppMarkProps> = ({ className = "size-8" }) => (
  <svg
    aria-hidden
    className={className}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="32" height="32" rx="8" className="fill-lime" />
    <path
      className="fill-lime-ink"
      d="M16 7.2 24.4 12v8.8L16 25.6 7.6 20.8V12L16 7.2zm0 2.35L10.1 12.9v6.9L16 23.2l5.9-3.4v-6.9L16 9.55z"
    />
    <path
      className="fill-lime-ink"
      d="M16 14.2 21.2 17.2v1.7L16 22.05 10.8 18.9v-1.7L16 14.2z"
    />
  </svg>
)
