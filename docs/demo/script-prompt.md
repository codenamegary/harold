# Harold Remotion Prompt

This file is the edit script. It describes intent, scene order, and reusable
beats. Exact timing, easing, and pixels live in the Remotion project at
`docs/demo/render`. Capture setup lives in `docs/demo/capture/setup.md`.

## Features to highlight

- Pairing
- One real session from plan to PR
- Plan mode
- Attachments
- Agent questions
- Changes and diffs
- Worktrees
- Draft PR
- Usage and cost

## Notation

- `[TAG]` is a one-shot routine.
- `[TAG:preset]` selects a named preset.
- `[TAG key=value]` passes one-off parameters.
- `[L...]` is a layout state. It holds until the next layout tag.
- `Enter:` is the transition into a scene.
- `~` marks a duration, for example `~0.5s`.
- Coordinates are normalized `0..1`, origin top-left.
- `focus` is a point on the phone screen. `dock` is a point on the stage.
- `[PZ]` defaults to the current layout slot. `focus` defaults to the phone
  screen center.
- Scene slugs are stable. Scene numbers are not used.

## Scene map

```text
intro -> terminal -> phone-pair -> pair-scan -> achievement
-> new-session -> plan -> question -> build -> usage -> changes
-> worktrees -> pr -> outro
```

## Vocabulary

### Layouts

- `[L1 term]` One column. Terminal only. Phone and copy off.
- `[L1 phone]` One column. Phone centered. Terminal and copy off.
- `[L2C term|phone]` Two columns. Terminal left, phone right.
- `[L2C copy|phone]` Two columns. Large copy left, phone right.

### Camera

- `[PZ:full]` 1x, full frame. Uses the current layout slot.
- `[PZ:right-full]` 1x, full frame, docked right.
- `[PZ:top-two-thirds]` 2x, framed on the top two thirds.
- `[PZ:center-two-thirds]` 2x, framed on the center.
- `[PZ:lower-center]` 1.7x, focus lower center.
- `[PZ:lower-right]` 2.6x, focus lower right.
- `[PZ:upper-center]` 1.6x, focus upper center.
- Override a preset value with `scale=`, `focus=`, or `drift=`, for example
  `[PZ:lower-center scale=2.4 focus=0.5,0.81]`.
- Raw form: `[PZ scale=2 focus=0.5,0.33 dock=right]`.
- Preset names describe framing. Do not name a preset after a scene or feature.

### Copy

- `[CAP "text"]` Fallback bottom caption. Prefer a card, callout, note, or
  annotation when the copy can sit in the empty area.
- `[CALLOUT "title" eyebrow="text" hint="text" side=right]` Phone-attached
  tag with a drawn leader line and target pulse. The first tap of the shot is
  the anchor. Plays a ping. Eyebrow and hint are optional. Add
  `compact placement=edge` to sit it beside the phone. Add `connector=T` for
  a T-bracket outside the phone frame. Override the anchor with `targetX=` and
  `targetY=` when the copy should point at a control other than the first tap.
- `[SPOTLIGHT side=left]` Large copy card with a mono kicker, display title,
  and lime rule. Plays a ping. The kicker and title sit on the following
  indented lines.

### Collections

- `[CARDS "title" eyebrow="text" hint="text"]` Paper cards fan out from
  behind the phone. Use it for list or history beats where the story is a
  collection, not one control. Plays a ping.

### Notes

- `[NOTE "title" label="text"]` One paper note with a lime tape and rule. The
  tape carries a short label. Slides out from behind the phone, holds, then
  slides back. Plays a ping.

### Cards

- `[CARD "title"]` One white card inside the empty part of the current phone
  screen. Tracks the phone camera. Plays a ping.
- `[CARD "title" place=stage]` One white card on the stage, for terminal copy
  or copy that sits beside the phone. Plays a ping.

### Annotations

- `[BOX "title" -> "next title"]` White card in the empty phone area. A lime
  box frames the first control, then moves to the next control while the card
  text swaps. Plays a ping at each move.

### Interaction

- `[TAP "target"]` Tap ripple and tap sound.
- `[KR "text"]` Typing window and key sounds. Enter is separate.

### Celebration

- `[POP]` Phone squash, shake, and settle. Silent.
- `[CF]` Full-stage confetti shower. Silent.

## Scenes

### Scene: intro

Enter: Composition opens on the intro slide.

Beats:

- Harold logo.
- Subtitle "Hark! The Harold Agents Sing".
- CTA `bun install -g @codenamegary/harold@latest`.

### Scene: terminal

Enter: The intro slide fades out. The terminal zooms in close. [L1 term]

Beats:

- [CARD "Start Harold wherever you run your agents" place=stage]
- The terminal prompt shows `codenamegary` and a ready caret.
- [KR "harold start"] then press Enter.
- The terminal zooms out to show the server status.
- The server prints its status.
- [KR "harold pair"] then press Enter. The instance is on the default port
  3847, so the command stays `harold pair` rather than spelling out `--url`.
- The QR code appears.
- [CARD "Generate a secure temporary pairing code" place=stage]
- The last output reads `Waiting for a device to claim...`

### Scene: phone-pair

Enter: The terminal stays on the left. The phone enters right on its loading
screen. [L2C term|phone ~1.7s] [PZ:right-full]

Beats:

- The phone starts black and fades in the Harold app loading screen.
- [CARD "Harold'ing..." place=stage]
- The phone shows the Not paired state.
- [CARD "Pair with your agents" place=stage]
- [TAP "Pair"]
- [PZ:top-two-thirds ~0.5s]
- The phone holds the top-two-thirds framing.

### Scene: pair-scan

Enter: The terminal QR is on the left, showing
`Waiting for a device to claim...`. [L2C term|phone]. The phone holds [PZ:top-two-thirds].

Beats:

- The pair camera opens on the right with the recorded QR video.
- The video simulates the camera pointed at a laptop screen.
- The camera shows for about 3s.
- The scanner is replaced by the Harold identity screen with the badge preview,
  Name field, Color row, Icon row, and Pair button.
- [TAP "Name field"]
- [KR "Work"]
- Leave Violet and the Harold mark selected.
- Dismiss the keyboard.
- [TAP "Pair"]
- [PZ:center-two-thirds ~0.5s]
- The landing screen is visible with the Work badge and the paired state.
- The terminal prints `Device paired.` and returns to the prompt.

### Scene: achievement

Enter: [L2C copy|phone ~1.2s]. The terminal wooshes out left and fades. [PZ:center-two-thirds].

Beats:

- [SPOTLIGHT side=left]
  kicker: Achievement unlocked
  title: Work from Couch
- [POP]
- [CF]
- The phone holds the centered close-up.

### Scene: new-session

Enter: The phone returns to center after the achievement. The session menu
opens on the cat history. [L1 phone] [PZ:full].

Beats:

- [TAP "Session dropdown"]
- The menu shows the five cat sessions and `New session`.
- [NOTE "Start something new" label="NEW SESSION"]
- [TAP "New session"]
- The New session form opens. The phone enlarges to [PZ:center-two-thirds].
- The header may show the provisional `New session - <timestamp>` title until
  the agent generates a name. The cut does not caption it; the final PR reply
  shows the generated title.
- [TAP "Workspace dropdown"]
- The menu shows the four workspaces. `cat-screensaver` points at the
  `cat-mode` worktree.
- [TAP "cat-screensaver"]
- OpenCode is the only enabled agent and is already selected.
- [TAP "Continue"]
- The phone pulls back to center as the chat opens. [L1 phone] [PZ:full].

### Scene: plan

Enter: The new chat settles. The composer shows the OpenCode model and mode
chips. [L1 phone] [PZ:full].

Beats:

- [CALLOUT "Use your agent’s plan mode" eyebrow="PLAN"]
- [TAP "Mode chip until PLAN"]
- [TAP "Message field"]
- [KR "Read the attached spec and the photo of Mia. Plan only; do not edit files. Plan a small cat mode for this screensaver. Do not build yet. Use your question tool exactly once, for one question only: should cat mode be a settings toggle or automatic? The options must be exactly Settings toggle and Automatic. Do not ask about anything else."]
- [TAP "Attach photo"]
- Wait for the photo picker.
- [TAP "Third cat photo"]
- [TAP "Add (1)"]
- [TAP "Attach files"]
- [TAP "cat-mode.md"]
- [CALLOUT "Give it the spec" eyebrow="ATTACHMENTS" hint="A markdown file and a photo of Mia." compact placement=edge connector=T]
- The composer shows the cat photo and the markdown file chips.
- [TAP "Send message"]

### Scene: question

Enter: The plan turn runs. The phone stays on the chat. [L1 phone] [PZ:full].

Beats:

- The agent replies with a short plan.
- The question card appears above the composer.
- If the turn idles without a question card, the driver sends the nudge:
  `Before you build, use your question tool to ask whether cat mode should be a settings toggle or automatic.`
- If there is still no question card, the capture fails.
- [CALLOUT "Get grilled" eyebrow="AGENT QUESTION" hint="Interactive question tooling."]
- [TAP "Answer"]
- The question sheet opens with `Settings toggle` and `Automatic`.
- [TAP "Settings toggle"]
- [TAP "Submit"]
- The sheet closes and the agent settles.

### Scene: build

Enter: The plan turn settles. [L1 phone] [PZ:full].

Beats:

- [CALLOUT "Execute the plan" eyebrow="BUILD"]
- [TAP "Mode chip until BUILD"]
- [TAP "Message field"]
- [KR "Settings toggle. Implement only the plan now. Put the toggle in src/settings.js, put the cat behavior in src/cat-mode.js, add tests, and commit every change on feat/cat-mode so the worktree is clean. Do not add unrelated features and do not open a PR."]
- [TAP "Send message"]
- The agent edits `settings.js`, adds `cat-mode.js` and its tests, and commits
  on `feat/cat-mode`. Any permission request is answered silently.
- The reply settles.

### Scene: usage

Enter: The build reply settles. [L1 phone] [PZ:full].

Beats:

- [PZ:upper-center scale=2.2 focus=0.5,0.08]
- [CALLOUT "Know what it cost" eyebrow="USAGE" hint="Tokens and dollars, in the header." compact placement=edge connector=T]
- The context and cost line under the header reads its live value.
- The driver fails if the line is missing.

### Scene: changes

Enter: The usage hold ends. [L1 phone] [PZ:full].

Beats:

- [CALLOUT "Review the code" eyebrow="CHANGES"]
- [TAP "Changes icon"]
- The Changes screen opens on the uncommitted scope with
  `No uncommitted changes`.
- [TAP "Against main"]
- The file list shows the branch changes against `main`.
- [TAP "settings.js"]
- [PZ:full] [CALLOUT "Pretty diffs!" eyebrow="CHANGES" compact placement=edge connector=T]
- The diff shows the cat mode toggle in `settings.js`.
- [TAP "Back to changes"]

### Scene: worktrees

Enter: The Changes list is back. [L1 phone] [PZ:full].

Beats:

- [TAP "Worktree footer"]
- [CALLOUT "Auto-detect, or choose" eyebrow="WORKTREES" hint="Pick the worktree to inspect." compact placement=edge connector=T]
- The sheet lists `main` and `feat/cat-mode`.
- [TAP "Dismiss"]

### Scene: pr

Enter: The chat is back. [L1 phone] [PZ:full].

Beats:

- [TAP "Message field"]
- [KR "Push feat/cat-mode and open a draft PR against main with gh. End with the PR URL."]
- [CALLOUT "Just like always" eyebrow="DRAFT PR" hint="The agent pushes and opens it." compact placement=edge connector=T]
- [TAP "Send message"]
- The agent runs git and `gh`, then replies with the real draft PR URL.
- The driver holds on the URL and verifies the draft PR with `gh pr list`.
- [SPOTLIGHT side=left]
  kicker: The whole loop
  title: From plan to PR

### Scene: outro

Enter: The PR reply settles. The phone fades out. The outro fades in.

Beats:

- Harold logo.
- Subtitle "Hark! The Harold Agents Sing".
- CTA `bun install -g @codenamegary/harold@latest`.
- `harold.codenamegary.com`.
