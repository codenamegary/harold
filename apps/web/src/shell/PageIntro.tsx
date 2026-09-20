import React, { ReactNode } from "react"

type PageIntroProps = {
  description: string
  action?: ReactNode
}

export const PageIntro: React.FC<PageIntroProps> = ({ description, action }) => (
  <div className="mb-6.5 flex items-end justify-between gap-4 max-[820px]:flex-col max-[820px]:items-start">
    <p className="m-0 max-w-2xl text-base text-muted">{description}</p>
    {action}
  </div>
)
