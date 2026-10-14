# Changelog

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
