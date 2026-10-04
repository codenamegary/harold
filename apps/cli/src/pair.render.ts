import { CreatePairingCodeResponse } from "contracts/http/pairing-code"

export type PairingColors = Readonly<{
  bold: (text: string) => string
  dim: (text: string) => string
}>

export type RenderPairingSummaryInput = Readonly<{
  code: string
  endpoint: string
  expiresAt: string
  colors: PairingColors
}>

export const renderPairingSummary = (input: RenderPairingSummaryInput): string => {
  const rows: Array<[string, string]> = [
    ["code", input.colors.bold(input.code)],
    ["endpoint", input.endpoint],
    ["expires", input.expiresAt],
  ]
  const labelWidth = Math.max(...rows.map(([label]) => label.length))

  return [
    "Pairing code issued. Scan the QR with the Harold app,",
    `or ${input.colors.dim("type the code in manually")}.`,
    "",
    ...rows.map(([label, value]) => `  ${label.padEnd(labelWidth)}  ${value}`),
  ].join("\n")
}

export const renderPairingJson = (params: {
  pairing: CreatePairingCodeResponse
  qrUri: string
}): string =>
  JSON.stringify(
    {
      id: params.pairing.id,
      code: params.pairing.code,
      endpoint: params.pairing.endpoint,
      state: params.pairing.state,
      createdAt: params.pairing.createdAt,
      expiresAt: params.pairing.expiresAt,
      qrUri: params.qrUri,
    },
    null,
    2,
  )
