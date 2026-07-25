import React from "react"
import { Button } from "../design-system/Button"
import { SectionKicker } from "../design-system/SectionKicker"

export const DevicePageIntro: React.FC = () => (
  <div className="mb-[25px] flex items-end justify-between max-[820px]:flex-col max-[820px]:items-start max-[820px]:gap-[17px]">
    <div>
      <SectionKicker>ACCESS CONTROL</SectionKicker>
      <h2 className="m-0 text-[clamp(24px,3vw,32px)] leading-[1.15] font-semibold tracking-[-0.04em]">
        Paired devices
      </h2>
      <p className="mt-[9px] mb-0 text-xs text-muted">
        Review sessions and revoke access instantly.
      </p>
    </div>
    <Button disabled>+ Pair new device</Button>
  </div>
)
