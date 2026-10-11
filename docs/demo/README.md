# Harold demo

Remotion cut for the site and the README. The phone frame is drawn here. The screen is the recording from `docs/demo-pipeline/capture.sh`.

```sh
bash ../demo-pipeline/capture.sh
bun install
bun run dev
bunx remotion render src/index.ts HaroldDemo out/harold.mp4
```

`bun run dev` opens the studio so you can scrub the timeline.
