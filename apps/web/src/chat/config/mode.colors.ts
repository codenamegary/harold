const MODE_TEXT_CLASSES: Record<string, string> = {
  agent: "text-lime",
  build: "text-lime",
  ask: "text-sky",
  plan: "text-sky",
  edit: "text-violet",
}

const MODE_BORDER_CLASSES: Record<string, string> = {
  agent: "border-l-lime",
  build: "border-l-lime",
  ask: "border-l-sky",
  plan: "border-l-sky",
  edit: "border-l-violet",
}

export const modeTextClass = (value: string): string | undefined =>
  MODE_TEXT_CLASSES[value]

export const modeBorderClass = (value: string): string | undefined =>
  MODE_BORDER_CLASSES[value]
