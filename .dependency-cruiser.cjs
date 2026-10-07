// @ts-check
// Architecture rules for the server, core, and cli module graphs, per the
// typescript-dev-backend skill.
//
// Layer direction: routes and assemblies wire use cases, use cases depend on ports,
// ports depend on models, adapters implement ports. Slices talk through capability
// ports, never through another slice's adapters.
//
// dependency-cruiser owns the rules that need the whole graph. Per-file import
// boundaries (what a use case, model, port, or test may import) live in the root
// .oxlintrc.json. Cycles are owned by oxlint's import/no-cycle. Rule messages
// quote the skill on purpose.
//
// Ported from codenamegary/yuekbox .dependency-cruiser.cjs.

const SERVER = "apps/server/src"
const CORE = "packages/core/src"

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "server-no-cross-slice-adapters",
      comment:
        "backend skill: slices talk through capability ports, never another slice's adapters",
      severity: "error",
      from: {
        path: `^${SERVER}/([^/]+)/`,
        pathNot: `^${SERVER}/(bootstrap|persistence|test-support)/|\\.test\\.ts$`,
      },
      to: {
        path: `^${SERVER}/([^/]+)/[^/]*\\.adapters\\.ts$`,
        pathNot: `^${SERVER}/$1/`,
      },
    },
    {
      name: "core-no-cross-slice-adapters",
      comment:
        "backend skill: slices talk through capability ports, never another slice's adapters",
      severity: "error",
      from: { path: `^${CORE}/([^/]+)/`, pathNot: `\\.test\\.ts$` },
      to: {
        path: `^${CORE}/([^/]+)/[^/]*\\.adapters\\.ts$`,
        pathNot: `^${CORE}/$1/`,
      },
    },
    {
      name: "adapters-mounted-at-composition",
      comment: "backend skill: only assemblies, routes, the process roots, and tests wire adapters",
      severity: "error",
      from: {
        pathNot: `(\\.assembly\\.ts|\\.routes\\.ts|server\\.ts)$|\\.test\\.ts$`,
      },
      to: { path: `^(${SERVER}|${CORE})/.*\\.adapters\\.ts$` },
    },
    {
      name: "db-through-adapters",
      comment:
        "backend skill: only adapters, assemblies, the process roots, and tests reach the database",
      severity: "error",
      from: {
        pathNot: `(\\.adapters\\.ts|\\.assembly\\.ts)$|^${SERVER}/(bootstrap|persistence|test-support)|server\\.ts$|\\.test\\.ts$`,
      },
      to: { path: `^${SERVER}/persistence/` },
    },
    {
      name: "drizzle-limited-to-adapters",
      comment:
        "backend skill: composition stays in slice assemblies and bootstrap; only adapters and persistence touch drizzle",
      severity: "error",
      from: {
        pathNot: `(\\.adapters\\.ts|\\.assembly\\.ts)$|^${SERVER}/(bootstrap|persistence)|^${CORE}/.*\\.adapters\\.ts$|\\.test\\.ts$`,
      },
      to: { path: `drizzle-orm` },
    },
    {
      name: "sqlite-adapters-limited-to-composition",
      comment:
        "backend skill: composition stays in slice assemblies and bootstrap; sqlite adapters are wired, not imported",
      severity: "error",
      from: {
        pathNot: `(\\.adapters\\.ts|\\.assembly\\.ts|\\.routes\\.ts)$|^${SERVER}/bootstrap|\\.test\\.ts$`,
      },
      to: { path: `^${SERVER}/.*\\.sqlite\\.adapters\\.ts$` },
    },
    {
      name: "settings-file-adapters-limited-to-composition",
      comment:
        "backend skill: composition stays in slice assemblies and bootstrap; file-backed settings adapters are wired, not imported",
      severity: "error",
      from: {
        pathNot: `(\\.adapters\\.ts|\\.assembly\\.ts|\\.routes\\.ts)$|^${SERVER}/bootstrap|\\.test\\.ts$`,
      },
      to: { path: `^${SERVER}/runtime-settings/runtime-settings\\.file\\.adapters\\.ts$` },
    },
    {
      name: "supervisor-spawn-limited-to-owning-slice",
      comment:
        "backend skill: composition stays in slice assemblies and bootstrap; the ACP supervisor spawn is not reached from other slices",
      severity: "error",
      from: {
        pathNot: `^${SERVER}/acp/supervisor/|^${SERVER}/bootstrap|\\.test\\.ts$`,
      },
      to: { path: `^${SERVER}/acp/supervisor/supervisor\\.process\\.adapters\\.ts$` },
    },
    {
      name: "no-orphans",
      comment: "backend skill: every module is reachable from an entry point or a test",
      severity: "error",
      from: {
        orphan: true,
        pathNot: `\\.test\\.ts$|\\.d\\.ts$|^${CORE}/agent-catalog/generated/`,
      },
      to: {},
    },
  ],
  options: {
    // swc parses TypeScript so the rules do not depend on the repo's compiler API.
    parser: "swc",
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".jsx", ".json"] },
  },
}
