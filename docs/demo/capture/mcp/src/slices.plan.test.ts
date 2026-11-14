import { describe, expect, it } from "bun:test"
import {
  cameraSliceIndex,
  cameraSliceNames,
  isSliceName,
  parseOnly,
  preRollSliceNames,
  shouldRecord,
  sliceFileName,
  sliceNames,
  slicePlan,
  specOf,
} from "./slices"

describe("slice plan", () => {
  it("is the whole storyboard in story order, connect act first", () => {
    expect(sliceNames).toEqual([
      "boot",
      "home_empty",
      "connect",
      "landing",
      "new_session",
      "plan_stage",
      "plan",
      "question_stage",
      "question",
      "build_stage",
      "build",
      "usage",
      "changes",
      "worktrees",
      "pr_stage",
      "pr",
    ])
    expect(slicePlan.map((spec) => spec.name)).toEqual([...sliceNames])
  })

  it("records the empty home, then one connect run, then landing", () => {
    expect(sliceNames.slice(1, 4)).toEqual(["home_empty", "connect", "landing"])
  })

  it("classifies every staging beat as pre-roll and every scene as on camera", () => {
    expect(preRollSliceNames).toEqual([
      "boot",
      "plan_stage",
      "question_stage",
      "build_stage",
      "pr_stage",
    ])
    expect(cameraSliceNames).toEqual([
      "home_empty",
      "connect",
      "landing",
      "new_session",
      "plan",
      "question",
      "build",
      "usage",
      "changes",
      "worktrees",
      "pr",
    ])
    for (const name of cameraSliceNames) {
      expect(specOf(name).kind).toBe("onCamera")
    }
  })

  it("puts a pre-roll beat before each staged group", () => {
    const indexOf = (name: string): number => slicePlan.findIndex((spec) => spec.name === name)
    expect(indexOf("plan_stage")).toBeLessThan(indexOf("plan"))
    expect(indexOf("question_stage")).toBeLessThan(indexOf("question"))
    expect(indexOf("build_stage")).toBeLessThan(indexOf("build"))
    expect(indexOf("pr_stage")).toBeLessThan(indexOf("pr"))
  })

  it("gives every slice a non-empty title", () => {
    for (const spec of slicePlan) {
      expect(spec.title.length).toBeGreaterThan(0)
    }
  })

  it("numbers the recorded slices from one, in plan order", () => {
    expect(cameraSliceIndex("home_empty")).toBe(1)
    expect(cameraSliceIndex("connect")).toBe(2)
    expect(cameraSliceIndex("landing")).toBe(3)
    expect(cameraSliceIndex("pr")).toBe(cameraSliceNames.length)
    expect(sliceFileName("home_empty")).toBe("001-home_empty.mp4")
    expect(sliceFileName("connect")).toBe("002-connect.mp4")
    expect(sliceFileName("landing")).toBe("003-landing.mp4")
    expect(sliceFileName("new_session")).toBe("004-new_session.mp4")
    expect(sliceFileName("pr")).toBe("011-pr.mp4")
  })

  it("refuses to number a pre-roll beat", () => {
    expect(() => cameraSliceIndex("boot")).toThrow(/is preRoll and is never recorded/)
    expect(() => cameraSliceIndex("plan_stage")).toThrow(/is preRoll and is never recorded/)
    expect(() => sliceFileName("boot")).toThrow()
  })

  it("recognises only plan names", () => {
    expect(isSliceName("connect")).toBe(true)
    expect(isSliceName("home_empty")).toBe(true)
    expect(isSliceName("connect_fill")).toBe(false)
    expect(isSliceName("connect_teeth")).toBe(false)
  })
})

describe("parseOnly", () => {
  it("splits, de-duplicates and orders by the plan", () => {
    expect(parseOnly(["connect,home_empty"])).toEqual(["home_empty", "connect"])
    expect(parseOnly(["landing", "home_empty"])).toEqual(["home_empty", "landing"])
    expect(parseOnly(["connect", "connect"])).toEqual(["connect"])
  })

  it("rejects a name that is not in the plan", () => {
    expect(() => parseOnly(["connect_teeth"])).toThrow(/unknown slice\(s\) connect_teeth/)
  })

  it("rejects a pre-roll beat, because it is never recorded", () => {
    expect(() => parseOnly(["boot"])).toThrow(/boot are pre-roll beats and are never recorded/)
    expect(() => parseOnly(["question_stage"])).toThrow(
      /question_stage are pre-roll beats and are never recorded/,
    )
  })

  it("rejects an empty selection", () => {
    expect(() => parseOnly([])).toThrow(/--only needs at least one slice name/)
    expect(() => parseOnly([",", " "])).toThrow(/--only needs at least one slice name/)
  })
})

describe("shouldRecord", () => {
  it("records everything when the selection is empty", () => {
    expect(shouldRecord("connect", [])).toBe(true)
  })

  it("records only the selected slices", () => {
    expect(shouldRecord("connect", ["connect"])).toBe(true)
    expect(shouldRecord("home_empty", ["connect"])).toBe(false)
  })
})
