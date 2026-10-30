import {
  AdvertisedEndpointEntry,
  AdvertisedEndpointSource,
} from "core/network/advertised.endpoints"
import { ReachabilityFailure } from "core/reachability/models"
import { VerifyAdvertisedEndpoint } from "core/reachability/verify.usecase"
import { isLoopbackHostname } from "contracts/http/runtime-settings"

export type EndpointPromptPort = Readonly<{
  select: (
    message: string,
    options: ReadonlyArray<{ value: string; label: string; hint?: string }>,
    initialValue?: string,
  ) => Promise<string | symbol>
  text: (message: string, placeholder?: string) => Promise<string | symbol>
  isCancel: (value: unknown) => boolean
}>

export type ResolvePairingEndpointDeps = Readonly<{
  explicitUrl: string | undefined
  readHistory: () => ReadonlyArray<AdvertisedEndpointEntry>
  detectLanAddress: () => string | null
  port: number
  verifyEndpoint: VerifyAdvertisedEndpoint
  isInteractive: boolean
  prompts?: EndpointPromptPort
  writeLine: (line: string) => void
}>

export type EndpointChoice =
  | { ok: true; url: string; source: AdvertisedEndpointSource }
  | { ok: false; message: string }

type Candidate = Readonly<{ url: string; source: AdvertisedEndpointSource }>

const customOptionValue = "__custom__"

const describeFailure = (error: ReachabilityFailure): string => {
  switch (error.kind) {
    case "invalid_scheme":
      return `invalid URL (${error.detail})`
    case "unreachable":
      return `unreachable (${error.detail})`
    case "non_2xx":
      return `GET /v1/status answered HTTP ${error.status}`
  }
}

const isLoopbackUrl = (url: string): boolean => {
  try {
    return isLoopbackHostname(new URL(url).hostname.replace(/^\[|\]$/g, ""))
  } catch {
    return false
  }
}

const detectedCandidates = (deps: ResolvePairingEndpointDeps): ReadonlyArray<Candidate> => {
  const address = deps.detectLanAddress()
  if (address === null) {
    return []
  }
  const url = `http://${address}:${deps.port}`
  // A loopback QR is unreachable from a phone. Loopback endpoints exist only
  // as explicit choices for host-side testing.
  if (isLoopbackUrl(url)) {
    return []
  }
  return [{ url, source: "detected" }]
}

const promptForCustomUrl = async (deps: ResolvePairingEndpointDeps): Promise<EndpointChoice> => {
  const prompts = deps.prompts
  if (prompts === undefined) {
    return { ok: false, message: "Pairing cancelled." }
  }

  for (;;) {
    const entered = await prompts.text(
      "Endpoint URL for the QR code",
      `http://${deps.detectLanAddress() ?? "192.168.1.10"}:${deps.port} or https://harold.example.com`,
    )
    if (prompts.isCancel(entered)) {
      return { ok: false, message: "Pairing cancelled." }
    }

    const url = entered
    if (typeof url === "symbol" || prompts.isCancel(url)) {
      return { ok: false, message: "Pairing cancelled." }
    }

    const trimmed = url.trim()
    if (trimmed === "") {
      return { ok: false, message: "Pairing cancelled." }
    }

    const result = await deps.verifyEndpoint(trimmed)
    if (result.ok) {
      return { ok: true, url: trimmed, source: "manual" }
    }

    deps.writeLine(`${trimmed} is not reachable: ${describeFailure(result.error)}`)
  }
}

/**
 * Resolves the endpoint a pairing code advertises, in order:
 *
 * 1. An explicit URL wins and is probed once; no fallback.
 * 2. History entries, most recently used first, then fresh interface
 *    detection. Each candidate is probed with `GET /v1/status`; the first
 *    reachable one wins.
 * 3. Interactive runs prompt when more than one candidate is reachable, and
 *    when nothing is reachable they fall back to a custom URL prompt.
 * 4. Non-interactive runs are deterministic and fail with the candidate list
 *    when nothing is reachable.
 */
export const resolvePairingEndpoint = async (
  deps: ResolvePairingEndpointDeps,
): Promise<EndpointChoice> => {
  if (deps.explicitUrl !== undefined) {
    const result = await deps.verifyEndpoint(deps.explicitUrl)
    if (!result.ok) {
      return {
        ok: false,
        message: `${deps.explicitUrl} is not reachable: ${describeFailure(result.error)}`,
      }
    }
    return { ok: true, url: deps.explicitUrl, source: "manual" }
  }

  const historyCandidates: ReadonlyArray<Candidate> = deps
    .readHistory()
    .map((item) => ({ url: item.url, source: item.source }))

  const candidates: ReadonlyArray<Candidate> = [
    ...historyCandidates,
    ...detectedCandidates(deps),
  ].filter((candidate, index, all) => all.findIndex((item) => item.url === candidate.url) === index)

  const reachable: Array<{ candidate: Candidate; failure?: ReachabilityFailure }> = []
  const unreachable: Array<{ url: string; failure: ReachabilityFailure }> = []
  for (const candidate of candidates) {
    const result = await deps.verifyEndpoint(candidate.url)
    if (result.ok) {
      reachable.push({ candidate })
    } else {
      unreachable.push({ url: candidate.url, failure: result.error })
    }
  }

  if (reachable.length === 0) {
    if (deps.isInteractive && deps.prompts !== undefined) {
      return promptForCustomUrl(deps)
    }

    const probed = unreachable
      .map((item) => `  ${item.url}: ${describeFailure(item.failure)}`)
      .join("\n")
    return {
      ok: false,
      message: `No reachable endpoint found. Probed:\n${probed}\nPass --url <endpoint> to choose one.`,
    }
  }

  if (reachable.length > 1 && deps.isInteractive && deps.prompts !== undefined) {
    const selected = await deps.prompts.select(
      "Which endpoint should the QR code advertise?",
      [
        ...reachable.map((item) => ({
          value: item.candidate.url,
          label: item.candidate.url,
          hint: item.candidate.source,
        })),
        { value: customOptionValue, label: "Enter a custom URL" },
      ],
      reachable[0]?.candidate.url,
    )

    if (deps.prompts.isCancel(selected)) {
      return { ok: false, message: "Pairing cancelled." }
    }
    if (selected === customOptionValue) {
      return promptForCustomUrl(deps)
    }
    const chosen = reachable.find((item) => item.candidate.url === selected)
    if (chosen !== undefined) {
      return { ok: true, url: chosen.candidate.url, source: chosen.candidate.source }
    }
  }

  const first = reachable[0]
  if (first === undefined) {
    return { ok: false, message: "No reachable endpoint found." }
  }
  return { ok: true, url: first.candidate.url, source: first.candidate.source }
}
