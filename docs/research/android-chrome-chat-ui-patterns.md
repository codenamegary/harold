# Android chrome and chat UI patterns

Checked: 2026-08-10

Scope: Material Design 3 and Android Compose patterns for top bar
navigation, overflow vs FAB, sheets vs dialogs, session color, and slash
commands in a chat composer. Tied to native Android (Jetpack Compose)
harold feedback.

Primary sources only. Product slash-command UX cites Discord and Slack
first-party docs. Those are product conventions, not Material.

## Key recommendations for this product

1. Replace text "Back" with `navigationIcon` + `Icons.AutoMirrored.Filled.ArrowBack`
   inside `TopAppBar` / `CenterAlignedTopAppBar`. That is the Compose sample
   pattern for up/back.
2. Prefer icon actions in the top bar `actions` slot. If many secondary
   actions remain, use `IconButton` + `Icons.Default.MoreVert` +
   `DropdownMenu`, not a text "More" label.
3. Use a FAB (or FAB menu) only for the screen's primary action or a small
   set of related primary actions. Do not move every overflow item onto a
   FAB.
4. To make session nav "a little less green" without changing the brand
   palette: keep primary for CTAs. Move selected/session chrome to
   `secondaryContainer`, `surfaceContainer*`, or a quieter
   `primaryContainer` tone. Generate roles with Material Theme Builder.
5. Prefer non-blocking UI for skills and commands: inline composer
   autocomplete, menus, or a standard (non-modal) bottom sheet. Keep
   modal dialogs only for high-priority confirmations.
6. Slash `/` command pickers are not a Material component. Follow chat
   product conventions (Discord / Slack style autocomplete in the
   composer). Build with text field + anchored list or sheet.

## Top app bar: back caret, not text Back

### Material 3 structure

M3 top app bars use a leading button, headline, and trailing elements
([Top app bar specs](https://m3.material.io/components/app-bars/specs)).
Specs describe a leading icon button (not text) as the start control.
Avoid packing too many trailing actions
([Top app bar specs](https://m3.material.io/components/app-bars/specs)).

Guidelines and overview pages:
[guidelines](https://m3.material.io/components/app-bars/guidelines),
[overview](https://m3.material.io/components/top-app-bar/overview)
(note path variants under `/components/app-bars/` and
`/components/top-app-bar/`).

### Compose API

`TopAppBar` exposes:

- `navigationIcon`: icon at the start. Docs say this should typically be
  an `IconButton` or `IconToggleButton`
  ([TopAppBar API](https://developer.android.com/reference/kotlin/androidx/compose/material3/TopAppBar.composable)).
- `actions`: end-of-bar actions. Docs say these should typically be
  `IconButton`s in a `Row`
  ([TopAppBar API](https://developer.android.com/reference/kotlin/androidx/compose/material3/TopAppBar.composable)).

Android Compose guide: top bars host title, core actions, and navigation
items. Parameters include `title`, `navigationIcon`, `actions`,
`scrollBehavior`, `colors`
([App bars](https://developer.android.com/develop/ui/compose/components/app-bars)).

Official navigate-from-top-bar sample uses
`Icons.AutoMirrored.Filled.ArrowBack` inside `IconButton` as
`navigationIcon`, wired to `NavController.popBackStack()`
([Navigate from top app bar](https://developer.android.com/develop/ui/compose/components/app-bars-navigate)).

Center-aligned examples in the same app-bars guide also use
`ArrowBack` for `navigationIcon` and an icon `Menu` button in `actions`
([App bars](https://developer.android.com/develop/ui/compose/components/app-bars)).

### Fit to feedback

Text "Back" is off-pattern. Use a caret/arrow `IconButton` with a
localized `contentDescription`. Keep the visible label for a11y, not as
on-screen text.

## Overflow menu vs FAB vs FAB menu

### Menus (overflow / More)

M3: use a menu for a temporary set of actions. For actions that should
stay on screen, use a toolbar instead
([Menus guidelines](https://m3.material.io/components/menus/guidelines)).

A menu opens when the user selects an icon, button, or text field, or
uses a secondary click / press-and-hold
([Menus guidelines](https://m3.material.io/components/menus/guidelines)).

Compose: implement with `IconButton` + `Icons.Default.MoreVert` +
`DropdownMenu` / `DropdownMenuItem`. Sample `contentDescription` is
"More options"
([Menus](https://developer.android.com/develop/ui/compose/components/menu),
[DropdownMenu API](https://developer.android.com/reference/kotlin/androidx/compose/material3/DropdownMenu.composable)).

### FAB

M3 component index: FABs help people take primary actions. Extended FABs
help take primary actions. FAB menu opens from a FAB to show multiple
related actions
([Components](https://m3.material.io/components),
[FAB menu overview](https://m3.material.io/components/fab-menu/overview)).

M3 all-buttons guidance: high emphasis for the primary, most important,
or most common action is Extended FAB, FAB, and FAB menu. Each screen
should contain a single prominent button for the primary action
([All buttons](https://m3.material.io/components/all-buttons)).

Compose FAB types: FAB, Small FAB, Large FAB, Extended FAB
([Floating action button](https://developer.android.com/develop/ui/compose/components/fab)).

`Scaffold.floatingActionButton` is the main action button of the screen,
typically a FAB
([Scaffold API](https://developer.android.com/reference/kotlin/androidx/compose/material3/Scaffold.composable)).

Bottom app bars may host a contained FAB for a key action
([App bars](https://developer.android.com/develop/ui/compose/components/app-bars)).

### Fit to feedback

- Drop text "More". Use `MoreVert` icon overflow if secondary actions stay
  in the top bar.
- Use a FAB when there is one clear primary action (for example create
  session, start run). Use FAB menu when several related primary actions
  share that entry point
  ([FAB menu](https://m3.material.io/components/fab-menu/overview)).
- Do not treat FAB as a dump for every former overflow item. That
  conflicts with "single prominent primary action"
  ([All buttons](https://m3.material.io/components/all-buttons)).

Note: older "speed dial" language maps to M3 **FAB menu**, not a
separate Material component name in current M3 docs
([FAB menu](https://m3.material.io/components/fab-menu/overview)).

## Dialogs vs bottom sheets (removing modals)

### Dialogs

M3: use dialogs to make sure users act on information. Variants: basic
(urgent info, alerts, quick selection, confirmation) and full-screen
(series of tasks). Dedicated to a single task. Common for high-risk
confirmations such as deleting progress
([Dialogs overview](https://m3.material.io/components/dialogs/overview)).

### Bottom sheets

M3: two variants.

- Standard: supplementary content without blocking primary content.
- Modal: appears in front of app content, disables other functionality,
  stays until confirmed, dismissed, or a required action is taken.

Content should be additional or secondary. Prefer compact window widths
([Bottom sheets overview](https://m3.material.io/components/bottom-sheets/overview)).

### Compose

`ModalBottomSheet` API text: modal bottom sheets are an alternative to
inline menus or simple dialogs on mobile, especially for long action
lists or items that need longer descriptions and icons. Like dialogs,
they appear in front of app content and disable other functionality
until dismissed
([ModalBottomSheet API](https://developer.android.com/reference/kotlin/androidx/compose/material3/ModalBottomSheet.composable)).

Compose guide shows `ModalBottomSheet` opened from an
`ExtendedFloatingActionButton`
([Bottom sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets)).

`BottomSheetScaffold` / standard sheets: co-exist with the main UI and
allow interacting with both regions
([BottomSheetScaffold API](https://developer.android.com/reference/kotlin/androidx/compose/material3/BottomSheetScaffold.composable)).

Non-dialog `BottomSheet` renders in the main tree without automatic
scrim / block. Use when a Dialog window is not desired
([BottomSheet API](https://developer.android.com/reference/kotlin/androidx/compose/material3/BottomSheet.composable)).

Messaging priority (related): snackbars are low priority and optional.
Dialogs are high priority and required
([Snackbar guidelines](https://m3.material.io/components/snackbar/guidelines)).

### Fit to feedback

"Remove modals" aligns with:

- Prefer inline UI, menus, navigation to a full screen, or **standard**
  bottom sheets for skills / command lists.
- Keep **basic dialogs** only for true confirmations and blocking
  decisions
  ([Dialogs overview](https://m3.material.io/components/dialogs/overview)).
- If a sheet is needed for a long skill list, prefer standard sheet or
  an anchored composer popup over `ModalBottomSheet`, unless you
  intentionally need a blocking choice
  ([Bottom sheets overview](https://m3.material.io/components/bottom-sheets/overview)).

## Session nav color: a little less green

Keep the brand scheme. Soften where green is applied.

Android M3 Compose color usage:

- Primary: main components, prominent buttons, active states, elevated
  surface tint.
- Secondary: less prominent components.
- Tertiary: contrasting accents.
- Selected list emphasis example uses `primaryContainer` /
  `onPrimaryContainer`. Unselected uses `surfaceVariant` / `onSurface`
  ([Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)).

Codelab: high-emphasis components such as FABs take primary roles. Not
all components should use primary. Surfaces are for backgrounds,
containers, sheets, and panes. Secondary and tertiary roles cover most
non-primary UI
([M3 design theming codelab](https://developer.android.com/codelabs/m3-design-theming)).

Generate and remap roles with Material Theme Builder (export Compose
`Color.kt` / `Theme.kt`)
([Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3),
[material-theme-builder](https://github.com/material-foundation/material-theme-builder)).

Practical mapping for "less green" session nav:

- Selected session: `secondaryContainer` + `onSecondaryContainer`, or
  `surfaceContainerHigh` + `onSurface`, instead of strong `primary` /
  loud `primaryContainer`.
- Leave primary / primaryContainer for FAB and true CTAs.
- Re-export tones if the green feels too chroma-heavy
  ([Material Theme Builder README](https://github.com/material-foundation/material-theme-builder)).

## Chat / messaging patterns in Material

M3 has no dedicated chat or conversation component in the component
catalog
([Components](https://m3.material.io/components)).

Related building blocks:

- Text fields for input
  ([Text fields](https://m3.material.io/components/text-fields/overview)).
- Lists, icon buttons, menus, sheets for surrounding chrome.
- Typography note: emphasized styles can mark unread messages
  ([Typography tokens](https://m3.material.io/styles/typography/type-scale-tokens)).

Official Compose chat sample: **Jetchat**. Focuses on conversation UI
state, text input and focus, back handling when an input panel is open,
M3 theming, and dynamic color. Not a slash-command demo
([Jetchat README](https://github.com/android/compose-samples/tree/main/Jetchat),
[compose-samples](https://github.com/android/compose-samples)).

## Slash `/` commands (product convention, not Material)

### Discord

`CHAT_INPUT` application commands are slash commands. They show up when
a user types `/`. Made of name, description, and options (arguments).
Name and description help users find the command among others. Options
validate input as the user fills the command
([Application commands](https://docs.discord.com/developers/interactions/application-commands)).

### Slack

Users invoke slash commands by typing a string in the message composer.
Structure: `/command` plus optional text after the first space. Apps
define Command, Short Description, and Usage Hint. Usage hint appears in
autocomplete when users try to invoke the command
([Implementing slash commands](https://docs.slack.dev/interactivity/implementing-slash-commands)).

### Fit to feedback

For skills reference in the agent chat composer:

- Trigger on leading `/` (Discord-style discoverability).
- Show filtered list with name + short description (Slack usage hint /
  Discord description).
- Keep the picker attached to the composer (inline overlay or non-modal
  sheet), not a separate modal flow.
- Material supplies text field + menu/list/sheet primitives only. The
  slash interaction model is a product convention.

Cursor-like composer command UX is also a product convention. No Material
spec covers it. Prefer Discord/Slack docs as the primary cited models.

## Where to browse templates and inspiration

| Source                           | Why                                                            | URL                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Material 3 site                  | Component guidelines and specs                                 | https://m3.material.io/components                                                                                                                                              |
| Material Catalog (Compose)       | Live component catalog, same samples as API docs, theme picker | https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/integration-tests/material-catalog                                                         |
| Play: Material Catalog           | Installable catalog app                                        | listed from [compose-samples README](https://github.com/android/compose-samples)                                                                                               |
| Jetchat                          | Official chat UI sample (composer, conversation, M3)           | https://github.com/android/compose-samples/tree/main/Jetchat                                                                                                                   |
| Reply                            | M3 theming, adaptive layout, selection color roles             | via [Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3) and [compose-samples](https://github.com/android/compose-samples) |
| Now in Android                   | Full M3 app + architecture reference                           | https://github.com/android/nowinandroid                                                                                                                                        |
| NiA design case study            | Figma / design files                                           | https://goo.gle/nia-figma (also PDF under NiA `docs/`)                                                                                                                         |
| Material Theme Builder           | Tone roles and Compose export for "less green" chrome          | https://github.com/material-foundation/material-theme-builder                                                                                                                  |
| Android Compose component guides | App bars, FAB, sheets, menus, dialogs                          | https://developer.android.com/develop/ui/compose/components                                                                                                                    |

## Mapping feedback to patterns

| Feedback                 | Adopt                                                                  | Avoid                                              |
| ------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------- |
| Dislikes text Back       | `navigationIcon` + auto-mirrored ArrowBack                             | TextButton labeled Back in the bar                 |
| Dislikes text More       | `MoreVert` + `DropdownMenu`, or promote true primary to FAB / FAB menu | Text "More" dropdown trigger                       |
| Wants FAB for actions    | One primary FAB or FAB menu of related actions                         | FAB as catch-all for every secondary item          |
| Session nav less green   | Remap selection chrome to secondary/surface containers                 | Changing whole brand away from green               |
| Remove modals            | Inline `/` picker, menus, standard sheets, full-screen destinations    | Modal sheet/dialog for routine skill pick          |
| Slash skills in composer | Discord/Slack-style `/` autocomplete on the text field                 | Modal-only skills browser with no composer trigger |

## Source limits

m3.material.io guideline bodies are heavily client-rendered. Claims above
use overview/specs pages that expose text, Android developer docs, API
KDoc, Google sample READMEs, and Discord/Slack developer docs. Where a
guideline page failed to yield body text, the matching overview, specs,
or Android doc is cited instead.
