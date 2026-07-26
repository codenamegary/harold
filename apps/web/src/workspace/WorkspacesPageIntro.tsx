import React from "react"
import { Button } from "../design-system/Button"
import { PageIntro } from "../shell/PageIntro"

type WorkspacesPageIntroProps = {
  onAddWorkspace: () => void
}

export const WorkspacesPageIntro: React.FC<WorkspacesPageIntroProps> = ({
  onAddWorkspace,
}) => (
  <PageIntro
    description="Control which projects and agents are exposed through ACP."
    action={<Button onClick={onAddWorkspace}>+ Add workspace</Button>}
  />
)
