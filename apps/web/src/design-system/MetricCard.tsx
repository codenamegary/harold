import { ComponentPropsWithoutRef, ReactNode } from "react"

type MetricAccent = "lime" | "violet"

type MetricCardProps = {
  accent?: MetricAccent
  children: ReactNode
} & ComponentPropsWithoutRef<"article">

const accentClasses: Record<MetricAccent, string> = {
  lime: "after:bg-lime/5",
  violet: "after:bg-violet/6",
}

export const MetricCard = ({
  accent,
  children,
  className = "",
  ...props
}: MetricCardProps) => {
  const accentClass = accent ? `relative overflow-hidden after:pointer-events-none after:absolute after:-right-6 after:-bottom-11 after:size-[110px] after:rounded-full after:blur-2xl ${accentClasses[accent]}` : ""

  return (
    <article
      className={`min-h-[155px] rounded-[9px] border border-[#1a1f28] bg-linear-to-br from-[#101319] to-[#0c0f14] px-[17px] pt-4 pb-[13px] ${accentClass} ${className}`}
      {...props}
    >
      {children}
    </article>
  )
}
