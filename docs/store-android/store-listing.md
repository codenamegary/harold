# Google Play store listing

Package: `harold.android`

Version: `3.4.0`

## Store settings

| Field            | Value                                             |
| ---------------- | ------------------------------------------------- |
| App name         | Harold: Agents on the Go                          |
| Category         | Tools                                             |
| Price            | Free                                              |
| Contains ads     | No                                                |
| In-app purchases | No                                                |
| Minimum Android  | Android 11 (API 30)                               |
| Contact email    | gary@codenamegary.com                             |
| Website          | https://harold.codenamegary.com                   |
| Support          | https://github.com/codenamegary/harold/issues     |
| Privacy policy   | TODO: publish `privacy-policy.md` at a public URL |

## App name (30 characters max)

Harold: Agents on the Go

## Short description (80 characters max)

Control your AI coding agents from your phone. Plan, build, review, and ship.

## Full description (4,000 characters max)

Harold puts the AI coding agents on your computer in your pocket.

It is an Android client for your own agent setup. Harold pairs with the Harold CLI on your machine and gives you a clean mobile workspace for the sessions you already run. No account. No Harold cloud relay. Your prompts and code go to the server you choose.

WHAT YOU CAN DO

- Pair with a QR code from your terminal.
- Start a session in any workspace on your machine.
- Pick your ACP agent, model, and mode.
- Use Plan mode to think before you edit.
- Attach photos and files to a prompt.
- Dictate prompts with on-device English voice input.
- Answer agent questions without leaving the chat.
- Watch context usage and cost as the session runs.
- Review every changed file and diff.
- Switch between git worktrees.
- Ask your agent to open a draft pull request.

BUILT FOR YOUR OWN AGENTS

Harold works with any agent that speaks the Agent Client Protocol (ACP). Use the agents you already trust, including Cursor, Claude, Codex, OpenCode, Gemini CLI, GitHub Copilot, goose, and more. Harold does not bundle a model or an agent. It connects to the tools on your machine.

HOW IT WORKS

1. Install the Harold CLI on the computer where your agents run.
2. Run `harold setup`, then `harold start`.
3. Run `harold pair` and scan the QR code with the app.

Your phone talks directly to the Harold instance you run. Use a trusted local network, Tailscale, a reverse proxy, or a tunnel. Use HTTPS for any endpoint outside your network.

REQUIREMENTS

- Android 11 or newer.
- A computer that can run Bun and the Harold CLI.
- An ACP-compatible coding agent.
- A network route from your phone to that computer.

PRIVACY

Harold has no account and no developer-operated cloud relay. Your pairing credential is stored encrypted on your phone. Prompts, attachments, session state, and agent output travel between your phone and the Harold server you pair with. Voice dictation uses an on-device English model. The transcript is sent with your prompt when you send it.

Links:

- Website: https://harold.codenamegary.com
- Source and issues: https://github.com/codenamegary/harold
- Privacy policy: TODO

## Graphics

| Asset              | File                           | Size              | Play limit |
| ------------------ | ------------------------------ | ----------------- | ---------- |
| App icon           | `app-icon-512x512.png`         | 512 x 512 PNG     | 1 MB       |
| Feature graphic    | `feature-graphic-1024x500.png` | 1,024 x 500 PNG   | 15 MB      |
| Phone screenshot 1 | `phone-01-pairing.png`         | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 2 | `phone-02-sessions.png`        | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 3 | `phone-03-plan.png`            | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 4 | `phone-04-answer.png`          | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 5 | `phone-05-build.png`           | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 6 | `phone-06-changes.png`         | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 7 | `phone-07-worktrees.png`       | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 8 | `phone-08-ship.png`            | 1,080 x 1,920 PNG | 8 MB       |

The icon is a full-bleed square with no alpha and no rounded corners. Play applies its own launcher mask.

The screenshots come from the recorded demo walk in `docs/demo/render/public/slices`. Each 9:20 phone frame is placed on a 9:16 canvas. The full app screen is kept.

## Screenshot order

1. **Pairing**: Pair once and your machine is in your pocket.
2. **Sessions**: Every session in reach.
3. **Plan**: Plan with your agent and attach context.
4. **Answer**: Answer agent questions inline.
5. **Build**: Build from the couch. Watch usage and cost.
6. **Changes**: Review every diff.
7. **Worktrees**: Switch worktrees without a laptop.
8. **Ship**: Ask for the draft PR. Ship it.

## App access for review

Harold needs a reachable Harold server and a paired device. A reviewer cannot pass the pairing screen without one.

The public review server is the demo Harold at `https://harold-demo.codenamegary.com`. In Play Console under **App access**, provide:

- Endpoint: `https://harold-demo.codenamegary.com`
- Pairing code: `DEM-O01`
- QR code URL: `https://harold-demo.codenamegary.com/review-pairing-qr.png`
- QR file: `review-pairing-qr.png` (the same image, for upload)

The reviewer can scan the QR code with the app or enter the endpoint and code by hand. The demo server serves the QR from the public URL and redeploys when the checked-in image changes. The demo server accepts any code shaped `XXX-XXX`, so the code does not expire. Each claim creates a fresh demo device, and the credential stays valid across demo server restarts.

The QR encodes `harold://pair?v=1&endpoint=https%3A%2F%2Fharold-demo.codenamegary.com&code=DEM-O01`.

## Foreground service declaration

Play Console asks for the foreground service type, a description, the user impact if the task is deferred or interrupted, and a demo video.

- Type: **Special use**
- Video: `https://harold-demo.codenamegary.com/foreground-service-demo.mp4`
- File: `foreground-service-demo.mp4`

Description:

> Harold lets the user start and monitor AI coding sessions from the app. While one or more sessions are active, a foreground service keeps the connection to the session event stream open so the user receives live progress and prompts that need their input. The service stops when no sessions are active.

User impact if deferred:

> If the service cannot start, Android may stop the app in the background. The user stops receiving live session progress and input prompts until they reopen the app.

User impact if interrupted:

> If the system stops the service, the session event stream disconnects. The notification disappears and the user may not see that a session is waiting for input.

## Data safety draft

Review this against the current Play data safety form before submitting.

- The developer does not collect or share data.
- The app sends prompts, attachments, session state, and device pairing data to the Harold server you configure.
- Camera access is used only to scan pairing QR codes.
- Microphone access is used only for voice dictation. Audio is processed on device by the bundled English Vosk model.
- App data can be deleted by clearing Android app data. Server data can be deleted on the host.

## Content rating draft

The app is a utility for developers. It does not include ads or purchases. It has no built-in violent, sexual, or substance content. Agent output and user prompts can contain arbitrary text. Answer the Play content rating questionnaire in the console and confirm the final rating.

## Before publishing

- [ ] Publish the privacy policy and replace the TODO link.
- [ ] Confirm the contact email in Play Console.
- [ ] Provide review access to the demo server with the hosted QR URL.
- [ ] Complete the Foreground Service permissions declaration with the hosted video URL.
- [ ] Complete the Data safety form.
- [ ] Complete the Content rating questionnaire.
- [ ] Confirm the app name and short description character counts.
- [ ] Upload the icon, feature graphic, and eight screenshots in the order above.
- [ ] Add the app to the internal testing track and install from Play.
