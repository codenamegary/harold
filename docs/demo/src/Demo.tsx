import { AbsoluteFill, useCurrentFrame } from "remotion"
import { sansFamily } from "./fonts"
import { Mark } from "./mark"
import { PhoneFrame, phoneFrameSize } from "./phone"
import { body, fps, ink, mute } from "./theme"

export type CaptureEvent = {
  name: string
  sec: number
}

export type DemoProps = {
  events: CaptureEvent[]
  videoWidth: number
  videoHeight: number
}

const beats: { name: string; text: string }[] = [
  { name: "driver_start", text: "The phone starts unpaired." },
  { name: "tap_pair", text: "It opens the scanner and walks to the pairing code." },
  { name: "paired_chat_visible", text: "Paired. Pick a session." },
  { name: "tap_new_session", text: "Workspace harold. Agent OpenCode." },
  { name: "config_visible", text: "Model, mode, and how hard it thinks." },
  { name: "prompt_typed", text: "It types a prompt and sends it." },
  { name: "reply_visible", text: "The agent answers in the chat." },
]

const captionAt = (events: CaptureEvent[], seconds: number) => {
  let text = "Pair the phone to the daemon on this machine."
  for (const beat of beats) {
    const event = events.find((item) => item.name === beat.name)
    if (event && seconds >= event.sec) {
      text = beat.text
    }
  }
  return text
}

export const Demo: React.FC<DemoProps> = ({ events, videoWidth, videoHeight }) => {
  const frame = useCurrentFrame()
  const size = phoneFrameSize(videoWidth, videoHeight)
  const top = Math.max(24, Math.round((1080 - size.frameHeight) / 2))
  const caption = captionAt(events, frame / fps)

  return (
    <AbsoluteFill style={{ background: ink, fontFamily: sansFamily, color: "#F2F5F8" }}>
      <div style={{ position: "absolute", left: 88, top: 120, width: 680 }}>
        <Mark size={72} />
        <div style={{ fontSize: 84, fontWeight: 600, letterSpacing: -2, marginTop: 22 }}>
          Harold
        </div>
        <div style={{ fontSize: 28, color: body, marginTop: 12, lineHeight: 1.35 }}>
          Hark! The Harold Agents Sing
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 34,
            fontWeight: 500,
            maxWidth: 620,
            lineHeight: 1.3,
            minHeight: 90,
          }}
        >
          {caption}
        </div>
        <div style={{ marginTop: 28, color: mute, fontSize: 22 }}>
          harold start, then harold pair. The phone does the rest.
        </div>
      </div>
      <div style={{ position: "absolute", right: 120, top }}>
        <PhoneFrame videoWidth={videoWidth} videoHeight={videoHeight} />
      </div>
    </AbsoluteFill>
  )
}
