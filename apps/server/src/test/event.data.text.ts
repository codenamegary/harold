export const eventDataText = (data: unknown): string => {
  if (typeof data !== "string") {
    throw new Error(`expected string event data, got ${typeof data}`)
  }

  return data
}
