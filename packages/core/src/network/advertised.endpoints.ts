export type AdvertisedEndpointSource = "detected" | "manual"

export type AdvertisedEndpointEntry = Readonly<{
  url: string
  source: AdvertisedEndpointSource
  lastUsedAt: string
}>

const maxEntries = 10

/**
 * Records one used endpoint: move an existing URL to the front with refreshed
 * metadata, or prepend a new one. The most recently used entry is always
 * first, which is what the pair flow defaults to. History is capped so a long
 * tail of DHCP addresses cannot grow the file forever.
 */
export const recordAdvertisedEndpoint = (
  history: ReadonlyArray<AdvertisedEndpointEntry>,
  used: AdvertisedEndpointEntry,
): ReadonlyArray<AdvertisedEndpointEntry> => {
  const rest = history.filter((item) => item.url !== used.url)
  return [used, ...rest].slice(0, maxEntries)
}
