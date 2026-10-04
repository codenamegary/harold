import { describe, expect, test } from "bun:test"
import { Writable } from "node:stream"
import { teeWritable } from "./tee.writable"

const captureWritable = (chunks: string[]) =>
  new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString("utf8"))
      callback()
    },
  })

describe("teeWritable", () => {
  test("forwards every chunk to every destination", async () => {
    const first: string[] = []
    const second: string[] = []
    const tee = teeWritable([captureWritable(first), captureWritable(second)])

    tee.write("one\n")
    tee.write("two\n")
    await new Promise<void>((resolve) => tee.end(resolve))

    expect(first).toEqual(["one\n", "two\n"])
    expect(second).toEqual(["one\n", "two\n"])
  })

  test("calls back immediately when there are no destinations", async () => {
    const tee = teeWritable([])

    tee.write("ignored\n")
    await new Promise<void>((resolve) => tee.end(resolve))
  })
})
