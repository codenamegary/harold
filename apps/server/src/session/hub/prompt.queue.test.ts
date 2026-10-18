import { describe, expect, test } from "bun:test"
import { createPromptQueue } from "./prompt.queue"

type Job = { id: string }

const deferred = () => {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve: () => resolve?.() }
}

describe("createPromptQueue", () => {
  test("starts jobs in FIFO order without waiting for earlier turns", async () => {
    const started: string[] = []
    const gates = new Map<string, ReturnType<typeof deferred>>()
    const queue = createPromptQueue<Job>({
      execute: async (job: Job) => {
        started.push(job.id)
        const gate = deferred()
        gates.set(job.id, gate)
        await gate.promise
      },
    })

    queue.enqueue({ id: "a" })
    queue.enqueue({ id: "b" })
    queue.enqueue({ id: "c" })

    expect(started).toEqual(["a", "b", "c"])

    gates.get("a")?.resolve()
    gates.get("b")?.resolve()
    gates.get("c")?.resolve()
    await queue.awaitIdle()
    expect(started).toEqual(["a", "b", "c"])
  })

  test("awaitIdle waits for every in-flight turn", async () => {
    const gate = deferred()
    let finished = false
    const queue = import.meta.require("./prompt.queue").createPromptQueue<Job>({
      execute: async () => {
        await gate.promise
        finished = true
      },
    })

    queue.enqueue({ id: "a" })

    let idle = false
    const idlePromise = queue.awaitIdle().then(() => {
      idle = true
    })
    await Promise.resolve()
    expect(idle).toBe(false)

    gate.resolve()
    await idlePromise
    expect(finished).toBe(true)
    expect(idle).toBe(true)
  })

  test("a failing turn never wedges the queue", async () => {
    const started: string[] = []
    const queue = createPromptQueue<Job>({
      execute: async (job: Job) => {
        started.push(job.id)
        if (job.id === "bad") {
          throw new Error("turn exploded")
        }
      },
    })

    queue.enqueue({ id: "bad" })
    await queue.awaitIdle()

    queue.enqueue({ id: "next" })
    await queue.awaitIdle()
    expect(started).toEqual(["bad", "next"])
  })
})
