import React from "react"
import { Button } from "../design-system/Button"
import { PageIntro } from "../shell/PageIntro"

export const DevicePageIntro: React.FC = () => (
  <PageIntro
    description="Review sessions and revoke access instantly."
    action={<Button disabled>+ Pair new device</Button>}
  />
)
