# Harold Remotion Prompt

This file is the edit script. It describes intent, scene order, and reusable
beats. Exact timing, easing, and pixels live in the Remotion project at
`docs/demo/render`. Capture setup lives in `docs/demo/capture/setup.md`.

## Features to highlight

- Pairing
- Multiple-agent support
- Connecting to existing sessions
- Creating a new session
- Text Chat
- Voice Chat
- Attachments
- Multiple Harold instances
- Slash commands

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
-> second-pair -> sessions -> new-session -> text-chat
-> voice-chat -> outro
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

- `[CAP "text"]` Bottom caption. Fades in with a lift and plays a ping.
- `[CALLOUT "title" eyebrow="text" hint="text" side=right]` Phone-attached
  tag with a drawn leader line and target pulse. The first tap of the shot is
  the anchor. Plays a ping. Add `compact placement=edge` to sit it beside the
  phone. Add `connector=T` for a T-bracket outside the phone frame.
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

- [CAP "Start Harold wherever you run your agents"]
- The terminal prompt shows `codenamegary` and a ready caret.
- [KR "harold start"] then press Enter.
- The terminal zooms out to show the server status.
- The server prints its status.
- [CAP "Generate a secure temporary pairing code"]
- [KR "harold pair"] then press Enter.
- The QR code appears.
- The last output reads `Waiting for a device to scan...`

### Scene: phone-pair

Enter: The terminal stays on the left. The phone enters right on its loading
screen. [L2C term|phone ~1.7s] [PZ:right-full]

Beats:

- The phone starts black and fades in the Harold app loading screen.
- [CAP "Pair with your agents"]
- The phone shows the Not paired state.
- [TAP "Pair"]
- [PZ:top-two-thirds ~0.5s]
- The phone holds the top-two-thirds framing.

### Scene: pair-scan

Enter: The terminal QR is on the left, showing
`Waiting for a device to scan...`. [L2C term|phone]. The phone holds [PZ:top-two-thirds].

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

### Scene: second-pair

Enter: [L1 phone ~0.8s] [PZ:full ~0.8s]. The phone returns to center. The
terminal stays off screen.

Beats:

- [CALLOUT "Pair another Harold" eyebrow="MULTI-HAROLD" hint="One phone, two Harolds." side=right]
- [TAP "Overflow menu"]
- [TAP "Pair"]
- The Pair device screen opens with the scanner. No terminal is visible.
- [TAP "Enter manually"]
- The manual pairing form appears with the Harold endpoint and Pairing code
  fields.
- [TAP "Harold endpoint field"]
- [KR "http://127.0.0.1:3848"]
- [TAP "Pairing code field"]
- [KR "instance 2 pairing code"]
- [TAP "Claim pairing code"]
- The identity screen appears with the suggested name `127.0.0.1 2`, Tide,
  and Bolt.
- [TAP "Name field"]
- [KR "Couch"]
- Leave Tide and Bolt selected.
- Dismiss the keyboard.
- [TAP "Pair"]
- The chat returns with both Harolds connected.

### Scene: sessions

Enter: The chat settles with both Harolds connected. The next caption fades
in. [L1 phone] [PZ:full].

Beats:

- [CARDS "Access your agent session history" eyebrow="SESSION HISTORY" hint="Past sessions, one tap away."]
- [TAP "Session dropdown"]
- The dropdown shows recent sessions with Harold badges and a
  `See all sessions...` item.
- [TAP "See all sessions..."]
- The Sessions screen opens with the search field, the All, Work, and Couch
  filter chips, and the merged session list.
- Each row shows a Harold badge, title, workspace, agent, and state.
- [TAP "Newest OpenCode session from Couch"]
- The Sessions screen closes and the chat opens with that session.
- The header shows the Couch badge and the session name.

### Scene: new-session

Enter: The Sessions screen closes. The chat returns with the Couch badge and
session name. The phone moves right and zooms in on the new session form.
[L2C copy|phone ~0.56s] [PZ:center-two-thirds].

Beats:

- [NOTE "Start a new Session" label="MAKE SOME HISTORY"]
- [TAP "Session dropdown"]
- [TAP "New session"]
- Wait for the New session screen to populate.
- [TAP "Workspace dropdown"]
- The menu shows `New workspace` and workspaces from both Harolds, each with a
  Harold badge and path.
- [TAP "harold under Work"]
- [TAP "Agent dropdown"]
- The menu shows Cursor and pi ACP.
- [TAP "Cursor"]
- [TAP "Workspace dropdown"]
- Scroll if needed.
- [TAP "yuekbox under Couch"]
- [TAP "Agent dropdown"]
- [TAP "OpenCode"]
- [TAP "Continue"]
- [L1 phone ~0.8s] [PZ:full ~0.8s]
- The phone pulls back to center as the session is created.

### Scene: text-chat

Enter: The New session screen closes. The chat returns with the new session
selected. The composer shows the model, mode, and thinking chips. [L1 phone]
[PZ:full].

Beats:

- [TAP "Model chip"]
- [PZ:lower-center ~0.55s]
- The Model sheet opens.
- [CALLOUT "Model list from your Agent" eyebrow="YOUR AGENT" hint="Pick one to continue." compact placement=edge connector=T]
- [TAP "Search models"]
- [KR "deepseek"]
- [TAP "deepseek/DeepSeek V4.1 Flash 1017"]
- [PZ:lower-center scale=2.4 focus=0.5,0.81 ~0.55s]
- [CAP "Toggle modes supported by your agent"]
- [TAP "Mode chip until PLAN"]
- Wait 2s.
- [TAP "Mode chip until BUILD"]
- Wait 2s.
- [PZ:lower-right ~0.55s]
- [CAP "Adjust thinking effort"]
- [TAP "Thinking bars"]
- Wait 1s.
- [TAP "Thinking bars"]
- Wait 1s.
- [TAP "Thinking bars"]
- Wait 1s.
- If the toast is not `Thinking set to High`, tap once more and wait 1s.
- [PZ:upper-center ~0.55s]
- [CAP "Slash commands from your agent"]
- [TAP "Slash button"]
- The Commands panel opens with `/init`, `/review`, and `/compact`.
- [TAP "Close command list"]
- [PZ:lower-center scale=2.4 focus=0.5,0.81 ~0.55s]
- [CAP "Send a text Prompt"]
- [KR "Do you think my cat's behaviour is strange?"]
- Wait 2s.
- Do not send the prompt. Leave it drafted.
- [CAP "Attachments"]
- [PZ:full ~0.55s]
- [TAP "Attach photo"]
- Wait for the photo picker.
- [TAP "Third cat picture"]
- [TAP "Add (1)"]
- [TAP "Attach files"]
- [TAP "cat-diary.txt"]
- [PZ:lower-center scale=1.8 focus=0.5,0.84 ~0.55s]
- [TAP "Send message"]
- Wait for the response.
- [PZ:upper-center focus=0.5,0.33 drift=0.22 ~0.55s]
- The reply settles.

### Scene: voice-chat

Enter: The text reply settles. [L1 phone] [PZ:full].

Beats:

- [TAP "Dictate with voice"]
- The inline voice rail opens and starts listening.
- [PZ:lower-center scale=1.9 focus=0.5,0.9 ~0.55s]
- The mic control reads `Mute voice input`, and the transcript begins to appear.
- [TAP "Expand voice input"]
- The full-screen overlay opens with `Collapse voice input` and
  `Switch to keyboard input`.
- [PZ:upper-center scale=1.5 focus=0.5,0.22 ~0.55s]
- Play `voice-input.wav` as the virtual mic input.
- [TAP "Send message"]
- Wait for the response.
- [PZ:upper-center focus=0.5,0.33 drift=0.22 ~0.55s]
- The reply settles.

### Scene: outro

Enter: The voice reply settles. The phone fades out. The outro fades in.

Beats:

- Harold logo.
- Subtitle "Hark! The Harold Agents Sing".
- CTA `bun install -g @codenamegary/harold@latest`.
- `harold.codenamegary.com`.
