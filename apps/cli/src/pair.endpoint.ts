import { isLoopbackHostname } from "contracts/http/runtime-settings"
import {
  AdvertisedEndpointEntry,
  AdvertisedEndpointSource,
} from "core/network/advertised.endpoints"
import { ReachabilityFailure } from "core/reachability/models"
import { VerifyAdvertisedEndpoint } from "core/reachability/verify.usecase"

export type EndpointPromptPort = Readonly<{
  select: (
    message: string,
    options: ReadonlyArray<{ value: string; label: string; hint?: string }>,
    initialValue?: string,
  ) => Promise<string | symbol>
  text: (message: string, placeholder?: string) => Promise<string | symbol>
  isCancel: (value: unknown) => value is symbol
}>

export type ResolvePairingEndpointDeps = Readonly<{
  explicitUrl: string | undefined
  readHistory: () => ReadonlyArray<AdvertisedEndpointEntry>
  listLanAddresses: () => ReadonlyArray<{ name: string; address: string }>
  port: number
  verifyEndpoint: VerifyAdvertisedEndpoint
  isInteractive: boolean
  prompts?: EndpointPromptPort
  writeLine: (line: string) => void
}>

export type EndpointChoice =
  | { ok: true; url: string; source: AdvertisedEndpointSource }
  | { ok: false; message: string }

type Candidate = Readonly<{ url: string; source: AdvertisedEndpointSource; hint: string }>

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

const detectedCandidates = (deps: ResolvePairingEndpointDeps): ReadonlyArray<Candidate> =>
  deps
    .listLanAddresses()
    .map(({ name, address }) => ({
      url: `http://${address}:${deps.port}`,
      source: "detected" as const,
      hint: name,
    }))
    .filter((candidate) => !isLoopbackUrl(candidate.url))

const buildCandidates = (deps: ResolvePairingEndpointDeps): ReadonlyArray<Candidate> =>
  [
    ...deps.readHistory().map((item) => ({
      url: item.url,
      source: item.source,
      hint: item.source,
    })),
    ...detectedCandidates(deps),
  ].filter((candidate, index, all) => all.findIndex((item) => item.url === candidate.url) === index)

const probeAll = async (
  deps: ResolvePairingEndpointDeps,
  candidates: ReadonlyArray<Candidate>,
): Promise<Map<string, ReachabilityFailure | null>> => {
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const result = await deps.verifyEndpoint(candidate.url)
      return [candidate.url, result.ok ? null : result.error] as const
    }),
  )
  return new Map(results)
}

const promptOnce = async (
  deps: ResolvePairingEndpointDeps,
  candidates: ReadonlyArray<Candidate>,
  failures: Map<string, ReachabilityFailure | null>,
): Promise<string | symbol> => {
  const prompts = deps.prompts
  if (prompts === undefined) {
    return Symbol("cancelled")
  }

  return prompts.select(
    "Which endpoint should the QR code advertise?",
    [
      ...candidates.map((candidate) => {
        const failure = failures.get(candidate.url)
        const reachability = failure === undefined ? "" : failure === null ? "" : " · unreachable"
        return {
          value: candidate.url,
          label: candidate.url,
          hint: `${candidate.hint}${reachability}`,
        }
      }),
      { value: customOptionValue, label: "Enter a custom URL" },
    ],
    candidates[0]?.url,
  )
}

/**
 * Resolves the endpoint a pairing code advertises, in order:
 *
 * 1. An explicit URL wins and is probed once; no fallback.
 * 2. Non-interactive runs probe history (most recently used first) and then
 *    every interface address, taking the first reachable candidate and
 *    failing with the probed list when nothing answers.
 * 3. Interactive runs list every candidate immediately — remembered
 *    endpoints first, then this machine's interface addresses — most
 *    recently used first and preselected. Each option is labelled with its
 *    probe result. Picking an unreachable endpoint explains the failure and
 *    reopens the list, so the choice is always a working endpoint.
 * 4. The custom URL option verifies the entered endpoint the same way.
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

  const candidates = buildCandidates(deps)

  if (!deps.isInteractive || deps.prompts === undefined) {
    const unreachable: Array<{ url: string; failure: ReachabilityFailure }> = []
    for (const candidate of candidates) {
      const result = await deps.verifyEndpoint(candidate.url)
      if (result.ok) {
        return { ok: true, url: candidate.url, source: candidate.source }
      }
      unreachable.push({ url: candidate.url, failure: result.error })
    }

    const probed = unreachable
      .map((item) => `  ${item.url}: ${describeFailure(item.failure)}`)
      .join("\n")
    return {
      ok: false,
      message: `No reachable endpoint found. Probed:\n${probed}\nPass --url <endpoint> to choose one.`,
    }
  }

  const prompts = deps.prompts

  if (candidates.length === 0) {
    const choice = await promptForCustomUrl(deps)
    if (choice.kind === "ok") {
      return { ok: true, url: choice.url, source: choice.source }
    }
    return { ok: false, message: "Pairing cancelled." }
  }

  for (;;) {
    const failures = await probeAll(deps, candidates)

    const selected = await promptOnce(deps, candidates, failures)
    if (prompts.isCancel(selected)) {
      return { ok: false, message: "Pairing cancelled." }
    }
    if (selected === customOptionValue) {
      const choice = await promptForCustomUrl(deps)
      if (choice.kind === "ok") {
        return { ok: true, url: choice.url, source: choice.source }
      }
      if (choice.kind === "cancel") {
        return { ok: false, message: "Pairing cancelled." }
      }
      deps.writeLine(choice.message)
      continue
    }

    const failure = failures.get(selected)
    if (failure === null || failure === undefined) {
      const chosen = candidates.find((candidate) => candidate.url === selected)
      if (chosen !== undefined) {
        return { ok: true, url: chosen.url, source: chosen.source }
      }
    }

    const detail = failure === null || failure === undefined ? "" : describeFailure(failure)
    deps.writeLine(`${selected} is not reachable${detail === "" ? "" : `: ${detail}`}.`)
    deps.writeLine("Is the daemon running? Start it with `harold start`, then pick again.")
  }
}

type CustomUrlChoice =
  | { kind: "ok"; url: string; source: AdvertisedEndpointSource }
  | { kind: "cancel" }
  | { kind: "unreachable"; message: string }

const promptForCustomUrl = async (deps: ResolvePairingEndpointDeps): Promise<CustomUrlChoice> => {
  const prompts = deps.prompts
  if (prompts === undefined) {
    return { kind: "cancel" }
  }

  const entered = await prompts.text(
    "Endpoint URL for the QR code",
    `http://192.168.1.10:${deps.port} or https://harold.example.com`,
  )
  if (prompts.isCancel(entered)) {
    return { kind: "cancel" }
  }

  const trimmed = entered.trim()
  if (trimmed === "") {
    return { kind: "cancel" }
  }

  const result = await deps.verifyEndpoint(trimmed)
  if (result.ok) {
    return { kind: "ok", url: trimmed, source: "manual" }
  }

  return {
    kind: "unreachable",
    message: `${trimmed} is not reachable: ${describeFailure(result.error)}`,
  }
}
