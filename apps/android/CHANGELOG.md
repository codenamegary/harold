# Changelog

## [3.0.0](https://github.com/codenamegary/harold/compare/harold-android-v2.0.0...harold-android-v3.0.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **daemon:** HAROLD_HOST is removed; the daemon always binds 0.0.0.0. harold connect is removed. PATCH /v1/settings/runtime, POST /v1/pairing-codes, and GET /v1/devices are gone from the API. GET /v1/status returns only {state, version}. settings.yml no longer accepts bindHost or advertisedUrl keys.

### Features

* **daemon:** serve on the LAN by default with a host-only control plane ([#461](https://github.com/codenamegary/harold/issues/461)) ([89b40bb](https://github.com/codenamegary/harold/commit/89b40bbdec783feee39912723ba0a26d43ef7682))
* **demo:** add the workspaces scene to the capture and cut ([#459](https://github.com/codenamegary/harold/issues/459)) ([c888870](https://github.com/codenamegary/harold/commit/c888870026cfe65bcaddbb7f48da6a8a12229450))

## [2.0.0](https://github.com/codenamegary/harold/compare/harold-android-v1.4.1...harold-android-v2.0.0) (2026-10-27)


### ⚠ BREAKING CHANGES

* **workspaces:** make workspaces bookmarks to any project folder ([#457](https://github.com/codenamegary/harold/issues/457))
* **cli:** remove devices with hard delete ([#451](https://github.com/codenamegary/harold/issues/451))

### Features

* **android:** cache REST data in Room for offline reads ([#454](https://github.com/codenamegary/harold/issues/454)) ([35eda3b](https://github.com/codenamegary/harold/commit/35eda3b380df81e9a3d83ee38dc14cb597462404))
* **android:** share the Room cache across features ([#455](https://github.com/codenamegary/harold/issues/455)) ([121de90](https://github.com/codenamegary/harold/commit/121de9027d4da0cf777b03791b495644ee4b5028))
* **cli:** remove devices with hard delete ([#451](https://github.com/codenamegary/harold/issues/451)) ([41bf5df](https://github.com/codenamegary/harold/commit/41bf5df02477f3b7e1ac9df737fb173c864b3dd9))
* **workspaces:** make workspaces bookmarks to any project folder ([#457](https://github.com/codenamegary/harold/issues/457)) ([5d7704c](https://github.com/codenamegary/harold/commit/5d7704c74fa99cc5e2947ba60a874c2ee72bbf5f))


### Refactoring

* **android:** collapse the chat session-reset copies and extract agent-auth ([#449](https://github.com/codenamegary/harold/issues/449)) ([8edeb4b](https://github.com/codenamegary/harold/commit/8edeb4b16c9fac1b3cb0802533f89ae994e8d740))

## [1.4.1](https://github.com/codenamegary/harold/compare/harold-android-v1.4.0...harold-android-v1.4.1) (2026-10-24)


### Documentation

* **demo:** update Remotion cut for refreshed capture ([#445](https://github.com/codenamegary/harold/issues/445)) ([d250a3f](https://github.com/codenamegary/harold/commit/d250a3fcaeff1fb10b0e1d5f0ac4cbb8c93a73d2))

## [1.4.0](https://github.com/codenamegary/harold/compare/harold-android-v1.3.0...harold-android-v1.4.0) (2026-10-22)


### Features

* **android:** edit or remove one saved Harold ([#439](https://github.com/codenamegary/harold/issues/439)) ([b89dd64](https://github.com/codenamegary/harold/commit/b89dd64201f7f85a6005f042a96fb8b78e37baf3))
* **android:** pair another Harold without dropping the ones already saved ([#438](https://github.com/codenamegary/harold/issues/438)) ([10e2d08](https://github.com/codenamegary/harold/commit/10e2d08148c43d3c89b6a5d41477f02c24b929e8))
* **android:** polish multi-Harold badges and appearance UI ([#444](https://github.com/codenamegary/harold/issues/444)) ([a5131a6](https://github.com/codenamegary/harold/commit/a5131a6a88de02aa71aa61182388f5c53735ef84))
* **android:** save more than one Harold on the phone ([#436](https://github.com/codenamegary/harold/issues/436)) ([161e9f9](https://github.com/codenamegary/harold/commit/161e9f9cefb5a75431e311a151a217d2aca974ad))
* **android:** show sessions from every paired Harold ([#441](https://github.com/codenamegary/harold/issues/441)) ([02ed151](https://github.com/codenamegary/harold/commit/02ed1518bfaf608e745ff1977f221a2722b58e85))
* **android:** start a session from any Harold's workspace ([#442](https://github.com/codenamegary/harold/issues/442)) ([6503278](https://github.com/codenamegary/harold/commit/650327813d09260391659a69d65c7f1a3e20897e))
* **android:** stay connected to every paired Harold ([#440](https://github.com/codenamegary/harold/issues/440)) ([bef370c](https://github.com/codenamegary/harold/commit/bef370c47ef8b3a3d4097ae53c35bf92f22a3bc9))
* **android:** tell the user when another Harold needs attention ([#443](https://github.com/codenamegary/harold/issues/443)) ([2b264af](https://github.com/codenamegary/harold/commit/2b264af49c18adc6b0b5d8099790445ede1ed0bc))

## [1.3.0](https://github.com/codenamegary/harold/compare/harold-android-v1.2.0...harold-android-v1.3.0) (2026-10-19)


### Features

* **android:** resume session streams after Doze without replaying ([#425](https://github.com/codenamegary/harold/issues/425)) ([f7fa9d8](https://github.com/codenamegary/harold/commit/f7fa9d8abd17ca4f79636750aafb28243f366c6c))
* **android:** SSE events + REST commands session transport ([#416](https://github.com/codenamegary/harold/issues/416)) ([bc303c4](https://github.com/codenamegary/harold/commit/bc303c470164556feda77bc6a24873a82599e441))


### Bug Fixes

* **android:** keep the session stream healthy across connects and loop exits ([c12554c](https://github.com/codenamegary/harold/commit/c12554ca903a0cf1981a3119fb185eb41bf7c400))
* **android:** park the session stream idle when nothing is watched ([c12554c](https://github.com/codenamegary/harold/commit/c12554ca903a0cf1981a3119fb185eb41bf7c400))
* **server:** resend session config options to stream subscribers ([c12554c](https://github.com/codenamegary/harold/commit/c12554ca903a0cf1981a3119fb185eb41bf7c400))

## [1.2.0](https://github.com/codenamegary/harold/compare/harold-android-v1.1.2...harold-android-v1.2.0) (2026-10-13)


### Features

* **sessions:** show live agent session renames in headers and lists ([#396](https://github.com/codenamegary/harold/issues/396)) ([5bb0ac1](https://github.com/codenamegary/harold/commit/5bb0ac1323f8a240a6e841293b2ead5a4c781a3a))


### Bug Fixes

* **android:** create session on confirm, seed config from response ([#375](https://github.com/codenamegary/harold/issues/375)) ([f516ac5](https://github.com/codenamegary/harold/commit/f516ac539705a279073ade02e18621ff9502960a))
* **android:** drop the operator console subtitle from the shell screen ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))
* **android:** use an icon back button on the pairing screen ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))


### Refactoring

* **android:** adopt Hilt for dependency injection ([#392](https://github.com/codenamegary/harold/issues/392)) ([f7d1951](https://github.com/codenamegary/harold/commit/f7d1951dc1e55dd377a5772f0077281a21caae09))
* **android:** migrate to Navigation 3 ([#394](https://github.com/codenamegary/harold/issues/394)) ([cdda092](https://github.com/codenamegary/harold/commit/cdda0922b3f63f2ac29dd3126e27c207088f5066))
* **android:** retire deprecated build and Compose APIs ([#393](https://github.com/codenamegary/harold/issues/393)) ([478cfdd](https://github.com/codenamegary/harold/commit/478cfdda76283c63841ec0bb26aa73c6885074a7))
* **android:** split the app into domain-named modules ([#395](https://github.com/codenamegary/harold/issues/395)) ([1b0f774](https://github.com/codenamegary/harold/commit/1b0f774e11787df94e53ffb251a57277e95b9f6e))
* **pairing:** reject the retired agent-server uri scheme as invalid ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))
* replace operator with user across code and docs ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))


### Documentation

* **branding:** replace operator with user in branding pages ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))
* remove the ADRs and CONTEXT.md ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))
* remove the research notes ([bd28213](https://github.com/codenamegary/harold/commit/bd28213cb5dc852a4ff70d5b5971693fc4fa495a))


### CI

* **workflows:** gate branch protection behind an always-reporting ci-ok job ([#379](https://github.com/codenamegary/harold/issues/379)) ([c29e8cd](https://github.com/codenamegary/harold/commit/c29e8cd143ee695b9c973898a075c9043ff9a440))

## [1.1.2](https://github.com/codenamegary/harold/compare/harold-android-v1.1.1...harold-android-v1.1.2) (2026-10-10)


### Bug Fixes

* **auth:** stop host-login card on probe unknown, probe auth in harold agent list ([#364](https://github.com/codenamegary/harold/issues/364)) ([e757705](https://github.com/codenamegary/harold/commit/e7577059cc6fc38569352e325601b7ed84ca674d))

## [1.1.1](https://github.com/codenamegary/harold/compare/harold-android-v1.1.0...harold-android-v1.1.1) (2026-10-08)


### Bug Fixes

* **android:** stop the transcript auto-scroll from remeasuring mid-layout ([#359](https://github.com/codenamegary/harold/issues/359)) ([2f6e224](https://github.com/codenamegary/harold/commit/2f6e2242dd0efb6a10a9b7fa7994eea9a99cf677))

## [1.1.0](https://github.com/codenamegary/harold/compare/harold-android-v1.0.0...harold-android-v1.1.0) (2026-10-08)


### Features

* **android:** sign release builds and allow LAN cleartext pairing ([#353](https://github.com/codenamegary/harold/issues/353)) ([e6bf0b8](https://github.com/codenamegary/harold/commit/e6bf0b8736ce1b7dc3ec784fd48b7bf6762715c5))


### CI

* **android:** publish signed APKs to GitHub Releases via release-please ([#354](https://github.com/codenamegary/harold/issues/354)) ([af5433f](https://github.com/codenamegary/harold/commit/af5433f2623585f18c436fc9a9c7872c4a0cec91))
