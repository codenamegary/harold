# Harold Remotion Prompt

This file is the edit script. It describes intent, scene order, and reusable
beats. Exact timing, easing, and pixels live in the Remotion project at
`docs/demo/render`. Capture setup lives in `docs/demo/capture/setup.md`.

This file is the single source of truth for the cut. Do not keep a second
storyboard anywhere else.

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
intro -> app -> connect to ssh host -> achievement
-> new-session -> plan -> question -> build -> usage -> changes
-> worktrees -> pr -> outro
```

## Vocabulary

### Layouts

- `[L1 phone]` One column. Phone centered. Copy off.
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

### Stage

The whole film happens on one dark stage. A single floodlight pool is the only
light. Nothing else is lit. The light carries the arc of the story, so the states
change at act boundaries, not on every scene.

Layers, back to front:

- `back` The wall and floor. Always the darkest layer.
- `pool` The lit ellipse where the floor meets the wall.
- `phone` The phone itself. The mid layer.
- `haze` The foreground light shaft and dust. The nearest layer.

Parallax: the camera drifts, the pool drifts slower than the camera, and the
haze drifts faster. Never move all three at one speed. One to two percent of
frame width per second is enough. The phone sits between the pool and the haze,
so any movement slides it across the light.

The phone has to earn the light. It is small and off centre while it is unsure of
itself, it leans in when it is working, and it turns to present its screen when
it has something to show. Reuse that body language, do not play the waddle once
and then leave the phone static.

- `[LIGHT:alone]` Pool wide and dim. Phone small and off centre.
- `[LIGHT:arrival]` Pool brightens and tightens as the phone comes in.
- `[LIGHT:reward]` Pool blooms to the full stage. Haze flares. Confetti falls in the light.
- `[LIGHT:work]` Pool tightens onto the phone. Haze dims. Drift quickens.
- `[LIGHT:full]` Pool opens wide. Phone small and centred in a large lit field.

A `[LIGHT]` state holds until the next one.

### Copy

- `[CAP "text"]` Fallback bottom caption. Prefer a card, callout, note, or
  annotation when the copy can sit in the empty area.
- `[CALLOUT "title" eyebrow="text" hint="text" side=right]` Phone-attached
  tag with a drawn leader line and target pulse. The first tap of the shot is
  the anchor. Plays a ping. Eyebrow and hint are optional. Add
  `compact placement=edge` to sit it beside the phone. Add `connector=T` for
  a T-bracket outside the phone frame. Override the anchor with `targetX=` and
  `targetY=` when the copy should point at a control other than the first tap.
  Add `targetShape=rounded` to outline a control instead of covering it with
  the target dot.
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
- `[CARD "title" place=stage]` One white card on the stage, for copy that sits beside the phone. Plays a ping.

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

Everything happens on the stage described above. Every scene below names its
light state and what the phone does in the light.

### Scene: intro

Enter: [LIGHT:alone]. Composition opens on the intro slide. The lockup sits in
the shaft, in the spotlight. Near the end the lockup fades and the pool slides
a little right, toward where the phone will enter.

Beats:

- Harold logo.
- Subtitle "Hark! The Harold Agents Sing".
- CTA `:github logo: codenamegary/harold`.
- The lockup fades. The pool moves right.

### Scene: SSH Host Connection

Enter: [LIGHT:arrival]. The intro slide is gone. The phone, on the empty home,
starts small and further back. It waddles in from the right, quicker, with a
snappier rock, and settles in the pool, lit from that side. Once it fills the
frame it holds still. No parallax on the phone after that.

Beats:

- The phone waddles into the light on the empty home (no connections yet)
- [CARD "Look what I can do!" place=stage]
- The camera eases in until the phone fills the frame vertically, centered
- The phone stops moving
- The camera punches in on Add connection
- [TAP "Add connection"]
- The camera punches back out to the full form
- The form is filled in one run: name, host, user, port, then the phone
  scrolls, then test, then trust
- [TAP "Save SSH Host"] starts the achievement. The picture keeps playing.

### Scene: achievement

Enter: [L2C copy|phone]. [LIGHT:reward]. This begins on the save tap. The pool
blooms and the camera eases to [PZ:center-two-thirds], docked clear of the left
copy. The form leaves and the home screen arrives inside that move.

Beats:

- [SPOTLIGHT side=left]
  kicker: Achievement unlocked
  title: Work from Couch
- [POP]
- [CF]
- The phone holds the close-up.

### Scene: new-session

Enter: [LIGHT:work]. The phone returns to center after the achievement. The
session menu opens on the cat history. The pool tightens onto the phone and the
haze drops back. [L1 phone] [PZ:full].

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

Enter: The new chat settles with an empty composer, BUILD mode, and no
attachments. The phone leans in towards the light while the attachments are
added. [L1 phone] [PZ:full], then [PZ scale=1.18] for the attach beat.

Beats:

- [CALLOUT "Attach images and files, right meow." eyebrow="ATTACHMENTS" hint="Mia’s photo and her diary." compact placement=edge connector=T]
- [TAP "Attach photo"]
- Wait for the photo picker.
- [TAP "Third cat photo"]
- [TAP "Add (1)"]
- The composer shows the photo chip.
- [TAP "Attach files"]
- Wait for the file picker.
- [TAP "cat-diary.txt"]
- The composer shows the photo and diary chips.
- [CALLOUT "Use your agent’s plan mode" eyebrow="PLAN" targetShape=rounded]
- [TAP "Mode chip until PLAN"]
- [TAP "Message field"]
- [KR "Plan a small cat mode for the cat screensaver."]
- [TAP "Send message"]

### Scene: question

Enter: The plan turn runs. The phone stays on the chat and sits back into the
pool, letting the agent work. [L1 phone] [PZ:full].

Beats:

- The agent replies with a short plan.
- The question card appears above the composer. The fake agent asks it as part
  of the scripted turn, with no instruction in the typed prompt.
- If the turn idles without a question card, the driver re-opens the session.
- If there is still no question card, the capture fails.
- [CALLOUT "Get grilled" eyebrow="AGENT QUESTION" hint="Interactive question tooling."]
- [TAP "Answer"]
- The question sheet opens with `Settings toggle` and `Automatic`.
- [TAP "Settings toggle"]
- [TAP "Submit"]
- The sheet closes and the agent settles.

### Scene: build

Enter: The plan turn settles. The phone holds still and watches the work happen.
[L1 phone] [PZ:full].

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

Enter: The build reply settles. The pool tightens to the top of the phone.
[L1 phone] [PZ:full].

Beats:

- [PZ:upper-center scale=2.2 focus=0.5,0.08]
- [CALLOUT "Know what it cost" eyebrow="USAGE" hint="Tokens and dollars, in the header." compact placement=edge connector=T]
- The context and cost line under the header reads its live value.
- The driver fails if the line is missing.

### Scene: changes

Enter: The usage hold ends. The phone turns slightly to present its screen to the
camera. [L1 phone] [PZ:full].

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

Enter: The Changes list is back. The pool holds and the haze drifts through the
light. [L1 phone] [PZ:full].

Beats:

- [TAP "Worktree footer"]
- [CALLOUT "Auto-detect, or choose" eyebrow="WORKTREES" hint="Pick the worktree to inspect." compact placement=edge connector=T]
- The sheet lists `main` and `feat/cat-mode`.
- [TAP "Dismiss"]

### Scene: pr

Enter: [LIGHT:full]. The chat is back. The pool opens wide and the phone sits
small and centred in a large lit field, so the last thing it does has room.
[L1 phone] [PZ:full].

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

Enter: [LIGHT:alone]. The PR reply settles. The phone fades out and the light
narrows to a single pool around the logo. The outro fades in.

Beats:

- Harold logo.
- Subtitle "Hark! The Harold Agents Sing".
- CTA `:github logo: codenamegary/harold`.
- `harold.codenamegary.com`.
