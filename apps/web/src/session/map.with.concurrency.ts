/**
 * Runs `fn` over `items` with at most `concurrency` promises in flight.
 * Results keep input order.
 */
export const mapWithConcurrency = async <T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<ReadonlyArray<R>> => {
  if (items.length === 0) {
    return []
  }

  const limit = Math.max(1, Math.floor(concurrency))
  const results: Array<R | undefined> = Array.from({ length: items.length })
  const cursor = { index: 0 }

  const worker = async (): Promise<void> => {
    const index = cursor.index
    if (index >= items.length) {
      return
    }
    cursor.index = index + 1
    const item = items[index]
    if (item === undefined) {
      return
    }
    results[index] = await fn(item, index)
    await worker()
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  )
  await Promise.all(workers)

  return results.map((result, index) => {
    if (result === undefined) {
      throw new Error(`mapWithConcurrency missing result at index ${index}`)
    }
    return result
  })
}
