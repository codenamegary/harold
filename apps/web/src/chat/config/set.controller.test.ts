import { describe, expect, test } from "bun:test"
import { createConfigSetController } from "./set.controller"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("config set controller", () => {
  test("fires one trailing call with the latest value after the delay", async () => {
    const fired: Array<{ sessionId: string; configId: string; value: string | boolean }> = []
    const controller = createConfigSetController({
      delayMs: 20,
      onFire: (params) => {
        fired.push(params)
      },
    })

    controller.schedule({ sessionId: "s1", configId: "model", value: "m1" })
    controller.schedule({ sessionId: "s1", configId: "model", value: "m2" })
    await sleep(60)

    expect(fired).toEqual([{ sessionId: "s1", configId: "model", value: "m2" }])
  })

  test("sessions debounce independently", async () => {
    const fired: Array<{ sessionId: string; configId: string; value: string | boolean }> = []
    const controller = createConfigSetController({
      delayMs: 20,
      onFire: (params) => {
        fired.push(params)
      },
    })

    controller.schedule({ sessionId: "s1", configId: "model", value: "m1" })
    controller.schedule({ sessionId: "s2", configId: "mode", value: "ask" })
    await sleep(60)

    expect(fired).toHaveLength(2)
  })

  test("flush fires immediately and cancels the trailing timer", async () => {
    const fired: Array<{ sessionId: string; configId: string; value: string | boolean }> = []
    const controller = createConfigSetController({
      delayMs: 5_000,
      onFire: (params) => {
        fired.push(params)
      },
    })

    controller.schedule({ sessionId: "s1", configId: "model", value: "m2" })
    controller.flush("s1")

    expect(fired).toEqual([{ sessionId: "s1", configId: "model", value: "m2" }])

    controller.dispose()
    await sleep(20)
    expect(fired).toHaveLength(1)
  })

  test("cancel drops the pending set without firing", async () => {
    const fired: Array<{ sessionId: string; configId: string; value: string | boolean }> = []
    const controller = createConfigSetController({
      delayMs: 20,
      onFire: (params) => {
        fired.push(params)
      },
    })

    controller.schedule({ sessionId: "s1", configId: "model", value: "m2" })
    controller.cancel("s1")
    await sleep(40)

    expect(fired).toEqual([])
  })

  test("flush with nothing scheduled is a no-op", () => {
    const fired: unknown[] = []
    const controller = createConfigSetController({
      delayMs: 20,
      onFire: (params) => {
        fired.push(params)
      },
    })

    controller.flush("s1")
    controller.dispose()

    expect(fired).toEqual([])
  })
})
