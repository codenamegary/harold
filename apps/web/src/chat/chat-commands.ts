export const slashCommands = [
  { command: "/status", description: "Show workspace and git status" },
  { command: "/review", description: "Review recent code changes" },
  { command: "/tests", description: "Run the test suite" },
  { command: "/clear", description: "Clear this conversation" },
] as const

export const promptChips = [
  "Summarize this workspace",
  "Check the current git status",
  "Find potential bugs",
] as const
