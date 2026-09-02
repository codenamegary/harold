# Composer attachment buttons, dynamically gated by agent capabilities

## Context

Chat composers on web and Android are text-only. ACP agents advertise prompt capabilities in
the initialize response (`promptCapabilities.image`, `promptCapabilities.embeddedContext`).
The server already parses that response at spawn and ships the full inventory to both clients
via `AgentSettings.capabilities`:

- Web: `useAgentSettingsQuery` → `selectedAgent.capabilities` (already in `ChatShell` scope)
- Android: `AgentCapabilityInventory` (`contracts/AgentSettings.kt`, fetched via `AgentApi`)

So dynamic discovery is solved. What is missing is the composer UI: when the selected agent
advertises `image`, show a photo button; when it advertises `embeddedContext`, show an attach
(files) button. No advertisement, no buttons.

Outcome for this slice: buttons appear and disappear dynamically per agent, on both
platforms, plus a standalone HTML mockup of both composers for design discussion.

**Deferred to follow-up slices** (contracts exist unchanged in the meantime): upload
endpoint, hub mapping to ACP content blocks, prompt payload changes, transcript rendering of
attachments.

## Approach

**Gating derives from capability inventory entries.** `AgentCapabilityInventory.entries`
contains an entry with `path: "promptCapabilities.image"` (or `.embeddedContext`) and
`advertised: true` when the agent supports it. Known paths are always present with
`advertised: false` when absent, so a simple lookup suffices on both platforms.

- Web: small helper `advertisesCapability(inventory, path)` + derived booleans
  `supportsImages` / `supportsFiles` in `ChatShell`, passed to `ChatComposer` as props.
  Capability path strings live only in the helper.
- Android: same helper shape in `chat/composer/ComposerCapabilities.kt`. Flags flow through
  `ChatUiState` into `PromptComposer` (same pattern as `voiceMicEnabled`).

**Web composer placement.** Two icon buttons in the existing bottom bar of `ChatComposer`,
left side (where the `⌘↵ to send` hint lives today; hint stays). Photo button gated on
`supportsImages`, paperclip on `supportsFiles`. Hidden buttons occupy no space (composer
looks identical to today for capability-less agents).

**Android composer placement.** Two `AgentIconButton`s in `TextActionRail` after
`SlashButton`, before the `Spacer(weight(1f))`: `AttachFile` icon (embeddedContext) and
`AddPhotoAlternate` icon (image). Same conditional rendering pattern.

**Buttons before upload exists.** This slice wires gating and selection state only. Click
handlers open the native picker (web: file input with `accept` per capability; Android: Photo
Picker / SAF intent) and hold selections in component state with a chip row above the input.
Nothing is sent yet; prompts remain text-only until the upload/prompt slice lands. Alternative
if preferred: buttons render but clicks are stubs.

**Mockup first, interactive, served locally.** A self-contained HTML file at
`prototype/composer-attachments/index.html` (no build step, temporary/discussion artifact),
recreated from the real UI code and design tokens, served over localhost for review.

Mockup contents (static data only, no server dependency):

- **Web composer** cloned from `ChatComposer.tsx`: 840px column, inner panel `#0a0d12`,
  border `#303845`, 9px radius, `min-h-[88px]` input area, bottom bar with `⌘↵ to send` hint
  left and lime 27px send button right.
- **Android composer** cloned from `PromptComposer.kt`: phone frame, 24dp-radius
  `surfaceContainerHigh` surface, text slot, action rail with slash button left, spacer,
  mic + lime send right.
- **Interactive capability toggles**: image / embeddedContext checkboxes per composer.
  Unchecking hides the buttons live, demonstrating the dynamic gating this feature delivers.
- **Interactive buttons**: clicking photo or attach opens the expandable file/photo panel
  above the input, per platform styling.
- **File/photo list panel**: the expandable panel with a static attachment list — file rows
  (name, size, mime badge, remove button) and a photo thumbnail strip (CSS-generated
  thumbnails, names like `screenshot-2025-01-15.png`). Chips also appear in a pending row
  above the input once "added".
- **Design options to compare** (the point of the mockup):
  - Web placement A: buttons bottom-left in the hint bar
  - Web placement B: buttons clustered right next to send
  - Web variant C: single paperclip with image/file choice popover
  - Panel style 1: compact chip row above input
  - Panel style 2: full expandable list panel with thumbnails
  - Android rail: two buttons after slash vs grouped with mic
- Serve with `python3 -m http.server` or `npx http-server` from the prototype dir; user opens
  the URL in a browser to review and pick options.

## Files to modify

New — mockup:

- `prototype/composer-attachments/index.html` — standalone, no build step, temporary
  discussion artifact. Full interactive spec in Approach above: both composers in real
  tokens, capability checkboxes, working panel toggles, static file/photo data, placement
  and panel-style options side by side.

Web (`apps/web/src`):

- `chat/composer/capabilities.ts` (new) + `capabilities.test.ts` — `advertisesCapability`
  lookup over inventory entries
- `chat/ChatShell.tsx` — derive `supportsImages` / `supportsFiles` from `selectedAgent`,
  pass to composer
- `chat/composer/ChatComposer.tsx` — new props, conditional icon buttons, hidden file inputs
  (`accept="image/*"` vs unrestricted), chip row for pending selections (component state)
- `chat/composer/composer.test.tsx` — button hidden without capability, shown with it,
  picker opens, chip appears

Android (`apps/android/app/src/main/java/server/agent/android`):

- `chat/composer/ComposerCapabilities.kt` (new) + test — same lookup over
  `AgentCapabilityInventory`
- `chat/ChatScreen.kt` / chat ViewModel + `ChatUiState` — `supportsImages` /
  `supportsFiles` flags from the selected agent's settings
- `chat/composer/PromptComposer.kt` — new props + conditional `AgentIconButton`s in
  `TextActionRail`, picker launchers, chip row
- `res/values/strings.xml` — content descriptions for both buttons

## Reuse

- `AgentCapabilityInventory` shape: `packages/contracts/src/http/agent-settings.ts` (zod) and
  `apps/android/.../contracts/AgentSettings.kt` (kotlinx) — already parsed on both platforms
- Web gating precedent: `ChatShell` already resolves `selectedAgent` from
  `useAgentSettingsQuery` (`apps/web/src/agent-settings/use.agent.settings.query.ts`)
- Android composer slot pattern: `AgentIconButton` with `testTag` in `TextActionRail`
  (`PromptComposer.kt`), flag threading like `voiceMicEnabled`
- Design tokens: `apps/web/src/index.css` CSS variables, `apps/android/.../ui/theme/Color.kt`
- Icon precedent: lucide-react on web (`Paperclip`, `ImagePlus` icons already available in
  the dependency), material icons on Android
- `prototype/` directory convention for throwaway UI artifacts

## Steps

- [ ] 1. Build `prototype/composer-attachments/index.html` per the mockup spec in Approach:
      interactive capability toggles, clickable buttons opening the file/photo list panel,
      static attachment data, placement + panel-style options for comparison. Serve it on
      localhost (`python3 -m http.server` or `npx http-server`) and hand the URL to the
      user. User picks options before implementation starts.
- [ ] 2. Web helper: `capabilities.ts` + tests (`promptCapabilities.image`,
      `promptCapabilities.embeddedContext`, missing/absent inventory).
- [ ] 3. Web wiring: `ChatShell` derives and passes flags; `ChatComposer` renders buttons
      conditionally, opens pickers, holds chip state. Composer tests for all states.
- [ ] 4. Android helper: `ComposerCapabilities.kt` + unit test.
- [ ] 5. Android wiring: flags through `ChatUiState` → `PromptComposer`; rail buttons,
      pickers, chips; strings + test tags. Compose UI test where the suite has precedent.
- [ ] 6. `bun run check` and Android unit tests green.

## Verification

- Mockup: open `prototype/composer-attachments/index.html` in a browser; toggling
  capability checkboxes shows/hides buttons on both composers.
- Web: `bun run test --filter web` — new composer tests assert button absence with empty
  inventory, photo-only with `image` advertised, both with `image` + `embeddedContext`;
  manual run: select agents with and without capabilities and watch the composer change.
- Android: unit test for `ComposerCapabilities`; manual on emulator: pick a capability-less
  agent (buttons absent) vs one advertising both (buttons present, pickers launch).
- Gating is client-visual only in this slice; no prompt payloads change, so server tests are
  untouched.

## Open questions (defaults chosen, adjust on review)

1. Web button placement: bottom-left bar (recommended) vs right side next to send.
2. Click behavior now: native pickers + chip state (recommended) vs visual stubs only.
3. Two buttons on web desktop, or collapse to one paperclip with an image/file choice?
