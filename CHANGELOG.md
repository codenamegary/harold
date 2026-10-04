# Changelog

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
