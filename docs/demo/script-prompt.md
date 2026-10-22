# Harold Remotion Prompt

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

## Phone Capture Setup (capture.sh)

`capture.sh` owns the full capture environment. The setup must live in the script. Do not depend on instructions in a skill.

### Instances

- Run both instances from this checkout with `bun run dev` so every command uses `apps/cli/src/main.ts`, not a globally installed `harold`.
- Instance 1: `HAROLD_HOST=127.0.0.1`, `HAROLD_PORT=3847`, `HAROLD_DATA_DIR=~/.harold-demo-3847`.
- Instance 2: `HAROLD_HOST=127.0.0.1`, `HAROLD_PORT=3848`, `HAROLD_DATA_DIR=~/.harold-demo-3848`.
- Write a separate `settings.yml` for each instance. Set `advertisedUrl` to `http://127.0.0.1:<port>`, `bindHost` to `127.0.0.1`, `bindPort` to the instance port, and `allowedRoots` to the instance workspace root.
- Stop any previous instance 1 or instance 2 by its data dir or daemon state. Do not stop the user's real `~/.harold` daemon.
- Remove the previous demo data dirs, create fresh DBs, and register the agents and workspaces again. Do not copy `~/.harold/harold.db` or any previous demo DB.
- Start both instances from the fresh data dirs. Fail if another process owns port 3847 or 3848.
- The workspace roots are outside the data dirs. Removing a data dir must not remove a workspace.

### Agents

- Instance 1: enable `cursor` and `pi-acp`.
- Instance 2: enable `opencode`.
- Use the exact agent IDs. The pi agent is `pi-acp`, not `pi`.
- Verify each enabled agent is present and available. Check auth for any agent that needs it. Enabling alone is not enough.

### Workspaces

- Instance 1 workspace root: `~/harold-demo-workspaces/3847`.
- Instance 2 workspace root: `~/harold-demo-workspaces/3848`.
- Instance 1 workspaces:
  - Clone `git@personal:codenamegary/harold.git` into `harold`.
  - Create local repos `cat-screensaver`, `fish-screensaver-for-cats`, and `meow`.
- Instance 2 workspaces:
  - Clone `git@personal:codenamegary/yuekbox.git` into `yuekbox`.
  - Create local repos `pet-me-human`, `thesis-research`, `qbert-nextgen`, and `elt-meeting-agenda`.
- Keep existing workspace directories. Do not delete them.
- If a clone is missing, clone it. If it exists, run `git pull --ff-only`. Fail with a clear message if the pull fails.
- If a local repo is missing or empty, run `git init` and make an initial commit. Leave existing content alone.
- Re-register every workspace path on each fresh DB. The DB reset loses the rows. The directories stay.

### Demo values

- Instance 1 identity: name `Work`, color Violet, icon Harold mark.
- Instance 2 identity: name `Couch`, color Tide, icon Bolt.
- Instance 2 manual pairing endpoint: `http://127.0.0.1:3848`.
- Main chat target: instance 2 workspace `yuekbox` with agent `opencode`.

### Session history

- Purge the demo workspace OpenCode history on instance 2, then seed the five fixed OpenCode demo sessions, newest first, so repeated captures cannot stack duplicate rows.
- Seed one fixed pi session on instance 1 so the session list can show both Harold badges.
- Do not copy sessions from `~/.harold` or a previous demo DB.

### Pairing codes and ports

- Generate the instance 1 pairing code with the loopback endpoint immediately before composing the camera feed.
- Generate the instance 2 pairing code with the loopback endpoint immediately before the manual pairing scene. Pairing codes live 10 minutes. Do not generate it at setup start.
- Set `adb reverse tcp:3847 tcp:3847` and `adb reverse tcp:3848 tcp:3848` after every emulator boot. Verify both mappings.

### Camera and audio

- Compose the instance 1 live QR into the staged camera clip.
- Copy the composed feed to a short `/tmp/opencode/harold-camera-live.mp4` path before boot. The emulator's videofile camera fails on long paths.
- Boot the emulator with the videofile back camera and an emulated front camera.
- Prepare the WAV microphone input and compile the audio environment shim.

### Emulator and app

- Stop the capture AVD. Boot it with `-wipe-data`, `-allow-host-audio`, `-gpu swiftshader_indirect`, `-no-snapshot`, and `-feature VideoPlayback`.
- Enable dark mode and hide system error dialogs before launching the app.
- Set the demo clock, battery, network, and notification state.
- Build and install `harold.android.debug` from this checkout.
- Clear app data once before the recorded run.
- Grant camera, notifications, and record audio permissions.
- Push the cat photos and `cat-diary.txt`. Rescan MediaStore so the pickers see them.

### Driver and artifacts

- Run `drive_phone.py` after the app is installed and the reverses are set.
- Pull the recorded slices, run `build_capture.py`, and write `docs/demo/render/public/capture.json`.
- Do not reuse slices or captures from a previous run.

### Preflight

- Check `bun`, `adb`, `node`, `ffmpeg`, `ffprobe`, `python3`, `cc`, `sqlite3`, a JDK, the Android SDK, and the emulator.
- Check that ports 3847 and 3848 are free before starting.
- Check SSH access to the two clone remotes.
- Fail before changing anything if a check fails.


## Routines

- [KR] Keystroke Routine - Every keystroke makes a sound, a separate sound is played when the user hits 'Enter'
- [TAP] Tap Routine - Every time the user taps, a quick animation is overlayed at the part of the phone screen where the user tapped and a sound is played
- [CAP] Caption Routine - Display the specified caption, animate in and out, subtle but classy animation, a subtle 'ping' sound when the caption appears

## Scenes

### INTRO SLIDE

- Harold Logo
- Subtitle "Hark! The Harold Agents Sing"
- CTA bun install -g @codenamegary/harold@latest

### Transition

- The intro text slide fades out
- The terminal zooms in

### Scene 1: Terminal

- [CAP] Start Harold wherever you run your agents
- Starts zoomed in on a terminal, very close
- The terminal prompt says "codenamegary" as the username, with a flashing caret ready for input
- [KR] The user types "harold start" and hits enter
- The terminal zooms out quickly to display enough screen real-estate for the server status to display
- The Harold server starts and displays its status in the terminal
- [CAP] Generate a secure temporary pairing code
- [KR] The user types "harold pair" and hits enter
- The QR code output is displayed
- The last output says "Waiting for a device to scan..."

### Transition

- [CAP] Harold'ing...
- The terminal zooms far out and becomes mostly transparent, slides far to the left, overflowing the left side of the screen and partly out of frame
- A phone appears from the right
- The phone animates in to front and center
- The phone starts black and quickly fades in the Harold app loading screen

### Scene 2: Phone

- [CAP] Pair with your agents
- The phone starts with the Harold app loading screen
- The initial "Not paired" state appears
- [TAP] The user presses "Pair"

### Transition

- Everything is animated
- The remotion screen splits vertically
- The terminal with the QR code is on the left, opacity animates back to 1, size and zoom animate as well
- The terminal is zoomed in on the last line saying "Waiting for a device to scan..."
- The right side is the phone, showing the Pair device scanner

### Scene 3: Pairing w/Camera

- The phone pair camera view launches on the right with the video of the QR code, simulating that the camera is pointed at a laptop screen where the QR code is shown
- The camera simulation displays for about 3s
- The scanner is replaced by the Harold identity screen. It shows a badge preview, the Name field, the Color row, the Icon row, and the Pair button.
- [TAP] The Name field
- [KR] Clear the suggested name and type "Work"
- Leave Violet and Harold mark selected
- Dismiss the keyboard
- [TAP] The "Pair" button
- The terminal goes to the "Device paired." state and returns to the codenamegary prompt with a flashing caret ready for input
- The phone follows the normal flow to the chat screen with the Work badge

### Transition

- [CAP] Achievement Unlocked: Work from Couch
- The terminal zooms out again and opacity fades, it returns to the scene 2 position
- The remotion screen is no longer split vertically
- The phone animates back to its scene 2 position
- The phone is on the chat screen with the Work badge
- The terminal stays off-screen for the rest of the video

### Scene 4: Pair Another Harold

- [CAP] Pair another Harold
- [TAP] The overflow menu in the top right of the chat screen
- [TAP] "Pair" in the menu
- The Pair device screen opens with the scanner. No terminal is visible.
- [TAP] "Enter manually" below the scanner
- The manual pairing form appears with the Harold endpoint and Pairing code fields
- [TAP] The Harold endpoint field
- [KR] Type "http://127.0.0.1:3848"
- [TAP] The Pairing code field
- [KR] Type the instance 2 pairing code
- [TAP] "Claim pairing code"
- The Harold identity screen appears with the suggested name "127.0.0.1 2", Tide, and Bolt
- [TAP] The Name field
- [KR] Clear the suggested name and type "Couch"
- Leave Tide and Bolt selected
- Dismiss the keyboard
- [TAP] The "Pair" button
- The chat screen returns with the second Harold connected

### Transition

- The chat screen settles with both Harolds connected
- The terminal stays off-screen
- The phone remains centered
- The next caption fades in

### Scene 5: Session History

- [CAP] Access your agent session history
- [TAP] The session dropdown in the header
- The dropdown loads and shows recent sessions with Harold badges and a "See all sessions…" item
- [TAP] "See all sessions…"
- The Sessions screen opens with the search field, the All, Work, and Couch filter chips, and the merged session list
- Each row shows a Harold badge, title, workspace, agent, and state
- [TAP] The newest OpenCode session from Couch
- The Sessions screen closes and the chat opens with that session
- The header shows the Couch badge and the session name

### Transition

- The Sessions screen closes
- The selected chat returns with the Couch badge and session name
- The composer is visible

### Scene 6: New Session

- [CAP] Start a new session
- [TAP] The session dropdown in the header
- [TAP] "New session"
- Wait for the New session screen to populate
- [TAP] The Workspace dropdown
- The menu shows "New workspace" and workspaces from both Harolds, each with a Harold badge and path
- [TAP] "harold" under Work
- [TAP] The Agent dropdown
- The menu shows "Cursor" and "pi ACP"
- [TAP] "Cursor"
- [TAP] The Workspace dropdown
- [TAP] "yuekbox" under Couch. Scroll if needed.
- [TAP] The Agent dropdown
- [TAP] "OpenCode"
- [TAP] Continue

### Transition

- The New session screen closes
- The chat returns with the new session selected
- The composer shows the model, mode, and thinking chips

### Scene 7: Text Chat

- [CAP] Model list from your Agent
- [TAP] The model chip
- The Model sheet opens
- [TAP] "Search models"
- [KR] Type "deepseek", do not press enter
- [TAP] "deepseek/DeepSeek V4.1 Flash 1017"
- [CAP] Toggle modes supported by your agent
- [TAP] The mode chip until it reads "PLAN", wait 2s
- [TAP] The mode chip until it reads "BUILD", wait 2s
- [CAP] Adjust thinking effort
- [TAP] The thinking bars, wait 1s
- [TAP] The thinking bars, wait 1s
- [TAP] The thinking bars, wait 1s
- If the toast is not "Thinking set to High", tap once more and wait 1s
- [CAP] Slash commands from your agent
- [TAP] The slash button
- The Commands panel opens with "/init", "/review", and "/compact"
- [TAP] "Close command list"
- [CAP] Send a text Prompt
- [KR] Type "Do you think my cat's behaviour is strange?", wait 2s
- Do not send the prompt. Leave it drafted.
- [CAP] Attachments
- [TAP] "Attach photo", wait for the photo picker
- [TAP] The 3rd cat picture
- [TAP] "Add (1)"
- [TAP] "Attach files"
- [TAP] "cat-diary.txt"
- [TAP] "Send message"
- Wait for the response from the agent to complete

### Scene 8: Voice Chat

- [TAP] "Dictate with voice"
- The inline voice rail opens and starts listening. The mic control reads "Mute voice input", and the transcript begins to appear.
- [TAP] "Expand voice input"
- The full-screen voice overlay opens with "Collapse voice input" and "Switch to keyboard input"
- Play "voice-input.wav" as the virtual mic input
- [TAP] "Send message"
- Wait for the response from the agent to complete

### Transition

- The voice reply settles
- The phone fades out
- The outro slide fades in

### Outro

- Similar to the intro slide
- CTA to install Harold
- harold.codenamegary.com on the slide
