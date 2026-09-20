import https from "node:https"
import { lookup } from "node:dns/promises"
import { connect } from "node:net"
import tls from "node:tls"
import { ConnectionCheckResult } from "contracts/http/connection-test"
import { ConnectTcp, FetchDeviceAuth, LookupHost, VerifyTls } from "./connection-test.ports"

const TCP_TIMEOUT_MS = 5_000
const TLS_TIMEOUT_MS = 10_000
const FETCH_TIMEOUT_MS = 10_000

const SELF_SIGNED_TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
])

const isSelfSignedTlsError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false
  }

  const code = error.code
  return typeof code === "string" && SELF_SIGNED_TLS_CODES.has(code)
}

export const nodeLookupHost: LookupHost = lookup

export const nodeConnectTcp: ConnectTcp = (params) =>
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

export const nodeVerifyTls: VerifyTls = (params) =>
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

export const nodeFetchDeviceAuth: FetchDeviceAuth = (params) => {
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

        if (
          response.statusCode === undefined ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
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
