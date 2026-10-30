import os from "node:os"

export type NetworkInterfaceAddress = Readonly<{
  address: string
  family: string | number
  internal: boolean
}>

export type NetworkInterfaces = Readonly<
  Record<string, ReadonlyArray<NetworkInterfaceAddress> | undefined>
>

export const isIpv4Entry = (entry: NetworkInterfaceAddress): boolean =>
  entry.family === "IPv4" || entry.family === 4

const isLinkLocalIpv4 = (address: string): boolean => address.startsWith("169.254.")

export const isVirtualInterface = (name: string): boolean =>
  /^(docker|br-|veth|virbr|tailscale|tun|tap)/.test(name)

const usableEntries = (
  interfaces: NetworkInterfaces,
): ReadonlyArray<{ name: string; address: string }> =>
  Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((entry) => !entry.internal && isIpv4Entry(entry) && !isLinkLocalIpv4(entry.address))
      .map((entry) => ({ name, address: entry.address })),
  )

/**
 * Lists every non-internal, non-link-local IPv4 address across interfaces,
 * in interface order. This is the raw candidate pool: the daemon boot gate
 * uses it leniently (any address means the machine is networked), while the
 * pair flow scores it for a phone-dialable LAN endpoint.
 */
export const usableIpv4Addresses = (interfaces: NetworkInterfaces): ReadonlyArray<string> =>
  usableEntries(interfaces).map((candidate) => candidate.address)

/**
 * Same pool as `usableIpv4Addresses`, with the owning interface name so the
 * pair flow can label choices a user is picking between.
 */
export const usableIpv4AddressEntries = (
  interfaces: NetworkInterfaces,
): ReadonlyArray<{ name: string; address: string }> => usableEntries(interfaces)

/**
 * Picks one IPv4 address a phone on the same network can dial. Physical
 * interfaces win over container and VPN bridges; the first usable address is
 * used when there is nothing better.
 */
export const selectLanAddress = (interfaces: NetworkInterfaces): string | null => {
  const candidates = usableEntries(interfaces)

  return (
    candidates.find((candidate) => !isVirtualInterface(candidate.name))?.address ??
    candidates[0]?.address ??
    null
  )
}

/**
 * Boot gate: whether the machine is networked at all. Deliberately lenient —
 * any non-internal, non-link-local IPv4 address counts, including virtual
 * interfaces like Tailscale, because a tailnet phone can pair with a
 * Tailscale-only machine. Strict LAN scoring is a pair-flow concern.
 */
export const hasDialableAddress = (interfaces: NetworkInterfaces): boolean =>
  usableEntries(interfaces).length > 0

export const detectLanAddress = (): string | null => selectLanAddress(os.networkInterfaces())

export const detectNetworkInterfaces = (): NetworkInterfaces => os.networkInterfaces()

/**
 * Every address on this machine a phone could conceivably dial, with the
 * owning interface name. This is what the pair flow lists for selection:
 * detection alone cannot know which network the phone is on.
 */
export const detectUsableIpv4AddressEntries = (): ReadonlyArray<{
  name: string
  address: string
}> => usableIpv4AddressEntries(os.networkInterfaces())
