# Android store assets

Ready-to-upload Google Play assets for the Harold Android app. The listing copy is in [store-listing.md](./store-listing.md). The privacy policy draft is in [privacy-policy.md](./privacy-policy.md).

## Files

| File                           | Use                  | Spec                                |
| ------------------------------ | -------------------- | ----------------------------------- |
| `app-icon-512x512.png`         | Play store icon      | 512 x 512 PNG, opaque, under 1 MB   |
| `feature-graphic-1024x500.png` | Play feature graphic | 1,024 x 500 PNG, under 15 MB        |
| `phone-01-pairing.png`         | Phone screenshot 1   | 1,080 x 1,920 PNG, 9:16, under 8 MB |
| `phone-02-sessions.png`        | Phone screenshot 2   | 1,080 x 1,920 PNG, 9:16, under 8 MB |
| `phone-03-plan.png`            | Phone screenshot 3   | 1,080 x 1,920 PNG, 9:16, under 8 MB |
| `phone-04-answer.png`          | Phone screenshot 4   | 1,080 x 1,920 PNG, 9:16, under 8 MB |
| `phone-05-build.png`           | Phone screenshot 5   | 1,080 x 1,920 PNG, 9:16, under 8 MB |
| `phone-06-changes.png`         | Phone screenshot 6   | 1,080 x 1,920 PNG, 9:16, under 8 MB |
| `phone-07-worktrees.png`       | Phone screenshot 7   | 1,080 x 1,920 PNG, 9:16, under 8 MB |
| `phone-08-ship.png`            | Phone screenshot 8   | 1,080 x 1,920 PNG, 9:16, under 8 MB |

## Sources

- The icon uses the slanted prism from `apps/android/app/src/main/res/drawable/ic_launcher_foreground.xml` on the brand lime background.
- The feature graphic uses the Geist and Geist Mono fonts from Google Fonts. The font files and OFL license are in `src/fonts`.
- The screenshots come from the recorded demo slices in `docs/demo/render/public/slices`. The build script extracts one stable frame from each clip.

## Rebuild

Needs ImageMagick, ffmpeg, and a Chrome binary.

```sh
bash docs/store-android/src/build-assets.sh
```

The script rebuilds the icon, feature graphic, and all eight screenshots. Set `CHROME` if Chrome is not on the path.

## Validate

The store asset check verifies the Play size, dimension, format, and aspect ratio limits:

```sh
bun test scripts/checks/store-assets.test.ts
```

## Upload order

1. App icon
2. Feature graphic
3. Phone screenshots in numbered order

Play shows the screenshots left to right. The numbered order tells the story from pairing to shipping a pull request.
