import React from "react"
import { Button } from "../design-system/Button"
import { PageIntro } from "../shell/PageIntro"

export const WorkspacesPageIntro: React.FC = () => (
  <PageIntro
    description="Control which projects and agents are exposed through ACP."
    action={<Button disabled>+ Add workspace</Button>}
  />
)
