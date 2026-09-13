import { describe, expect, test } from "bun:test"
import {
  categoryOf,
  ConfigOptionSchema,
  SessionConfigSchema,
  setConfigOptionPath,
  SetConfigOptionBodySchema,
} from "./config.options"

describe("config option contracts", () => {
  test("parses a select config option with ordered values", () => {
    const option = ConfigOptionSchema.parse({
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "openai/gpt-5.2",
      options: [
        {
          value: "openai/gpt-5.2",
          name: "GPT-5.2",
          description: "Flagship model",
        },
        { value: "opencode/big-pickle", name: "Big Pickle" },
      ],
    })

    expect(option).toEqual({
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "openai/gpt-5.2",
      options: [
        { value: "openai/gpt-5.2", name: "GPT-5.2", description: "Flagship model" },
        { value: "opencode/big-pickle", name: "Big Pickle" },
      ],
    })
  })

  test("parses a boolean config option", () => {
    expect(
      ConfigOptionSchema.parse({
        id: "fast",
        name: "Fast",
        type: "boolean",
        currentValue: true,
      }),
    ).toEqual({
      id: "fast",
      name: "Fast",
      type: "boolean",
      currentValue: true,
    })
  })

  test("rejects an unknown option type", () => {
    expect(() =>
      ConfigOptionSchema.parse({
        id: "weird",
        name: "Weird",
        type: "slider",
        currentValue: 3,
      }),
    ).toThrow()
  })

  test("categoryOf maps reserved categories and demotes the rest", () => {
    const select = (category?: string) =>
      ConfigOptionSchema.parse({
        id: "x",
        name: "X",
        ...(category === undefined ? {} : { category }),
        type: "select",
        currentValue: "a",
        options: [{ value: "a", name: "A" }],
      })

    expect(categoryOf(select("model"))).toBe("model")
    expect(categoryOf(select("mode"))).toBe("mode")
    expect(categoryOf(select("model_config"))).toBe("model_config")
    expect(categoryOf(select("thought_level"))).toBe("thought_level")
    expect(categoryOf(select("vendor_custom"))).toBe("other")
    expect(categoryOf(select("_private"))).toBe("other")
    expect(categoryOf(select())).toBe("other")
  })

  test("session config is a readonly array of options", () => {
    const sessionConfig = SessionConfigSchema.parse([
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "m1",
        options: [{ value: "m1", name: "M1" }],
      },
      {
        id: "fast",
        name: "Fast",
        type: "boolean",
        currentValue: false,
      },
    ])

    expect(sessionConfig).toHaveLength(2)
  })

  test("set config option body accepts string and boolean values only", () => {
    expect(SetConfigOptionBodySchema.parse({ value: "openai/gpt-5.2" })).toEqual({
      value: "openai/gpt-5.2",
    })
    expect(SetConfigOptionBodySchema.parse({ value: true })).toEqual({ value: true })
    expect(() => SetConfigOptionBodySchema.parse({ value: 3 })).toThrow()
    expect(() => SetConfigOptionBodySchema.parse({ other: true })).toThrow()
  })

  test("set config option path encodes session and config ids", () => {
    expect(setConfigOptionPath("sess-1", "model")).toBe(
      "/v1/sessions/sess-1/config-options/model",
    )
    expect(setConfigOptionPath("a/b", "c d")).toBe(
      "/v1/sessions/a%2Fb/config-options/c%20d",
    )
  })
})
