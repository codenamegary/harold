# Harold demo

Remotion cut for the site and the README. The terminal and the phone frame are drawn here. The phone screen is the recording from `docs/demo-pipeline/capture.sh`.

| File               | Role                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| `Demo.tsx`         | Stage layout: title card, header, terminal, phone, step caption, end card |
| `terminal.tsx`     | Terminal window, type-on commands, scrolling, QR drawn from the grid      |
| `terminal-data.ts` | The transcript, timed to the capture marks                                |
| `qr-rows.ts`       | The CLI's half-block QR output from the recorded run                      |
| `qr-matrix.ts`     | Decodes those rows into a module grid so the QR renders as crisp squares  |
| `steps.ts`         | One caption per capture mark, shown under the phone                       |
| `theme.ts`         | Brand tokens and the stage measurements                                   |

The cut is a short title card, the capture, then a four second end card. The lockup is one element: it shrinks from the title card into the header, and grows back for the end card.

```sh
bash ../demo-pipeline/capture.sh
bun install
bun run dev
bunx remotion render src/index.ts HaroldDemo out/harold.mp4
```

`bun run dev` opens the studio so you can scrub the timeline.
