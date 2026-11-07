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

Harold puts the AI coding agents on your computers in your pocket.

It is an Android SSH client for your own agent setup. Harold connects to your machines over SSH and gives you a clean mobile workspace for the sessions you already run. No account. No relay. Your prompts and code travel over SSH to machines you control.

WHAT YOU CAN DO

- Add a host and sign in with your SSH credentials.
- Start a session in any workspace on that host.
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

Harold works with any agent that speaks the Agent Client Protocol (ACP). Use the agents you already trust, including Cursor, Claude, Codex, OpenCode, Gemini CLI, GitHub Copilot, goose, and more. Harold does not bundle a model or an agent. It runs them on your machines over SSH.

HOW IT WORKS

1. Install an ACP-compatible coding agent on a machine you can reach with SSH.
2. Add that host in the Harold app.
3. Sign in with your SSH credentials and start a session.

Your phone talks straight to the host over SSH. No extra ports, no extra services, no account.

REQUIREMENTS

- Android 11 or newer.
- A host you can reach with SSH that runs an ACP-compatible coding agent.
- An SSH account on that host that can run the agent.

PRIVACY

Harold has no account and no developer-operated relay. Your SSH credentials are stored encrypted on your phone. Prompts, attachments, session state, and agent output travel between your phone and your hosts over SSH. Voice dictation uses an on-device English model. The transcript is sent with your prompt when you send it.

Links:

- Website: https://harold.codenamegary.com
- Source and issues: https://github.com/codenamegary/harold
- Privacy policy: TODO

## Graphics

| Asset              | File                           | Size              | Play limit |
| ------------------ | ------------------------------ | ----------------- | ---------- |
| App icon           | `app-icon-512x512.png`         | 512 x 512 PNG     | 1 MB       |
| Feature graphic    | `feature-graphic-1024x500.png` | 1,024 x 500 PNG   | 15 MB      |
| Phone screenshot 1 | `phone-01-connect.png`         | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 2 | `phone-02-sessions.png`        | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 3 | `phone-03-plan.png`            | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 4 | `phone-04-answer.png`          | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 5 | `phone-05-build.png`           | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 6 | `phone-06-changes.png`         | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 7 | `phone-07-worktrees.png`       | 1,080 x 1,920 PNG | 8 MB       |
| Phone screenshot 8 | `phone-08-ship.png`            | 1,080 x 1,920 PNG | 8 MB       |

The icon is a full-bleed square with no alpha and no rounded corners. Play applies its own launcher mask.

Each screenshot is a full app screen captured on a phone, placed on a 9:16 canvas. The full app screen is kept.

## Screenshot order

1. **Connect**: Add an SSH host and your machines are in your pocket.
2. **Sessions**: Every session in reach.
3. **Plan**: Plan with your agent and attach context.
4. **Answer**: Answer agent questions inline.
5. **Build**: Build from the couch. Watch usage and cost.
6. **Changes**: Review every diff.
7. **Worktrees**: Switch worktrees without a laptop.
8. **Ship**: Ask for the draft PR. Ship it.

## App access for review

Harold connects to your machines over SSH. There is no Harold service, account, or hosted environment, so there is nothing to unlock for review.

A reviewer can install the app and connect it to any SSH host they control:

- Host: any machine reachable over SSH. A small VPS works.
- Agent: install any ACP-compatible coding agent on that host.
- Sign in: the reviewer's own SSH credentials.

The app only needs one host that runs SSH and an ACP agent.

## Foreground service declaration

Play Console asks for the foreground service type, a description, the user impact if the task is deferred or interrupted, and a demo video.

- Type: **Special use**
- Video: `foreground-service-demo.mp4` — host the file at a public URL for the declaration form

Description:

> Harold lets the user start and monitor AI coding sessions from the app. While one or more sessions are active, a foreground service keeps the connection to the session event stream open so the user receives live progress and prompts that need their input. The service stops when no sessions are active.

User impact if deferred:

> If the service cannot start, Android may stop the app in the background. The user stops receiving live session progress and input prompts until they reopen the app.

User impact if interrupted:

> If the system stops the service, the session event stream disconnects. The notification disappears and the user may not see that a session is waiting for input.

## Data safety draft

Review this against the current Play data safety form before submitting.

- The developer does not collect or share data.
- The app sends prompts, attachments, and session state to the SSH host you configure.
- Microphone access is used only for voice dictation. Audio is processed on device by the bundled English Vosk model.
- App data can be deleted by clearing Android app data. Host data stays on your machines and can be deleted there.

## Content rating draft

The app is a utility for developers. It does not include ads or purchases. It has no built-in violent, sexual, or substance content. Agent output and user prompts can contain arbitrary text. Answer the Play content rating questionnaire in the console and confirm the final rating.

## Before publishing

- [ ] Publish the privacy policy and replace the TODO link.
- [ ] Confirm the contact email in Play Console.
- [ ] Complete the Foreground Service permissions declaration with a public URL for the demo video.
- [ ] Complete the Data safety form.
- [ ] Complete the Content rating questionnaire.
- [ ] Confirm the app name and short description character counts.
- [ ] Upload the icon, feature graphic, and eight screenshots in the order above.
- [ ] Add the app to the internal testing track and install from Play.
