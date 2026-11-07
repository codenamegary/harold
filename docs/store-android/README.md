# Android store assets

Ready-to-upload Google Play assets for the Harold Android app. The listing copy is in [store-listing.md](./store-listing.md). The privacy policy draft is in [privacy-policy.md](./privacy-policy.md).

## Review access

Harold connects to your machines over SSH. There is no Harold service, account, or hosted environment. A Play reviewer can install the app and connect it to any SSH host they control. Any host that runs SSH and an ACP-compatible coding agent works.

## Foreground service declaration

Google Play requires a declaration and a demo video for the `specialUse` foreground service.

- Video: `foreground-service-demo.mp4`
- Type: `specialUse`

Harold keeps a live session event stream open while a session is starting, running, or waiting for input. A persistent notification shows the live state. The notification tells the user when a session needs an answer. The service stops when no sessions are active.

## Files

| File                           | Use                  | Spec                                  |
| ------------------------------ | -------------------- | ------------------------------------- |
| `app-icon-512x512.png`         | Play store icon      | 512 x 512 PNG, opaque, under 1 MB     |
| `feature-graphic-1024x500.png` | Play feature graphic | 1,024 x 500 PNG, under 15 MB          |
| `foreground-service-demo.mp4`  | Play FGS demo video  | H.264 MP4, 1,080 x 2,400, under 20 MB |
| `phone-01-connect.png`         | Phone screenshot 1   | 1,080 x 1,920 PNG, 9:16, under 8 MB   |
| `phone-02-sessions.png`        | Phone screenshot 2   | 1,080 x 1,920 PNG, 9:16, under 8 MB   |
| `phone-03-plan.png`            | Phone screenshot 3   | 1,080 x 1,920 PNG, 9:16, under 8 MB   |
| `phone-04-answer.png`          | Phone screenshot 4   | 1,080 x 1,920 PNG, 9:16, under 8 MB   |
| `phone-05-build.png`           | Phone screenshot 5   | 1,080 x 1,920 PNG, 9:16, under 8 MB   |
| `phone-06-changes.png`         | Phone screenshot 6   | 1,080 x 1,920 PNG, 9:16, under 8 MB   |
| `phone-07-worktrees.png`       | Phone screenshot 7   | 1,080 x 1,920 PNG, 9:16, under 8 MB   |
| `phone-08-ship.png`            | Phone screenshot 8   | 1,080 x 1,920 PNG, 9:16, under 8 MB   |

## Sources

- The icon uses the slanted prism from `apps/android/app/src/main/res/drawable/ic_launcher_foreground.xml` on the brand lime background.
- The feature graphic uses the Geist and Geist Mono fonts from Google Fonts. The font files and OFL license are in `src/fonts`.
- The screenshots are captured from the app running on a phone against an SSH host.

## Rebuild

Needs ImageMagick and a Chrome binary.

```sh
bash docs/store-android/src/build-assets.sh
```

The script rebuilds the icon and the feature graphic. Set `CHROME` if Chrome is not on the path.

## Validate

The store asset check verifies the Play size, dimension, format, and aspect ratio limits:

```sh
bun test scripts/checks/store-assets.test.ts
```

## Upload order

1. App icon
2. Feature graphic
3. Phone screenshots in numbered order

Play shows the screenshots left to right. The numbered order tells the story from connecting to a host to shipping a pull request.
