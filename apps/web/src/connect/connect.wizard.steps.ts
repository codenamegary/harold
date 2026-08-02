export type ConnectWizardStep = {
  id: number
  number: string
  title: string
  subtitle: string
}

export const connectWizardSteps: readonly ConnectWizardStep[] = [
  { id: 1, number: "01", title: "Access mode", subtitle: "Choose your network" },
  { id: 2, number: "02", title: "External URL", subtitle: "Set the endpoint" },
  { id: 3, number: "03", title: "Test connection", subtitle: "Verify access" },
  { id: 4, number: "04", title: "Pair device", subtitle: "Connect device" },
]
