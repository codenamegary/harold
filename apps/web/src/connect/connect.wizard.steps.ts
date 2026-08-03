export type CloudWizardStepId = "external" | "test" | "pair"

export type CloudWizardStep = {
  id: CloudWizardStepId
  number: string
  title: string
  subtitle: string
}

export const cloudWizardSteps: readonly CloudWizardStep[] = [
  { id: "external", number: "01", title: "External URL", subtitle: "Set the endpoint" },
  { id: "test", number: "02", title: "Test connection", subtitle: "Verify access" },
  { id: "pair", number: "03", title: "Pair device", subtitle: "Connect device" },
]

export const cloudWizardStepIndex = (step: CloudWizardStepId): number =>
  cloudWizardSteps.findIndex((entry) => entry.id === step)

export type WizardView =
  | { kind: "mode" }
  | { kind: "local-pair" }
  | { kind: "cloud"; step: CloudWizardStepId }

export const hostFromAdvertisedUrl = (advertisedUrl: string | null): string => {
  if (advertisedUrl === null) {
    return ""
  }

  return advertisedUrl.replace(/^https:\/\//, "")
}

export const advertisedUrlFromHost = (host: string): string =>
  `https://${host.trim()}`
