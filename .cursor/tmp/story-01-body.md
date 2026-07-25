## What to build

Set up the production Bun monorepo. Move `apps/web` into the workspace. One root lockfile. Root scripts for install, dev, build, test, lint, and check. Add a shared oxlint config that enforces typescript-dev conventions where oxlint can.

## Acceptance criteria

- [ ] Root `package.json` declares workspaces for `apps/*` and `packages/*` with shared dependency catalogs
- [ ] `apps/web/package-lock.json` is removed and `apps/web` installs through root `bun install`
- [ ] Root `bun.lock` is the only JavaScript lockfile
- [ ] Root `dev` and `build` scripts run against workspace packages
- [ ] `apps/web` still builds without functional UI changes
- [ ] Root `.oxlintrc.json` defines shared lint rules. Workspaces extend it
- [ ] `oxlint` is in the root catalog. Root `lint` script runs oxlint across workspaces
- [ ] Shared rules enforce typescript-dev conventions where oxlint supports them:
  - No `import type` or inline `type` imports (`typescript/consistent-type-imports` with `prefer: no-type-imports`)
  - `type` aliases over `interface` (`typescript/consistent-type-definitions: type`)
  - No classes (`max-classes-per-file` with `max: 0`, `typescript/no-extraneous-class`)
  - No barrel re-export files (`oxc/no-barrel-file` with `threshold: 0`)
  - `const` over `var` (`prefer-const`, `no-var`)
- [ ] `apps/web` keeps React-specific oxlint rules in its workspace config

## Blocked by

None
