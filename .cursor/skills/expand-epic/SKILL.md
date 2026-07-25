---
name: expand-epic
description: Expands a slim GitHub epic into a build spec, story index, and native sub-issues. Takes a milestone and epic issue number, fetches GitHub milestone and issue context via gh, reads local spec/ constraints, runs research and grilling, applies the global typescript-dev skill, then creates tracer-bullet sub-issues. Use when shaping an epic, turning a GitHub issue into stories, or preparing work for implement.
disable-model-invocation: true
---

# Expand Epic

Turn a slim GitHub epic into an executable plan on GitHub.

Epics and stories live on GitHub. Local `spec/` holds milestone context only (`roadmap.md`, `ms1-*.md`, and similar). Do not create per-epic markdown in the repo.

## Labels

| Issue kind | Label |
|------------|-------|
| Epic (parent) | `epic` |
| Story (sub-issue) | `story` |

Apply `epic` to the parent epic if missing. Apply `story` on every sub-issue at create time.

## Writing style

Follow `.cursor/rules/plain-language.mdc` for all prose: epic body updates, research comments, story index, and sub-issue bodies.

## TypeScript conventions

Read and apply `~/.cursor/skills/typescript-dev/SKILL.md` during **research** and **build spec** work. Treat it as binding for TypeScript architecture, module layout, immutability, vertical slices, and Zod models.

Do this before drafting research conclusions that touch code shape, and again before writing the build spec.

## Related skills

| Phase | Skill | Role |
|-------|-------|------|
| Research | `research` | Facts from primary sources. Post to epic comments, not local files. |
| Research + build spec | `~/.cursor/skills/typescript-dev/SKILL.md` | TypeScript and architecture conventions. Read the file. |
| Decisions | `grilling` | One question at a time. Look up facts. Wait for shared understanding. |
| Stories | `to-tickets` | Tracer-bullet slices, blocking edges, ticket shape. |

## Invocation

The user passes a **milestone** and an **epic issue number**.

Examples:

- `/expand-epic ms1 42`
- milestone title + epic number: `"Core local operator" 42`
- optional repo override: `-R owner/repo`

Resolve the repo from the current git remote when not overridden.

### GitHub context

Fetch milestone and epic context before intake:

```bash
# Milestones in the repo
gh api repos/{owner}/{repo}/milestones --jq '.[] | {number, title, description, state}'

# Issues in the milestone (sibling epics and other work)
gh issue list --milestone "<MILESTONE_TITLE_OR_NUMBER>" --limit 100 \
  --json number,title,state,labels

# Target epic
gh issue view <EPIC> --comments
gh issue view <EPIC> --json number,title,body,url,labels,milestone,comments
```

Use milestone context to:

- Confirm the epic belongs to the named milestone
- See sibling epics and dependency order
- Spot overlap or gaps across epics
- Align language with other milestone issues

Read linked milestone docs from `spec/` when they exist for the same milestone. Explore the codebase for current state in the epic's area.

## Process

Copy this checklist and track progress:

```
Expand epic progress:
- [ ] 1. Intake
- [ ] 2. Research
- [ ] 3. Grilling
- [ ] 4. Build spec (Gate A)
- [ ] 5. Story index (Gate B)
- [ ] 6. Sub-issues
```

### 1. Intake

1. Resolve the milestone. List its GitHub issues. Fetch the target epic body and all comments.
2. Confirm the epic is in that milestone. Flag a mismatch to the user before continuing.
3. Confirm the epic has the `epic` label. Add it if missing:

```bash
gh issue edit <EPIC> --add-label epic
```

4. Read milestone constraints from GitHub milestone description and from `spec/` when present (architecture, quality bar, out of scope).
5. Explore the codebase. Note what exists, what is missing, and prefactor needs.
6. Produce a short gap list:
   - **Decided** (epic, milestone, or code)
   - **Needs research** (facts from primary sources)
   - **Needs decision** (user must choose)

Do not write the build spec yet.

### 2. Research

Read `~/.cursor/skills/typescript-dev/SKILL.md` before research that touches code structure, APIs, or persistence.

For each **needs research** item, spin up a background agent when useful.

Research rules (from `research`):

1. Use primary sources: official docs, source code, specs, first-party APIs.
2. Cite the source for each claim.
3. Post findings as an epic comment. Do not write research files to the repo.
4. Frame code-related findings using typescript-dev conventions (vertical slices, Zod at boundaries, immutable style).

Comment format:

```markdown
## Research: <topic>

<findings with source links>

Sources:
- <url or path>
```

Keep working on other items while background research runs. Fold confirmed facts into the build spec draft.

### 3. Grilling

For each **needs decision** item, follow `grilling`:

- One question at a time.
- Give a recommended answer.
- Look up facts in the repo or docs. Do not ask the user for knowable facts.
- Wait for the user's answer before the next question.

Stop when the user confirms shared understanding. Do not proceed to Gate A without that confirmation.

### 4. Build spec (Gate A)

Read `~/.cursor/skills/typescript-dev/SKILL.md` again. Draft the build spec using those conventions for all TypeScript and architecture decisions. Inherit non-negotiables from the GitHub milestone and from `spec/` when present.

Present the full proposed epic body to the user. Wait for approval before editing GitHub.

**Epic body structure.** Keep the original epic content at the top. Append these sections:

```markdown
## Build spec

### Scope

What this epic delivers. What it does not.

### Slices

Vertical slices touched. Models, behavior, persistence, transport, tests per slice.

### Contracts

API, event, and schema boundaries. Zod models at system edges.

### Persistence

Tables, migrations, compatibility. Error and recovery behavior for this epic.

### Testing

Highest test seams. What each seam proves. Prior art in the repo.

### Implementation decisions

Numbered list of technical choices made during grilling. No file paths unless a prototype snippet encodes a decision better than prose.

### Out of scope

Epic-specific exclusions not already in the milestone doc.
```

Avoid file paths and code snippets unless a prototype snippet encodes a decision better than prose. Trim to decision-rich parts.

**Publish** after Gate A approval:

```bash
gh issue edit <EPIC> --body-file <path>
```

### 5. Story index (Gate B)

Break the approved build spec into **tracer-bullet** stories per `to-tickets`:

- Each story is a narrow, complete vertical slice (schema, API, UI, tests as needed).
- Each story is verifiable on its own.
- Each story fits one fresh agent context window.
- Prefactor stories come first when needed.
- Wide refactors use expand-contract sequencing from `to-tickets`.

Draft the story index as a table inside the epic body, under `## Story index`:

```markdown
## Story index

| # | Story | Blocked by | Delivers |
|---|-------|------------|----------|
| 1 | <title> | None | <end-to-end outcome> |
| 2 | <title> | 1 | <end-to-end outcome> |
```

Present the breakdown to the user. Ask:

- Is granularity right? (too coarse / too fine)
- Are blocking edges correct?
- Merge or split anything?

Iterate until approved. Update the epic body with the final index after Gate B approval.

### 6. Sub-issues

Create sub-issues in dependency order (blockers first). Use GitHub native sub-issues.

```bash
gh issue create \
  --title "<title>" \
  --body-file <path> \
  --parent <EPIC_NUMBER> \
  --label story \
  --blocked-by <ISSUE_NUMBERS>
```

Requires `gh` 2.94.0 or later for `--parent` and `--blocked-by`.

Sub-issue body template:

```markdown
## What to build

End-to-end behavior this story makes work. User perspective. Not a layer-by-layer task list.

## Acceptance criteria

- [ ] <criterion>
- [ ] <criterion>

## Blocked by

- <issue URL or number>, or "None"
```

After each sub-issue is created, update the story index table to link the `#` column to the real issue number.

Rules:

- Do not close or rewrite the parent epic beyond the approved body update.
- Do not create local ticket files.
- Every sub-issue gets the `story` label.
- Apply `ready-for-agent` label when the repo uses it.

## Gates

| Gate | Artifact | Action |
|------|----------|--------|
| A | Build spec in epic body | User approves before `gh issue edit` |
| B | Story index in epic body | User approves before sub-issue creation |

## What this skill does not do

- Implement stories (`implement`)
- Create per-epic markdown in `spec/`
- Skip grilling for open decisions
- Auto-publish without user approval at both gates
