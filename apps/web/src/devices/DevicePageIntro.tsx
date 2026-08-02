import React from "react"
import { useNavigate } from "react-router"
import { Button } from "../design-system/Button"
import { PageIntro } from "../shell/PageIntro"

export const DevicePageIntro: React.FC = () => {
  const navigate = useNavigate()

  return (
    <PageIntro
      description="Review paired devices and revoke access instantly."
      action={<Button onClick={() => void navigate("/connect?step=pair")}>+ Pair new device</Button>}
    />
  )
}
