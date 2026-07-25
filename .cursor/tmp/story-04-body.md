## What to build

Wire the root `check` pipeline so one command runs typecheck, lint, and tests across all workspaces. This closes the epic done-when criteria.

## Acceptance criteria

- [ ] Root `bun run check` runs typecheck, lint, and tests for all workspaces
- [ ] Root `bun run test` runs tests across server, contracts, and web where applicable
- [ ] All checks pass on a clean install from root
- [ ] No milestone 2+ behavior appears production-ready

## Blocked by

- https://github.com/codenamegary/agent-server/issues/10
