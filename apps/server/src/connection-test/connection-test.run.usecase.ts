import { DEVICES_PATH } from "contracts/http/device"
import { ConnectionCheckResult, ConnectionTestResponse } from "contracts/http/connection-test"
import { computeConnectionGates } from "./connection-test.compute.connection.gates"
import { parseAdvertisedEndpoint } from "./connection-test.parse.advertised.endpoint"
import {
  ConnectTcp,
  DeviceProvisioningPort,
  FetchDeviceAuth,
  GetAdvertisedUrl,
  LookupHost,
  VerifyTls,
} from "./connection-test.ports"

const TCP_TIMEOUT_MS = 5_000

export type ConnectionTestError =
  | { kind: "missing_advertised_url" }
  | { kind: "probe_device_failed" }

export type ConnectionTestResult =
  | { ok: true; value: ConnectionTestResponse }
  | { ok: false; error: ConnectionTestError }

export type RunConnectionTestDeps = Readonly<{
  getAdvertisedUrl: GetAdvertisedUrl
  deviceProvisioning: DeviceProvisioningPort
  lookupHost: LookupHost
  connectTcp: ConnectTcp
  verifyTls: VerifyTls
  fetchDeviceAuth: FetchDeviceAuth
}>

export type RunConnectionTest = () => Promise<ConnectionTestResult>

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

const runDnsCheck = async (params: {
  hostname: string
  port: number
  lookupHost: LookupHost
  connectTcp: ConnectTcp
}): Promise<ConnectionCheckResult> => {
  try {
    const records = await withTimeout(
      params.lookupHost(params.hostname, { all: true }),
      TCP_TIMEOUT_MS,
      "DNS lookup",
    )

    if (records.length === 0) {
      return {
        id: "dns",
        status: "fail",
        message: `No DNS records found for ${params.hostname}`,
      }
    }

    const firstAddress = records[0]?.address
    if (firstAddress === undefined) {
      return {
        id: "dns",
        status: "fail",
        message: `No DNS records found for ${params.hostname}`,
      }
    }

    await withTimeout(
      params.connectTcp({ host: firstAddress, port: params.port }),
      TCP_TIMEOUT_MS,
      "TCP connection",
    )

    return {
      id: "dns",
      status: "pass",
      message: `Resolved ${params.hostname} and reached port ${params.port}`,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : `Could not reach ${params.hostname}:${params.port}`

    return {
      id: "dns",
      status: "fail",
      message,
    }
  }
}

export const makeRunConnectionTest =
  (deps: RunConnectionTestDeps): RunConnectionTest =>
  async () => {
    const advertisedUrl = deps.getAdvertisedUrl()
    if (advertisedUrl === null) {
      return { ok: false, error: { kind: "missing_advertised_url" } }
    }

    const { hostname, port } = parseAdvertisedEndpoint(advertisedUrl)
    const checkedAt = new Date().toISOString()

    const dns = await runDnsCheck({
      hostname,
      port,
      lookupHost: deps.lookupHost,
      connectTcp: deps.connectTcp,
    })

    const tls =
      dns.status === "pass"
        ? await deps.verifyTls({ hostname, port, allowSelfSigned: false })
        : {
            id: "tls" as const,
            status: "fail" as const,
            message: "Skipped because DNS and reachability failed",
          }

    let deviceAuth: ConnectionCheckResult = {
      id: "device-auth",
      status: "fail",
      message: "Skipped because earlier checks failed",
    }

    if (dns.status === "pass" && (tls.status === "pass" || tls.status === "warn")) {
      const probe = deps.deviceProvisioning.createProbeDevice()
      if (!probe.ok) {
        return { ok: false, error: { kind: "probe_device_failed" } }
      }

      const devicesUrl = new URL(DEVICES_PATH, advertisedUrl).toString()

      try {
        deviceAuth = await deps.fetchDeviceAuth({
          url: devicesUrl,
          credential: probe.value.credential,
          allowSelfSignedTls: tls.status === "warn",
        })
      } finally {
        deps.deviceProvisioning.revokeDevice({ deviceId: probe.value.device.id })
      }
    }

    const checks = [dns, tls, deviceAuth]
    const gates = computeConnectionGates(checks)

    return {
      ok: true,
      value: {
        advertisedUrl,
        checkedAt,
        checks,
        canContinue: gates.canContinue,
        canContinueAnyway: gates.canContinueAnyway,
      },
    }
  }
