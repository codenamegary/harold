/**
 * FIFO prompt queue with unbounded concurrency: jobs are dispatched in
 * submission order, but turns run independently — one long turn never blocks
 * another, and a turn never blocks the request path. `awaitIdle` is a
 * lifecycle/test seam for awaiting every in-flight turn.
 */
export type PromptQueue<T> = {
  enqueue: (job: T) => void
  awaitIdle: () => Promise<void>
}

export const createPromptQueue = <T>(params: {
  execute: (job: T) => Promise<void>
}): PromptQueue<T> => {
  const pending: T[] = []
  const inFlight = new Set<Promise<void>>()

  const run = async (job: T): Promise<void> => {
    try {
      await params.execute(job)
    } catch {
      // Turn failures are values; an unexpected throw must never wedge the queue.
    }
  }

  const pump = () => {
    while (pending.length > 0) {
      const job = pending.shift()
      if (job === undefined) {
        break
      }
      const task = run(job).finally(() => {
        inFlight.delete(task)
      })
      inFlight.add(task)
    }
  }

  return {
    enqueue: (job) => {
      pending.push(job)
      pump()
    },
    awaitIdle: async () => {
      while (inFlight.size > 0) {
        await Promise.all(inFlight)
      }
    },
  }
}
