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
      "connect_empty",
      "connect_key",
      "connect_fill",
      "connect_test",
      "connect_trust",
      "connect_save",
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

  it("keeps the seven connect slices in their original names and order", () => {
    expect(sliceNames.slice(1, 8)).toEqual([
      "connect_empty",
      "connect_key",
      "connect_fill",
      "connect_test",
      "connect_trust",
      "connect_save",
      "landing",
    ])
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
      "connect_empty",
      "connect_key",
      "connect_fill",
      "connect_test",
      "connect_trust",
      "connect_save",
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
    expect(cameraSliceIndex("connect_empty")).toBe(1)
    expect(cameraSliceIndex("landing")).toBe(7)
    expect(cameraSliceIndex("pr")).toBe(cameraSliceNames.length)
    expect(sliceFileName("connect_fill")).toBe("003-connect_fill.mp4")
    expect(sliceFileName("landing")).toBe("007-landing.mp4")
    expect(sliceFileName("new_session")).toBe("008-new_session.mp4")
    expect(sliceFileName("pr")).toBe("015-pr.mp4")
  })

  it("refuses to number a pre-roll beat", () => {
    expect(() => cameraSliceIndex("boot")).toThrow(/is preRoll and is never recorded/)
    expect(() => cameraSliceIndex("plan_stage")).toThrow(/is preRoll and is never recorded/)
    expect(() => sliceFileName("boot")).toThrow()
  })

  it("recognises only plan names", () => {
    expect(isSliceName("connect_trust")).toBe(true)
    expect(isSliceName("connect_teeth")).toBe(false)
  })
})

describe("parseOnly", () => {
  it("splits, de-duplicates and orders by the plan", () => {
    expect(parseOnly(["connect_trust,connect_empty"])).toEqual(["connect_empty", "connect_trust"])
    expect(parseOnly(["landing", "connect_empty"])).toEqual(["connect_empty", "landing"])
    expect(parseOnly(["connect_fill", "connect_fill"])).toEqual(["connect_fill"])
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
    expect(shouldRecord("connect_save", [])).toBe(true)
  })

  it("records only the selected slices", () => {
    expect(shouldRecord("connect_save", ["connect_save"])).toBe(true)
    expect(shouldRecord("connect_fill", ["connect_save"])).toBe(false)
  })
})
