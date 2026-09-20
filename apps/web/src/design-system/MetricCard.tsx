import React, { ComponentPropsWithoutRef, ReactNode } from "react"

type MetricAccent = "lime" | "violet"

type MetricCardProps = {
  accent?: MetricAccent
  children: ReactNode
} & ComponentPropsWithoutRef<"article">

const accentClasses: Record<MetricAccent, string> = {
  lime: "after:bg-lime/5",
  violet: "after:bg-violet/6",
}

export const MetricCard: React.FC<MetricCardProps> = ({
  accent,
  children,
  className = "",
  ...props
}) => {
  const accentClass = accent
    ? `relative overflow-hidden after:pointer-events-none after:absolute after:-right-6 after:-bottom-11 after:size-27.5 after:rounded-full after:blur-2xl ${accentClasses[accent]}`
    : ""

  return (
    <article
      className={`min-h-39 rounded-lg border border-line-soft bg-linear-to-br from-surface to-metric-to px-4 pt-4 pb-3.5 ${accentClass} ${className}`}
      {...props}
    >
      {children}
    </article>
  )
}
