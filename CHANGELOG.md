# Changelog

Frozen at 1.0.0. The release train now tracks
[`apps/cli/CHANGELOG.md`](apps/cli/CHANGELOG.md), which ships as
`@codenamegary/harold` on npm.

## [1.0.0](https://github.com/codenamegary/harold/compare/v0.2.1...v1.0.0) (2026-10-06)

### ⚠ BREAKING CHANGES

- **server:** the daemon serves no HTML; /v1/logs and /v1/connection-test are gone; unauthenticated requests get 401 on all protected routes regardless of origin; the runtime-settings contract no longer accepts or returns trustedProxies.

### Features

- **cli:** connect with reachability recipes ([#326](https://github.com/codenamegary/harold/issues/326)) ([53eb0f4](https://github.com/codenamegary/harold/commit/53eb0f423a3c61a64d6f0f052474d47d9d9327b9))
- **cli:** first-run setup wizard with serve auto-run ([#332](https://github.com/codenamegary/harold/issues/332)) ([21fbd4e](https://github.com/codenamegary/harold/commit/21fbd4e9445d16436c8607f16967a3bd3c6f3157))
- **cli:** manage agents from the CLI ([#329](https://github.com/codenamegary/harold/issues/329)) ([253ac9a](https://github.com/codenamegary/harold/commit/253ac9aab2554c1544bce94666765a6f16a3c77f))
- **cli:** manage workspaces from the CLI ([#327](https://github.com/codenamegary/harold/issues/327)) ([0feecc6](https://github.com/codenamegary/harold/commit/0feecc65b1d03300066ae85d6cbd5a8cbb32c3f7))
- **cli:** pair devices and manage them from the CLI ([#328](https://github.com/codenamegary/harold/issues/328)) ([2ab71c0](https://github.com/codenamegary/harold/commit/2ab71c090abf9bfc6c9747e9822220c09396ee7f))
- **cli:** status summary and log tail ([#330](https://github.com/codenamegary/harold/issues/330)) ([a51e02e](https://github.com/codenamegary/harold/commit/a51e02ed03d4e0454e85e6f3e1f8f37e15ca6a86))
- **web:** model, mode and effort selection before the first prompt ([#290](https://github.com/codenamegary/harold/issues/290)) ([daacfa4](https://github.com/codenamegary/harold/commit/daacfa47bb12adfba4c047cd1bb314773e4a0a07)), closes [#288](https://github.com/codenamegary/harold/issues/288)

### Bug Fixes

- **cli:** exact enable rollback and honest runtime rendering ([#331](https://github.com/codenamegary/harold/issues/331)) ([eb00dc7](https://github.com/codenamegary/harold/commit/eb00dc7093158dffc21c28589fb37055789e79dd))

### Refactoring

- **acp:** extract supervisor pure functions into tested modules ([#308](https://github.com/codenamegary/harold/issues/308)) ([f961956](https://github.com/codenamegary/harold/commit/f96195683dbabd711e1750380ba0fccfa768c60a))
- **acp:** migrate agent, catalog, client, transport to slice conventions ([#312](https://github.com/codenamegary/harold/issues/312)) ([f5ee97e](https://github.com/codenamegary/harold/commit/f5ee97e6ec94b1a6f2f559ca91a811609ff8d032))
- **acp:** return start results instead of throwing AcpStartError ([#309](https://github.com/codenamegary/harold/issues/309)) ([99239f3](https://github.com/codenamegary/harold/commit/99239f3b21212991f31b1c81356050c72ec83f2d))
- **acp:** split supervisor into lifecycle engine and session operations ([#311](https://github.com/codenamegary/harold/issues/311)) ([04adf22](https://github.com/codenamegary/harold/commit/04adf225bf189cc679bd4554048826bea7dc6a18))
- **acp:** split supervisor ports and process adapter out of models ([#310](https://github.com/codenamegary/harold/issues/310)) ([0ec02ad](https://github.com/codenamegary/harold/commit/0ec02ade190b21bde65fe90803a612712b178afb))
- **core:** add the shared middle package and scaffold the CLI ([#325](https://github.com/codenamegary/harold/issues/325)) ([7f945d1](https://github.com/codenamegary/harold/commit/7f945d15506fa81882a5c17d2dc602b2a25058e2))
- **filesystem:** put directory listing behind ports and node adapters ([#306](https://github.com/codenamegary/harold/issues/306)) ([e4f508d](https://github.com/codenamegary/harold/commit/e4f508df7165ac57eb65f909e40f28587e48973c)), closes [#294](https://github.com/codenamegary/harold/issues/294)
- **logs:** replace the buffer service with curried use cases and adapters ([#304](https://github.com/codenamegary/harold/issues/304)) ([213b080](https://github.com/codenamegary/harold/commit/213b08040c3c1d0e8e0f1beff2965152bafc4548))
- **server:** extract connection-test driver ports and node adapters ([#303](https://github.com/codenamegary/harold/issues/303)) ([82adf1a](https://github.com/codenamegary/harold/commit/82adf1a85a160fef54bdcbe5099febda1e948217)), closes [#300](https://github.com/codenamegary/harold/issues/300)
- **server:** restructure attachments slice to ports, use cases and adapters ([#292](https://github.com/codenamegary/harold/issues/292)) ([e10317e](https://github.com/codenamegary/harold/commit/e10317ec58bde1634562da84d897c2ef3ecc3119))
- **server:** retire the console and make HTTP the device-only edge ([#333](https://github.com/codenamegary/harold/issues/333)) ([29577cc](https://github.com/codenamegary/harold/commit/29577cc982801d2d2d56f82a83648e31951bd946))
- **server:** validate attachment route params against contract schemas ([#305](https://github.com/codenamegary/harold/issues/305)) ([adb91fe](https://github.com/codenamegary/harold/commit/adb91fe27a68a4b5bca714032698fb1fc664b88f))
- **session:** extract ports, curried use cases, and shared agent gate ([#307](https://github.com/codenamegary/harold/issues/307)) ([e2a10de](https://github.com/codenamegary/harold/commit/e2a10deb43be5045753de93a71351fe4183e0adf))
- **status:** extract the status projection into a use case ([#302](https://github.com/codenamegary/harold/issues/302)) ([3e55376](https://github.com/codenamegary/harold/commit/3e55376f48d69b93f64e2efe4bf22ab8d42c33c8)), closes [#301](https://github.com/codenamegary/harold/issues/301)
- **web:** stock Tailwind type scale and theme-token sweep ([#291](https://github.com/codenamegary/harold/issues/291)) ([b7a17a3](https://github.com/codenamegary/harold/commit/b7a17a3967599d724eec36d392dfc13f474145b3))

### Tests

- **server:** switch smoke tests from cursor to opencode free model ([#287](https://github.com/codenamegary/harold/issues/287)) ([6528775](https://github.com/codenamegary/harold/commit/6528775c19b4009ac557cc7dedc5628870be8072))

## [0.2.1](https://github.com/codenamegary/harold/compare/v0.2.0...v0.2.1) (2026-09-19)

### CI

- **release:** use RELEASE_PAT for release-please and support manual binary uploads ([ab2cce6](https://github.com/codenamegary/harold/commit/ab2cce60fca1469437025b9d7042214d2c210b75))

## [0.2.0](https://github.com/codenamegary/harold/compare/v0.1.0...v0.2.0) (2026-09-19)

### Features

- **android:** make session config session-scoped in the live layer ([#267](https://github.com/codenamegary/harold/issues/267)) ([e5c0429](https://github.com/codenamegary/harold/commit/e5c042993df907b668136fa3694fb602700ded95))
- **android:** move session config writes out of ChatViewModel ([#268](https://github.com/codenamegary/harold/issues/268)) ([7808957](https://github.com/codenamegary/harold/commit/78089570764b0636ef7fa3c47974ec898bc58fcf))
- **android:** render model, mode and thinking in the chat composer ([#271](https://github.com/codenamegary/harold/issues/271)) ([0cd1639](https://github.com/codenamegary/harold/commit/0cd1639bda5704fd712587d30ca9feeb9d84ada3))
- **web:** bump chat transcript text to base size ([#248](https://github.com/codenamegary/harold/issues/248)) ([c14a2a0](https://github.com/codenamegary/harold/commit/c14a2a0102e3cc67d3359464b5429fc7becd2509))
- **web:** model, mode and effort selectors in the chat composer ([#258](https://github.com/codenamegary/harold/issues/258)) ([1e63651](https://github.com/codenamegary/harold/commit/1e63651dfe053ec1072974b5a3c49434bf01d12c))

### Bug Fixes

- **android:** give the session stream a tolerant frame seam ([#265](https://github.com/codenamegary/harold/issues/265)) ([fd0b6de](https://github.com/codenamegary/harold/commit/fd0b6de77234afd766fecab47d1c85652709d712))
- **android:** upgrade Robolectric and Compose BOM to stop flaky measure crash ([#270](https://github.com/codenamegary/harold/issues/270)) ([8c503a2](https://github.com/codenamegary/harold/commit/8c503a2dc5c44f53f775ce4dc795e5741da09d6f))
- **server:** centralize test boot and teardown for parallel runs ([#274](https://github.com/codenamegary/harold/issues/274)) ([ebc8a1d](https://github.com/codenamegary/harold/commit/ebc8a1dc174aee26746d10de004ed83565bfea46)), closes [#272](https://github.com/codenamegary/harold/issues/272)
- **web:** keep each agent message block as its own transcript row ([#250](https://github.com/codenamegary/harold/issues/250)) ([c753ff7](https://github.com/codenamegary/harold/commit/c753ff77585388e5a293d7e3e995eb002b1e9630))
- **web:** wrap long tool call text in the chat stream ([#249](https://github.com/codenamegary/harold/issues/249)) ([eae64b8](https://github.com/codenamegary/harold/commit/eae64b802d9acb45e4804827b7c5cd46bc3153bc))

### Refactoring

- **android:** add a composer session config seam ([#266](https://github.com/codenamegary/harold/issues/266)) ([7fb4536](https://github.com/codenamegary/harold/commit/7fb4536b23fdfe2fa3cf52a27199c890274b97a0))
- **server:** restructure agent settings slice to ports, use cases and adapters ([#277](https://github.com/codenamegary/harold/issues/277)) ([bf11ac1](https://github.com/codenamegary/harold/commit/bf11ac175bbd0911778e6244880e6d78956c7ef7))
- **server:** restructure device slice to ports, use cases and adapters ([#275](https://github.com/codenamegary/harold/issues/275)) ([cf06158](https://github.com/codenamegary/harold/commit/cf06158c39f442bb97262844598f44f9446ded0f))
- **server:** restructure runtime settings slice to ports, use cases and adapters ([#276](https://github.com/codenamegary/harold/issues/276)) ([f0dca76](https://github.com/codenamegary/harold/commit/f0dca7684998e97fd6797e6ecd9b5efb53aa7dba))

### Build

- **web:** replace Vite with the Bun dev server ([#280](https://github.com/codenamegary/harold/issues/280)) ([#282](https://github.com/codenamegary/harold/issues/282)) ([3fb0f0f](https://github.com/codenamegary/harold/commit/3fb0f0fdd36a8b4540489562471c59e2165b4e97))

### CI

- **android:** upload test results on failure ([#269](https://github.com/codenamegary/harold/issues/269)) ([3f88da5](https://github.com/codenamegary/harold/commit/3f88da5d7085bdb070682b5f49bd17c11e4ad85a))
