# Changelog

## [3.0.0](https://github.com/codenamegary/harold/compare/v2.0.0...v3.0.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **daemon:** HAROLD_HOST is removed; the daemon always binds 0.0.0.0. harold connect is removed. PATCH /v1/settings/runtime, POST /v1/pairing-codes, and GET /v1/devices are gone from the API. GET /v1/status returns only {state, version}. settings.yml no longer accepts bindHost or advertisedUrl keys.

### Features

* **daemon:** serve on the LAN by default with a host-only control plane ([#461](https://github.com/codenamegary/harold/issues/461)) ([89b40bb](https://github.com/codenamegary/harold/commit/89b40bbdec783feee39912723ba0a26d43ef7682))

## [2.0.0](https://github.com/codenamegary/harold/compare/v1.4.1...v2.0.0) (2026-10-27)


### ⚠ BREAKING CHANGES

* **workspaces:** make workspaces bookmarks to any project folder ([#457](https://github.com/codenamegary/harold/issues/457))
* **cli:** remove devices with hard delete ([#451](https://github.com/codenamegary/harold/issues/451))

### Features

* **cli:** remove devices with hard delete ([#451](https://github.com/codenamegary/harold/issues/451)) ([41bf5df](https://github.com/codenamegary/harold/commit/41bf5df02477f3b7e1ac9df737fb173c864b3dd9))
* **workspaces:** make workspaces bookmarks to any project folder ([#457](https://github.com/codenamegary/harold/issues/457)) ([5d7704c](https://github.com/codenamegary/harold/commit/5d7704c74fa99cc5e2947ba60a874c2ee72bbf5f))

## [1.4.1](https://github.com/codenamegary/harold/compare/v1.4.0...v1.4.1) (2026-10-24)


### Documentation

* **demo:** update Remotion cut for refreshed capture ([#445](https://github.com/codenamegary/harold/issues/445)) ([d250a3f](https://github.com/codenamegary/harold/commit/d250a3fcaeff1fb10b0e1d5f0ac4cbb8c93a73d2))

## [1.4.0](https://github.com/codenamegary/harold/compare/v1.3.0...v1.4.0) (2026-10-19)


### Features

* **cli:** add private LAN HTTP pairing ([#421](https://github.com/codenamegary/harold/issues/421)) ([e4c258b](https://github.com/codenamegary/harold/commit/e4c258b750bb9c82d0b6a854fde66d8c90577fc4))

## [1.3.0](https://github.com/codenamegary/harold/compare/v1.2.3...v1.3.0) (2026-10-13)


### Features

* **cli:** rename serve to start and run the daemon in the background ([#376](https://github.com/codenamegary/harold/issues/376)) ([14c27d0](https://github.com/codenamegary/harold/commit/14c27d07b585a5ce988ccbffa7d38c610e2c5974)), closes [#374](https://github.com/codenamegary/harold/issues/374)
* **server:** warm up ACP agents in the background after listening ([#380](https://github.com/codenamegary/harold/issues/380)) ([f43fa35](https://github.com/codenamegary/harold/commit/f43fa35d5cbd3f8eda63761bb11c29dbcacadce0))


### Bug Fixes

* **android:** drop the operator console subtitle from the shell screen ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))
* **android:** use an icon back button on the pairing screen ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))


### Refactoring

* **pairing:** reject the retired agent-server uri scheme as invalid ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))
* replace operator with user across code and docs ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))


### Documentation

* **branding:** replace operator with user in branding pages ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))
* remove the ADRs and CONTEXT.md ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))
* remove the research notes ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))

## [1.2.3](https://github.com/codenamegary/harold/compare/v1.2.2...v1.2.3) (2026-10-10)


### Bug Fixes

* **cli:** ship the repo README in the npm package ([#371](https://github.com/codenamegary/harold/issues/371)) ([fbd43fe](https://github.com/codenamegary/harold/commit/fbd43fe78455a624bc1523e845d7c778477af3c4)), closes [#368](https://github.com/codenamegary/harold/issues/368)

## [1.2.2](https://github.com/codenamegary/harold/compare/v1.2.1...v1.2.2) (2026-10-10)


### Bug Fixes

* **auth:** stop host-login card on probe unknown, probe auth in harold agent list ([#364](https://github.com/codenamegary/harold/issues/364)) ([e757705](https://github.com/codenamegary/harold/commit/e7577059cc6fc38569352e325601b7ed84ca674d))

## [1.2.1](https://github.com/codenamegary/harold/compare/v1.2.0...v1.2.1) (2026-10-08)


### CI

* upload server and CLI coverage as a workflow artifact ([#356](https://github.com/codenamegary/harold/issues/356)) ([6224338](https://github.com/codenamegary/harold/commit/622433862889fa859ae1e9224063a48685bb9750))

## [1.2.0](https://github.com/codenamegary/harold/compare/v1.1.0...v1.2.0) (2026-10-07)


### Features

* **cli:** detach the daemon from setup and add stop ([#346](https://github.com/codenamegary/harold/issues/346)) ([5efcf33](https://github.com/codenamegary/harold/commit/5efcf33ed8576739f67d3b56a67d9c318c213c34))


### Bug Fixes

* **cli:** use embedded migrations for every bundled database open ([#347](https://github.com/codenamegary/harold/issues/347)) ([36f9f26](https://github.com/codenamegary/harold/commit/36f9f263bef78bb1a866b2aef63d2b8fc2dac036))

## [1.1.0](https://github.com/codenamegary/harold/compare/v1.0.3...v1.1.0) (2026-10-06)


### Features

* **cli:** default to help, let setup own the server, and keep logs off screen ([#344](https://github.com/codenamegary/harold/issues/344)) ([20465d3](https://github.com/codenamegary/harold/commit/20465d30361d154800d15d85a3719b9de38a80c0))

## [1.0.3](https://github.com/codenamegary/harold/compare/v1.0.2...v1.0.3) (2026-10-06)


### Bug Fixes

* **ci:** unblock the npm release chain ([#341](https://github.com/codenamegary/harold/issues/341)) ([b59e19d](https://github.com/codenamegary/harold/commit/b59e19da415108708ffe4cf7fe64187ee8964edd))

## [1.0.2](https://github.com/codenamegary/harold/compare/v1.0.1...v1.0.2) (2026-10-06)


### Bug Fixes

* **ci:** declare the release-please runner ([#339](https://github.com/codenamegary/harold/issues/339)) ([b4062de](https://github.com/codenamegary/harold/commit/b4062de2405498114c908a70f0f144a5a3f2dbe0))
* **cli:** cut npm releases from the node releaser ([#338](https://github.com/codenamegary/harold/issues/338)) ([0cd44f5](https://github.com/codenamegary/harold/commit/0cd44f5bce8612b6d92bdcaee6b3d9fb174bcd61))

## [1.0.1](https://github.com/codenamegary/harold/compare/v1.0.0...v1.0.1) (2026-10-06)


### Bug Fixes

* **cli:** emit an npm-accepted bin path ([#336](https://github.com/codenamegary/harold/issues/336)) ([896b4c0](https://github.com/codenamegary/harold/commit/896b4c09cb31253e3f8c7bdd32b32922eb52cdc4))

## 1.0.0 (2026-10-06)


### Features

* **cli:** connect with reachability recipes ([#326](https://github.com/codenamegary/harold/issues/326)) ([53eb0f4](https://github.com/codenamegary/harold/commit/53eb0f423a3c61a64d6f0f052474d47d9d9327b9))
* **cli:** first-run setup wizard with serve auto-run ([#332](https://github.com/codenamegary/harold/issues/332)) ([21fbd4e](https://github.com/codenamegary/harold/commit/21fbd4e9445d16436c8607f16967a3bd3c6f3157))
* **cli:** manage agents from the CLI ([#329](https://github.com/codenamegary/harold/issues/329)) ([253ac9a](https://github.com/codenamegary/harold/commit/253ac9aab2554c1544bce94666765a6f16a3c77f))
* **cli:** manage workspaces from the CLI ([#327](https://github.com/codenamegary/harold/issues/327)) ([0feecc6](https://github.com/codenamegary/harold/commit/0feecc65b1d03300066ae85d6cbd5a8cbb32c3f7))
* **cli:** pair devices and manage them from the CLI ([#328](https://github.com/codenamegary/harold/issues/328)) ([2ab71c0](https://github.com/codenamegary/harold/commit/2ab71c090abf9bfc6c9747e9822220c09396ee7f))
* **cli:** status summary and log tail ([#330](https://github.com/codenamegary/harold/issues/330)) ([a51e02e](https://github.com/codenamegary/harold/commit/a51e02ed03d4e0454e85e6f3e1f8f37e15ca6a86))


### Bug Fixes

* **cli:** exact enable rollback and honest runtime rendering ([#331](https://github.com/codenamegary/harold/issues/331)) ([eb00dc7](https://github.com/codenamegary/harold/commit/eb00dc7093158dffc21c28589fb37055789e79dd))


### Refactoring

* **core:** add the shared middle package and scaffold the CLI ([#325](https://github.com/codenamegary/harold/issues/325)) ([7f945d1](https://github.com/codenamegary/harold/commit/7f945d15506fa81882a5c17d2dc602b2a25058e2))
