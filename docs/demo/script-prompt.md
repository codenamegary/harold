# Harold Remotion Prompt

## Features to highlight

- Pairing
- Multiple-agent support 
- Connecting to existing sessions
- Creating a new session
- Text Chat
- Voice Chat
- Attachments
- Pairing
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

- Seed the five fixed OpenCode demo sessions on instance 2, newest first. Make sure they are the newest sessions so unrelated global OpenCode history cannot appear.
- Seed one fixed Cursor or pi session on instance 1 so the session list can show both Harold badges.
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
- Harold server starts and displays status in the terminal
- [CAP] Generate a secure temporary pairing code
- [KR] The user types "harold pair" and hits enter
- The QR Code output is displayed
- The last output says "waiting for device..."

### Transition

- [CAP] Harold'ing...
- The terminal zooms far out and becomes mostly transparent, slides far to the left, overflowing the left side of the screen and partly out of frame
- A phone appears from the right
- Phone animates in to front and center
- Phone starts black and quickly fades in the Harold app loading screen

### Scene 2: Phone

- [CAP] Pair with your agents
- The phone starts with the Harold app loading screen
- The initial "not connected yet" state appears
- [TAP] The users presses "pair"

### Transition

- Everything is animated
- The remotion screen splits vertically
- The terminal with the qr code is on the left, opacity animates back to 1, size and zoom animate as well
- The terminal is zoomed in on the last line saying "waiting for device..."
- The right side is the phone

### Scene 3: Pairing w/Camera

- The phone pair camera view launches on the right with the video of the qr code, simulating that the camera is pointed at a laptop screen where the qr code is shown
- The camera simulation displays for about 3s
- The terminal goes to "device connected" state and returns to the codenamegary prompt with flashing caret ready for input
- The phone follows the normal flow back to the connected state home screen

### Transition

- [CAP] Achievement Unlocked: Work from Couch
- The terminal zooms out again and opacity fades, it returns to the scene 2 position
- The remotion screen is no longer split vertically
- The phone animates back to its scene 2 position

### Scene 4: Session History

- [CAP] Access your agent session history
- [TAP] The user taps the session dropdown at the top left of the screen
- The session dropdown takes a moment to load
- [TAP] The user taps on the first available session

### Scene 5: New Session

- [CAP] Start a new session
- [TAP] The session dropdown in the header
- [TAP] The 'New Session' item
- (wait for new session screen to populate)
- [TAP] Workspace dropdown
- [TAP] harold option
- [TAP] Agent dropdown
- [TAP] OpenCode option
- [TAP] Continue button

### Scene 6: Text Chat

- [CAP] Model list from your Agent
- [TAP] Model list launcher
- [TAP] Model search input
- [KR] Type 'deepseek', do not press enter
- [TAP] 'deepseek 4.1 flash' from the list
- [CAP] Toggle modes supported by your agent
- [TAP] 'Build' in mode toggle, wait 2s
- [TAP] 'Plan' in mode toggle, wait 2s
- [CAP] Adjust thinking effort
- [TAP] Effort level, wait 1s
- [TAP] Effort level, wait 1s
- [TAP] Effort level, wait 1s
- [CAP] Send a text Prompt
- [KR] type 'Do you think my cat's behaviour is strange?', wait 2s
- Do not send prompt, leave it drafted
- [CAP] Attachments
- [TAP] Photo attachment, wait for photo picker
- [TAP] The 3rd cat picture
- [TAP] Add (1) at the bottom right
- [TAP] The file attachment
- [TAP] The cat-diary.txt file
- [TAP] The 'send' button
- Wait for response from agent to complete

### Scene 7: Voice Chat

- [TAP] The 'voice' button
- [TAP] The 'expand' button to expand to the full screen voice input
- Play 'voice-input.wav' as a virtual mic input
- [TAP] Send
- Wait for the response from the agent to complete

### Outro

- Similar to the intro slide
- CTA to install Harold
- harold.codenamegary.com on the slide
