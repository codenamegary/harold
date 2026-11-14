/**
 * The typed prompts from the storyboard, byte for byte.
 *
 * They live here rather than inline in `walk.ts` because they are copy, not
 * driver logic. The script owns the words. The beats own the keystrokes. The
 * driver taps `chat_composer` and types each character with adb. Each character
 * stamps a `key` row on the host clock.
 *
 * `docs/demo/script.md` section 2 is the source. Do not reword without updating
 * it first.
 */

/**
 * The `plan` scene prompt. Short enough to read on screen, and no instruction
 * for the elicitation: the scripted agent asks that as part of its plan turn.
 */
export const PLAN_PROMPT = "Plan a small cat mode for the cat screensaver."

/** The `build` scene prompt. Answers the question and scopes the change. */
export const BUILD_PROMPT = [
  "Settings toggle.",
  "Implement only the plan now.",
  "Put the toggle in src/settings.js, put the cat behavior in src/cat-mode.js,",
  "add tests, and commit every change on feat/cat-mode so the worktree is clean.",
  "Do not add unrelated features and do not open a PR.",
].join(" ")

/** The `pr` scene prompt. Pushes the branch and opens the draft PR. */
export const PR_PROMPT =
  "Push feat/cat-mode and open a draft PR against main with gh. End with the PR URL."
