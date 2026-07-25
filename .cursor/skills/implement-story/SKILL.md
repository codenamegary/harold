---
name: implement-story
description: Implements a GitHub story sub-issue autonomously after a quick grill-me. Takes milestone, epic, and story issue numbers, validates via gh, reads epic build spec, uses a git worktree and branch off main, applies typescript-dev and TDD, then opens a PR. Use when implementing a story, grabbing tracer-bullet work, or executing an epic sub-issue.
disable-model-invocation: true
---

# Implement Story

Implement one **story** sub-issue end to end. Output is a pull request against `main`. Work runs in an isolated git worktree.

Stories are tracer-bullet vertical slices from `expand-epic`. The parent **epic** holds the build spec and story index.

## Issue hierarchy

| Kind | Label | GitHub role | Holds |
|------|-------|-------------|-------|
| Epic | `epic` | Parent issue | Outcome, `## Build spec`, `## Story index`, research comments |
| Story | `story` | Sub-issue (`--parent`) | `## What to build`, acceptance criteria, `## Blocked by` |

Milestone context lives on GitHub and in local `spec/` (`roadmap.md`, `ms1-*.md`, and similar).

## Writing style

Follow `.cursor/rules/plain-language.mdc` for issue comments and PR text.

## TypeScript conventions

Read and apply `~/.cursor/skills/typescript-dev/SKILL.md` before writing or editing code. Treat it as binding for the full implementation.

## Related skills

| Phase | Skill | Role |
|-------|-------|------|
| Kickoff | `grill-me` | Quick grill for open decisions only. One question at a time. |
| Implementation | `~/.cursor/skills/typescript-dev/SKILL.md` | Code conventions. Read the file. |
| Tests | `tdd` | Red-green at pre-agreed seams. |
| Review | `code-review` | Standards and spec check before the PR. |
| Upstream planning | `expand-epic` | Epic and story structure this skill consumes. |

## Invocation

The user passes **milestone**, **epic issue number**, and **story issue number**.

Examples:

- `/implement-story ms1 42 57`
- `"Core local operator" 42 57`
- optional repo override: `-R owner/repo`

### Missing inputs

If any of milestone, epic, or story is missing, ask before continuing. One prompt per missing value:

1. Milestone (title or number)
2. Epic issue number
3. Story issue number

Do not guess. Do not start until all three are known.

Resolve the repo from the current git remote when not overridden.

## Process

Copy this checklist and track progress:

```
Implement story progress:
- [ ] 1. Intake and validation
- [ ] 2. Read context
- [ ] 3. Quick grill-me
- [ ] 4. Worktree and branch
- [ ] 5. Implement (TDD)
- [ ] 6. Verify
- [ ] 7. Review and fix
- [ ] 8. Pull request
- [ ] 9. Story update
```

After step 3, run steps 4 through 9 **autonomously**. Do not stop for approval unless blocked.

### 1. Intake and validation

Fetch GitHub context:

```bash
# Milestone
gh api repos/{owner}/{repo}/milestones --jq '.[] | {number, title, description, state}'

# Epic
gh issue view <EPIC> --comments
gh issue view <EPIC> --json number,title,body,url,labels,milestone,state,comments

# Story
gh issue view <STORY> --json number,title,body,url,labels,parent,milestone,state,blockedBy
```

Validate before continuing:

| Check | On failure |
|-------|------------|
| Epic has `epic` label | Stop. Tell the user. |
| Story has `story` label | Stop. Tell the user. |
| Story parent is the epic | Stop. Tell the user. |
| Epic is in the named milestone | Stop. Tell the user. |
| Story is in the same milestone | Stop. Tell the user. |
| Epic has `## Build spec` in the body | Stop. Run `expand-epic` first. |
| All `blockedBy` issues are closed | Stop. List open blockers. |

### 2. Read context

Read in this order. Later items inherit earlier constraints.

1. **Milestone** — GitHub milestone description and matching `spec/` docs.
2. **Epic** — full body (`## Build spec`, `## Story index`), research comments.
3. **Story** — `## What to build`, acceptance criteria, `## Blocked by`.

From the epic build spec, note:

- **Scope** and **Out of scope**
- **Slices** this story touches
- **Contracts**, **Persistence**, **Testing** seams
- **Implementation decisions** that apply

Find this story in `## Story index`. Confirm the story title and deliverable match the sub-issue.

Explore the codebase for current state in the story's slices.

Draft a short implementation plan (slices, seams, acceptance mapping). Use it in grill-me. Do not write code yet.

### 3. Quick grill-me

Scoped `grill-me` before any git or code changes.

**Only ask about decisions not already settled** in the milestone, epic build spec, story, or codebase. Look up facts. Do not ask the user for knowable facts.

Typical topics when open:

- Approach when multiple valid designs remain
- Test seams when the epic `### Testing` section is silent
- Trade-offs that change scope or public contracts

Rules:

- One question at a time. Give a recommended answer.
- Stop when open decisions are resolved.
- Ask once for confirmation to proceed autonomously through PR.

If nothing is open, state assumptions and ask only for autonomous proceed confirmation.

Do not create a worktree or branch until the user confirms.

### 4. Worktree and branch

Do all implementation in an isolated worktree. Base branch is `main`.

```bash
git fetch origin main

# From primary repo checkout
WORKTREE=".worktrees/story-<STORY_NUMBER>"
BRANCH="story/<STORY_NUMBER>-<short-slug>"

git worktree add -b "$BRANCH" "$WORKTREE" origin/main
cd "$WORKTREE"
```

Branch slug comes from the story title. Lowercase. Hyphens between words. Drop filler.

Run every build, test, and git command from the worktree until the PR is open.

Commit on the branch as work proceeds. Use clear commit messages that reference the story number.

### 5. Implement (TDD)

Read `~/.cursor/skills/typescript-dev/SKILL.md` again if not already in context.

Use test seams from the epic build spec or from grill-me.

Follow `tdd`:

- Red before green. One slice at a time.
- Vertical tracer bullets. Not horizontal layer batches.
- Run typechecking regularly.
- Run the focused test file after each cycle.
- Refactor only after green, and keep it minimal during implementation.

Stay inside story scope. Do not pull in sibling story work or epic out-of-scope items.

### 6. Verify

Before review:

- [ ] Every acceptance criterion on the story is met
- [ ] Typecheck passes
- [ ] Focused tests for this story pass
- [ ] Full test suite passes once at the end

### 7. Review and fix

Run `code-review` with the story and epic build spec as the spec source.

Fix every **Critical** finding before opening the PR. Fix **Suggestion** items when cheap. Note remaining suggestions in the PR if any.

### 8. Pull request

Push the branch and open a PR against `main`:

```bash
git push -u origin HEAD

gh pr create --base main --title "<short title>" --body "$(cat <<'EOF'
## Summary

<what changed, plain language>

## Story

<STORY_URL>

Epic: <EPIC_URL>

## Test plan

- [ ] <check>
- [ ] <check>

EOF
)"
```

PR rules:

- Title states the user-visible outcome.
- Body links the story and epic.
- Test plan maps to acceptance criteria and test seams.
- Use `Closes #<STORY>` in the body when the PR fully completes the story.

Share the PR URL with the user.

### 9. Story update

Post a comment on the story (plain language):

```markdown
## PR opened

<PR_URL>

- Branch: <branch name>
- Worktree: <path>
```

Do not close the story. Do not check off acceptance criteria until the PR merges unless the user asks.

## Worktree cleanup

After merge, the user can remove the worktree:

```bash
git worktree remove .worktrees/story-<STORY_NUMBER>
git branch -d story/<STORY_NUMBER>-<short-slug>
```

Do not remove the worktree automatically.

## What this skill does not do

- Expand epics or create stories (`expand-epic`)
- Start work with open blockers
- Skip the epic build spec
- Close the story issue
- Merge the PR
