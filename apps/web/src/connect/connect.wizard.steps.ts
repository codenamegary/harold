export type ConnectWizardStep = {
  id: number
  number: string
  title: string
  subtitle: string
}

export const cloudWizardSteps: readonly ConnectWizardStep[] = [
  { id: 1, number: "01", title: "External URL", subtitle: "Set the endpoint" },
  { id: 2, number: "02", title: "Test connection", subtitle: "Verify access" },
  { id: 3, number: "03", title: "Pair device", subtitle: "Connect device" },
]
