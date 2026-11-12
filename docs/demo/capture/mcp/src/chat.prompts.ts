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

/** The `plan` scene prompt. Asks for a plan, one question, and no edits. */
export const PLAN_PROMPT = [
  "Read the attached spec and the photo of Mia.",
  "Plan only; do not edit files.",
  "Plan a small cat mode for this screensaver.",
  "Do not build yet.",
  "Use your question tool exactly once, for one question only:",
  "should cat mode be a settings toggle or automatic?",
  "The options must be exactly Settings toggle and Automatic.",
  "Do not ask about anything else.",
].join(" ")

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

/**
 * The contingency prompt from the `question` scene, used only when the agent
 * skipped its question. It is here so a future retry beat does not invent copy.
 */
export const QUESTION_CONTINGENCY_PROMPT =
  "Before you build, use your question tool to ask whether cat mode should be a settings toggle or automatic."
