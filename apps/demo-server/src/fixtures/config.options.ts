export type DemoConfigValue = string | boolean

export type DemoConfigOption =
  | {
      id: string
      name: string
      category: string
      type: "select"
      currentValue: string
      options: ReadonlyArray<{ value: string; name: string }>
    }
  | {
      id: string
      name: string
      category: string
      type: "boolean"
      currentValue: boolean
    }

const baseConfigOptions: ReadonlyArray<DemoConfigOption> = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "demo-model",
    options: [
      { value: "demo-model", name: "Demo model" },
      { value: "demo-fast", name: "Demo fast" },
    ],
  },
  {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue: "build",
    options: [
      { value: "build", name: "Build" },
      { value: "plan", name: "Plan" },
    ],
  },
  {
    id: "thought_level",
    name: "Thought level",
    category: "thought_level",
    type: "select",
    currentValue: "medium",
    options: [
      { value: "low", name: "Low" },
      { value: "medium", name: "Medium" },
      { value: "high", name: "High" },
    ],
  },
]

export const defaultConfigValues = (): Map<string, DemoConfigValue> =>
  new Map(baseConfigOptions.map((option) => [option.id, option.currentValue]))

export const configOptionsFor = (
  values: ReadonlyMap<string, DemoConfigValue>,
): ReadonlyArray<DemoConfigOption> =>
  baseConfigOptions.map((option) => {
    const value = values.get(option.id)
    if (option.type === "select") {
      return {
        ...option,
        currentValue: typeof value === "string" ? value : option.currentValue,
      }
    }
    return {
      ...option,
      currentValue: typeof value === "boolean" ? value : option.currentValue,
    }
  })

export const isKnownConfigId = (configId: string): boolean =>
  baseConfigOptions.some((option) => option.id === configId)

export const configOptionType = (configId: string): "select" | "boolean" | null =>
  baseConfigOptions.find((option) => option.id === configId)?.type ?? null
