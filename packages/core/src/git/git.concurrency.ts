export const mapWithConcurrency = async <T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  if (items.length === 0) {
    return []
  }
  const results: R[] = []
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) {
        return
      }
      const item = items[index]
      if (item !== undefined) {
        results[index] = await fn(item, index)
      }
    }
  })
  await Promise.all(workers)
  return results
}
