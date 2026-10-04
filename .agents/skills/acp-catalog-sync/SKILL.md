---
name: acp-catalog-sync
description: >-
  Refresh the pinned ACP registry snapshot, regenerate the agent catalog and
  open AgentId schema helper, and report the diff. Use when syncing ACP agents, updating the
  catalog, or after ACP registry changes.
---

# ACP catalog sync

Pin registry snapshot, codegen catalog, report diff.

## When to use

- New agents appear in the ACP registry
- Spawn metadata changed for an existing agent
- Periodic catalog refresh

## Steps

1. Fetch the latest registry JSON:

```bash
curl -fsSL https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json \
  -o packages/core/src/agent-catalog/registry.snapshot.json
```

2. Regenerate catalog outputs:

```bash
bun run catalog:codegen
```

Writes:

- `packages/contracts/src/http/agent.id.generated.ts`
- `packages/core/src/agent-catalog/generated/catalog.agents.generated.ts`
- `packages/core/src/agent-catalog/generated/agent.overrides.generated.ts`

3. Report the diff:

```bash
git diff --stat -- \
  packages/core/src/agent-catalog/registry.snapshot.json \
  packages/contracts/src/http/agent.id.generated.ts \
  packages/core/src/agent-catalog/generated/
git diff -- \
  packages/contracts/src/http/agent.id.generated.ts \
  packages/core/src/agent-catalog/generated/catalog.agents.generated.ts
```

4. Keep product overrides. Do not edit generated files by hand.

- Cursor override: `packages/core/src/agent-catalog/overrides/cursor.override.ts`
- Product override map: `packages/core/src/agent-catalog/overrides/product.overrides.ts`
- Popular allowlist: `packages/core/src/agent-catalog/popular.allowlist.ts`

5. If popular allowlist ids are missing from the new snapshot, update the allowlist.

6. Run checks:

```bash
bun run check
```

## Notes

- Ordinary GET agent settings does not fetch the live registry. Import detect is the live-registry path.
- `ensureCatalogAgentSettingsRows` inserts missing agent_settings rows on repository create.
- Legacy `claude` id was removed. Catalog id is `claude-acp`.
- `AgentIdSchema` is an open `z.string().min(1)`. Catalog ids live in `catalogAgentIds`.
