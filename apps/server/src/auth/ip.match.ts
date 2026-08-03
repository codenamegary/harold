import { isIpv4Address, isIpv6Address } from "contracts/http/runtime-settings"

export type ParsedIpv4 = {
  kind: "ipv4"
  value: number
}

export type ParsedIpv6 = {
  kind: "ipv6"
  bytes: Uint8Array
}

export type ParsedIp = ParsedIpv4 | ParsedIpv6

export const parseIpv4 = (value: string): ParsedIpv4 | undefined => {
  if (!isIpv4Address(value)) {
    return undefined
  }

  const parts = value.split(".")
  let parsed = 0
  for (const part of parts) {
    parsed = (parsed << 8) | Number(part)
  }

  return { kind: "ipv4", value: parsed >>> 0 }
}

const parseIpv6Hextet = (value: string): number | undefined => {
  if (!/^[0-9a-fA-F]{1,4}$/.test(value)) {
    return undefined
  }

  return Number.parseInt(value, 16)
}

const parseIpv4MappedTail = (value: string): number | undefined => {
  const ipv4 = parseIpv4(value)
  return ipv4?.value
}

export const expandIpv6Hextets = (value: string): number[] | undefined => {
  const bare = value.includes("%") ? value.slice(0, value.indexOf("%")) : value
  if (!isIpv6Address(bare)) {
    return undefined
  }

  const [head, tail] = bare.split("::")
  const headParts = head.length === 0 ? [] : head.split(":")
  const tailParts = tail === undefined ? [] : tail.length === 0 ? [] : tail.split(":")

  const expanded: number[] = []
  for (const part of headParts) {
    if (part.includes(".")) {
      const mapped = parseIpv4MappedTail(part)
      if (mapped === undefined) {
        return undefined
      }
      expanded.push((mapped >>> 16) & 0xffff, mapped & 0xffff)
      continue
    }

    const hextet = parseIpv6Hextet(part)
    if (hextet === undefined) {
      return undefined
    }
    expanded.push(hextet)
  }

  const tailExpanded: number[] = []
  for (const part of tailParts) {
    if (part.includes(".")) {
      const mapped = parseIpv4MappedTail(part)
      if (mapped === undefined) {
        return undefined
      }
      tailExpanded.push((mapped >>> 16) & 0xffff, mapped & 0xffff)
      continue
    }

    const hextet = parseIpv6Hextet(part)
    if (hextet === undefined) {
      return undefined
    }
    tailExpanded.push(hextet)
  }

  const missing = 8 - expanded.length - tailExpanded.length
  if (missing < 0) {
    return undefined
  }

  return [...expanded, ...Array.from({ length: missing }, () => 0), ...tailExpanded]
}

export const parseIpv6 = (value: string): ParsedIpv6 | undefined => {
  const hextets = expandIpv6Hextets(value)
  if (hextets === undefined || hextets.length !== 8) {
    return undefined
  }

  const bytes = new Uint8Array(16)
  for (const [index, hextet] of hextets.entries()) {
    bytes[index * 2] = (hextet >>> 8) & 0xff
    bytes[index * 2 + 1] = hextet & 0xff
  }

  return { kind: "ipv6", bytes }
}

export const parseIp = (value: string): ParsedIp | undefined => {
  if (value.startsWith("::ffff:")) {
    return parseIpv4(value.slice("::ffff:".length))
  }

  if (isIpv4Address(value)) {
    return parseIpv4(value)
  }

  return parseIpv6(value)
}

const ipv4InCidr = (ip: number, network: number, prefix: number): boolean => {
  if (prefix === 0) {
    return true
  }

  const mask = prefix === 32 ? 0xffff_ffff : (~0 << (32 - prefix)) >>> 0
  return (ip & mask) === (network & mask)
}

const ipv6InCidr = (ip: Uint8Array, network: Uint8Array, prefix: number): boolean => {
  if (prefix === 0) {
    return true
  }

  const fullBytes = Math.floor(prefix / 8)
  for (let index = 0; index < fullBytes; index += 1) {
    if (ip[index] !== network[index]) {
      return false
    }
  }

  const remainingBits = prefix % 8
  if (remainingBits === 0) {
    return true
  }

  const mask = (~0 << (8 - remainingBits)) & 0xff
  return (ip[fullBytes] & mask) === (network[fullBytes] & mask)
}

export const ipMatchesEntry = (peer: ParsedIp, entry: string): boolean => {
  const slash = entry.lastIndexOf("/")
  if (slash === -1) {
    const allowed = parseIp(entry)
    if (allowed === undefined) {
      return false
    }

    if (peer.kind === "ipv4" && allowed.kind === "ipv4") {
      return peer.value === allowed.value
    }

    if (peer.kind === "ipv6" && allowed.kind === "ipv6") {
      return peer.bytes.every((byte, index) => byte === allowed.bytes[index])
    }

    return false
  }

  const networkText = entry.slice(0, slash)
  const prefix = Number(entry.slice(slash + 1))
  const network = parseIp(networkText)
  if (network === undefined || !Number.isInteger(prefix)) {
    return false
  }

  if (peer.kind === "ipv4" && network.kind === "ipv4") {
    return ipv4InCidr(peer.value, network.value, prefix)
  }

  if (peer.kind === "ipv6" && network.kind === "ipv6") {
    return ipv6InCidr(peer.bytes, network.bytes, prefix)
  }

  return false
}

export const ipMatchesAllowlist = (peerText: string, allowlist: readonly string[]): boolean => {
  const peer = parseIp(peerText)
  if (peer === undefined) {
    return false
  }

  return allowlist.some((entry) => ipMatchesEntry(peer, entry))
}
