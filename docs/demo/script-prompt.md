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
