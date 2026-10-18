import os from "node:os"

export type NetworkInterfaceAddress = Readonly<{
  address: string
  family: string | number
  internal: boolean
}>

export type NetworkInterfaces = Readonly<
  Record<string, ReadonlyArray<NetworkInterfaceAddress> | undefined>
>

const isIpv4 = (entry: NetworkInterfaceAddress): boolean =>
  entry.family === "IPv4" || entry.family === 4

const isLinkLocalIpv4 = (address: string): boolean => address.startsWith("169.254.")

const isVirtualInterface = (name: string): boolean =>
  /^(docker|br-|veth|virbr|tailscale|tun|tap)/.test(name)

/**
 * Picks one IPv4 address a phone on the same network can dial. Physical
 * interfaces win over container and VPN bridges; the first usable address is
 * used when there is nothing better.
 */
export const selectLanAddress = (interfaces: NetworkInterfaces): string | null => {
  const candidates = Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((entry) => !entry.internal && isIpv4(entry) && !isLinkLocalIpv4(entry.address))
      .map((entry) => ({ name, address: entry.address })),
  )

  return (
    candidates.find((candidate) => !isVirtualInterface(candidate.name))?.address ??
    candidates[0]?.address ??
    null
  )
}

export const detectLanAddress = (): string | null => selectLanAddress(os.networkInterfaces())
