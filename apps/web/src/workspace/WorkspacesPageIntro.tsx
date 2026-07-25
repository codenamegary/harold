import React from "react"
import { Button } from "../design-system/Button"
import { SectionKicker } from "../design-system/SectionKicker"

export const WorkspacesPageIntro: React.FC = () => (
  <div className="mb-[25px] flex items-end justify-between max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-[17px]">
    <div>
      <SectionKicker>PROJECTS & AGENTS</SectionKicker>
      <h1 className="m-0 text-[clamp(24px,3vw,32px)] leading-[1.15] font-semibold tracking-[-0.04em]">
        Workspaces
      </h1>
      <p className="mt-[9px] mb-0 text-[12px] text-muted">
        Control which projects and agents are exposed through ACP.
      </p>
    </div>
    <Button disabled>+ Add workspace</Button>
  </div>
)
