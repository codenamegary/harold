import { lookup } from "node:dns/promises"
import https from "node:https"
import { connect } from "node:net"
import tls from "node:tls"
import { DEVICES_PATH } from "contracts/http/device"
import {
  ConnectionCheckResult,
  ConnectionTestResponse,
} from "contracts/http/connection-test"
import { DeviceService } from "../device/service"
import { RuntimeSettingsRepository } from "../runtime-settings/repository"
import { computeConnectionGates, isSelfSignedTlsError } from "./compute.connection.gates"
import { parseAdvertisedEndpoint } from "./parse.advertised.endpoint"

const TCP_TIMEOUT_MS = 5_000
const TLS_TIMEOUT_MS = 10_000
const FETCH_TIMEOUT_MS = 10_000

export type ConnectionTestError =
  | { kind: "missing_advertised_url" }
  | { kind: "probe_device_failed" }

export type ConnectionTestResult =
  | { ok: true; value: ConnectionTestResponse }
  | { ok: false; error: ConnectionTestError }

export type ConnectionTestDeps = {
  lookupHost?: typeof lookup
  connectTcp?: (params: { host: string; port: number }) => Promise<void>
  verifyTls?: (params: {
    hostname: string
    port: number
    allowSelfSigned: boolean
  }) => Promise<ConnectionCheckResult>
  fetchDeviceAuth?: (params: {
    url: string
    credential: string
    allowSelfSignedTls: boolean
  }) => Promise<ConnectionCheckResult>
}

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

const defaultConnectTcp = (params: { host: string; port: number }): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = connect({ host: params.host, port: params.port })
    socket.setTimeout(TCP_TIMEOUT_MS)

    socket.once("connect", () => {
      socket.destroy()
      resolve()
    })

    socket.once("timeout", () => {
      socket.destroy()
      reject(new Error("TCP connection timed out"))
    })

    socket.once("error", (error) => {
      socket.destroy()
      reject(error)
    })
  })

const defaultVerifyTls = (params: {
  hostname: string
  port: number
  allowSelfSigned: boolean
}): Promise<ConnectionCheckResult> =>
  new Promise((resolve) => {
    const socket = tls.connect({
      host: params.hostname,
      port: params.port,
      servername: params.hostname,
      rejectUnauthorized: !params.allowSelfSigned,
    })

    const finish = (result: ConnectionCheckResult) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(TLS_TIMEOUT_MS, () => {
      finish({
        id: "tls",
        status: "fail",
        message: "TLS handshake timed out",
      })
    })

    socket.once("secureConnect", () => {
      finish({
        id: "tls",
        status: "pass",
        message: `TLS certificate is valid for ${params.hostname}`,
      })
    })

    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (!params.allowSelfSigned && isSelfSignedTlsError(error)) {
        finish({
          id: "tls",
          status: "warn",
          message:
            "Certificate is self-signed or not from a trusted authority. Use a valid certificate or continue anyway.",
        })
        return
      }

      finish({
        id: "tls",
        status: "fail",
        message: error.message.length > 0 ? error.message : "TLS handshake failed",
      })
    })
  })

const defaultFetchDeviceAuth = (params: {
  url: string
  credential: string
  allowSelfSignedTls: boolean
}): Promise<ConnectionCheckResult> => {
  const target = new URL(params.url)

  return new Promise((resolve) => {
    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port.length > 0 ? Number(target.port) : 443,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: {
          authorization: `Bearer ${params.credential}`,
        },
        servername: target.hostname,
        rejectUnauthorized: !params.allowSelfSignedTls,
      },
      (response) => {
        response.resume()

        if (response.statusCode === 401 || response.statusCode === 403) {
          resolve({
            id: "device-auth",
            status: "fail",
            message: "Device authentication failed through the advertised URL",
          })
          return
        }

        if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
          resolve({
            id: "device-auth",
            status: "fail",
            message: `Advertised URL returned HTTP ${response.statusCode ?? "unknown"}`,
          })
          return
        }

        resolve({
          id: "device-auth",
          status: "pass",
          message: "Bearer authentication succeeded through the advertised URL",
        })
      },
    )

    request.setTimeout(FETCH_TIMEOUT_MS, () => {
      request.destroy(new Error("Device authentication request timed out"))
    })

    request.on("error", (error) => {
      resolve({
        id: "device-auth",
        status: "fail",
        message: error.message.length > 0 ? error.message : "Device authentication request failed",
      })
    })

    request.end()
  })
}

const runDnsCheck = async (params: {
  hostname: string
  port: number
  lookupHost: typeof lookup
  connectTcp: (params: { host: string; port: number }) => Promise<void>
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

export const createConnectionTestService = (context: {
  runtimeSettingsRepository: RuntimeSettingsRepository
  deviceService: DeviceService
  deps?: ConnectionTestDeps
}) => {
  const lookupHost = context.deps?.lookupHost ?? lookup
  const connectTcp = context.deps?.connectTcp ?? defaultConnectTcp
  const verifyTls = context.deps?.verifyTls ?? defaultVerifyTls
  const fetchDeviceAuth = context.deps?.fetchDeviceAuth ?? defaultFetchDeviceAuth

  const run = async (): Promise<ConnectionTestResult> => {
    const advertisedUrl = context.runtimeSettingsRepository.get().advertisedUrl
    if (advertisedUrl === null) {
      return { ok: false, error: { kind: "missing_advertised_url" } }
    }

    const { hostname, port } = parseAdvertisedEndpoint(advertisedUrl)
    const checkedAt = new Date().toISOString()

    const dns = await runDnsCheck({
      hostname,
      port,
      lookupHost,
      connectTcp,
    })

    const tls =
      dns.status === "pass"
        ? await verifyTls({ hostname, port, allowSelfSigned: false })
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
      const probe = context.deviceService.createProbeDevice()
      if (!probe.ok) {
        return { ok: false, error: { kind: "probe_device_failed" } }
      }

      const devicesUrl = new URL(DEVICES_PATH, advertisedUrl).toString()

      try {
        deviceAuth = await fetchDeviceAuth({
          url: devicesUrl,
          credential: probe.value.credential,
          allowSelfSignedTls: tls.status === "warn",
        })
      } finally {
        context.deviceService.revoke({ deviceId: probe.value.device.id })
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

  return { run }
}

export type ConnectionTestService = ReturnType<typeof createConnectionTestService>
