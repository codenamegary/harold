## What to build

Create `packages/contracts` with MS1 Zod schemas for status, errors, workspaces, sessions, and events. Add contract tests that prove valid and invalid payloads parse as expected.

## Acceptance criteria

- [ ] Schemas exist for status, error, workspace, session, and event resources
- [ ] Types are inferred from Zod schemas with no duplicate hand-written types
- [ ] Schemas use MS1 vocabulary (`sessions`, not `agents`) and exclude M2+ resources
- [ ] Contract tests pass for representative valid and invalid fixtures
- [ ] No barrel exports. Consumers import directly from defining modules

## Blocked by

- https://github.com/codenamegary/agent-server/issues/8
