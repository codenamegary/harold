/**
 * The canonical capture slice list, for the whole storyboard.
 *
 * This module is the single source of truth for every beat: the driver records
 * exactly these beats, `capture.sh` validates the manifest against them, and the
 * Remotion timeline reads the same names out of `capture.json` (which
 * `build_capture.py` writes from the manifest the driver produces here).
 *
 * It holds data only, with no imports and no side effects, so three consumers can
 * share it without drift:
 *
 * - `walk.ts` dispatches its beat runners with `Record<SliceName, BeatRun>`, so a
 *   slice added here fails the typecheck until it has a run function;
 * - `capture.sh` asks this file for the recorded names (`bun run src/slices.ts
 *   --names`) instead of keeping a second hardcoded copy;
 * - the render project can import `cameraSliceNames` directly, because this file
 *   resolves with no dependencies.
 *
 * `kind` separates plumbing from picture. `preRoll` beats drive the app to the
 * starting state and are never recorded. `onCamera` beats are recorded slices,
 * one `screenrecord` file each, numbered by their position among the on-camera
 * beats.
 *
 * The connect act stages the empty home in `boot`. The story after `landing` follows
 * a live agent session, so each group of on-camera scenes is preceded by its own
 * `preRoll` beat: `plan_stage` leaves build mode, clears the composer and removes
 * stale attachments, `question_stage` waits for the agent question, `build_stage`
 * sets build mode once the answer has settled, and `pr_stage` returns from
 * Changes to the chat. A `preRoll` beat never appears in the picture and never
 * gets a file number.
 *
 * `achievement` reuses the `landing` recording and `outro` is a rendered card,
 * so neither scene needs a slice of its own.
 */

export const sliceKinds = ["preRoll", "onCamera"] as const

export type SliceKind = (typeof sliceKinds)[number]

export const sliceNames = [
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
] as const

export type SliceName = (typeof sliceNames)[number]

export type SliceSpec = Readonly<{
  name: SliceName
  kind: SliceKind
  title: string
}>

export const slicePlan: readonly SliceSpec[] = [
  {
    name: "boot",
    kind: "preRoll",
    title: "Cold start, then wait on the empty home screen",
  },
  { name: "home_empty", kind: "onCamera", title: "The empty home, no connections yet" },
  {
    name: "connect",
    kind: "onCamera",
    title: "Tap Add connection, fill the form, scroll, test, trust and save",
  },
  { name: "landing", kind: "onCamera", title: "Landed in the app" },
  {
    name: "new_session",
    kind: "onCamera",
    title: "Open the session menu, pick the workspace and agent, and start a session",
  },
  {
    name: "plan_stage",
    kind: "preRoll",
    title: "Reset the new session to build mode, an empty composer and no attachments",
  },
  {
    name: "plan",
    kind: "onCamera",
    title: "Attach Mia's photo and diary, switch to plan mode, type the prompt and send",
  },
  {
    name: "question_stage",
    kind: "preRoll",
    title: "Wait for the agent to ask its one question",
  },
  { name: "question", kind: "onCamera", title: "Answer the agent question from the chat" },
  {
    name: "build_stage",
    kind: "preRoll",
    title: "Stage build mode on the settled session",
  },
  {
    name: "build",
    kind: "onCamera",
    title: "Type the build prompt, send it and let the turn settle",
  },
  { name: "usage", kind: "onCamera", title: "Hold on the context and cost line" },
  {
    name: "changes",
    kind: "onCamera",
    title: "Open Changes, read the branch scope and open settings.js",
  },
  { name: "worktrees", kind: "onCamera", title: "Open the worktree sheet and dismiss it" },
  {
    name: "pr_stage",
    kind: "preRoll",
    title: "Return to the chat and stage the PR prompt",
  },
  { name: "pr", kind: "onCamera", title: "Type the PR prompt, send it and hold on the PR URL" },
]

export const cameraSliceNames: readonly SliceName[] = slicePlan
  .filter((spec) => spec.kind === "onCamera")
  .map((spec) => spec.name)

export const preRollSliceNames: readonly SliceName[] = slicePlan
  .filter((spec) => spec.kind === "preRoll")
  .map((spec) => spec.name)

export const isSliceName = (value: string): value is SliceName =>
  sliceNames.some((name) => name === value)

export const specOf = (name: SliceName): SliceSpec => {
  const found = slicePlan.find((spec) => spec.name === name)
  if (found === undefined) {
    throw new Error(`slice ${name} is not in the plan`)
  }
  return found
}

/**
 * The 1-based position of an on-camera slice among the recorded slices. This is
 * the `NNN` prefix of its file, so `--only` re-records land on the same name.
 */
export const cameraSliceIndex = (name: SliceName): number => {
  const index = cameraSliceNames.indexOf(name)
  if (index < 0) {
    throw new Error(
      `slice ${name} is ${specOf(name).kind} and is never recorded; ` +
        `recorded slices are ${cameraSliceNames.join(", ")}`,
    )
  }
  return index + 1
}

export const sliceFileName = (name: SliceName): string =>
  `${String(cameraSliceIndex(name)).padStart(3, "0")}-${name}.mp4`

/**
 * Parse repeated `--only` values into a de-duplicated, plan-ordered selection.
 * An empty selection means "record every on-camera beat".
 */
export const parseOnly = (values: readonly string[]): readonly SliceName[] => {
  const requested = values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  const unknown = requested.filter((value) => !isSliceName(value))
  if (unknown.length > 0) {
    throw new Error(
      `unknown slice(s) ${unknown.join(", ")}; recorded slices are ` +
        `${cameraSliceNames.join(", ")}`,
    )
  }

  const named = requested.filter(isSliceName)
  const preRoll = named.filter((name) => specOf(name).kind === "preRoll")
  if (preRoll.length > 0) {
    throw new Error(
      `${preRoll.join(", ")} are pre-roll beats and are never recorded; ` +
        `choose from ${cameraSliceNames.join(", ")}`,
    )
  }

  if (named.length === 0) {
    throw new Error("--only needs at least one slice name")
  }

  return cameraSliceNames.filter((name) => named.includes(name))
}

export const shouldRecord = (name: SliceName, only: readonly SliceName[]): boolean =>
  only.length === 0 || only.includes(name)

if (import.meta.main) {
  const argv = process.argv.slice(2)
  if (argv.includes("--names")) {
    console.log(cameraSliceNames.join("\n"))
  } else if (argv.includes("--json")) {
    console.log(JSON.stringify({ plan: slicePlan, camera: cameraSliceNames }, null, 2))
  } else {
    console.error(
      "usage: bun run src/slices.ts [--names | --json]\n" +
        `  slices: ${slicePlan.map((spec) => `${spec.name} (${spec.kind})`).join(", ")}`,
    )
    process.exitCode = 1
  }
}
