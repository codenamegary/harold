import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"
import { useMemo } from "react"
import { addPose, swayAt, waddleAt, type Pose } from "./body"
import { phoneLayout } from "./camera"
import { celebrationStyle } from "./celebration"
import { ConfettiLayer } from "./confetti"
import { CalloutView, CapView, CardView, NoteView, SpotlightView, BoxView } from "./copy"
import { FontLoader, sansFamily } from "./fonts"
import { PhoneView, rippleProgress } from "./phone"
import { Slide } from "./slides"
import { lightAt, parallax } from "./stage"
import { ContactShadow, PoolGlow, StageBack, StageHaze } from "./stage-view"
import {
  MUSIC_VOLUME,
  activeClip,
  buildTimeline,
  channel,
  phoneFade,
  type DemoProps,
} from "./timeline"
import { ink } from "./theme"

const NO_WADDLE: Pose = { x: 0, y: 0, rotateZ: 0, rotateY: 0, rotateX: 0, scale: 1 }

// The bed is measured, not dialled by ear. music.mp3 is -10.43 LUFS with a
// +0.80 dBTP peak, so MUSIC_VOLUME lands it at -26.3 LUFS / -15.1 dBTP: a
// measured 11 dB under a tap and 7 dB under a real keystroke.
const Music: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig()
  return (
    <Audio
      src={staticFile("music.mp3")}
      loop
      volume={(frame) =>
        interpolate(
          frame,
          [0, 0.8 * fps, durationInFrames - 3 * fps, durationInFrames - 0.4 * fps],
          [0, MUSIC_VOLUME, MUSIC_VOLUME, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      }
    />
  )
}

export const Demo: React.FC<DemoProps> = ({ slices, videoWidth, videoHeight }) => {
  // A phone with no footage is not on stage. The intro and the outro are
  // graphics-only, so an empty handset must never show through the slide.
  const frame = useCurrentFrame()
  const { fps, width: stageW, height: stageH } = useVideoConfig()
  const sec = frame / fps
  const timeline = useMemo(() => buildTimeline(slices), [slices])

  const clip = activeClip(timeline.clips, sec)
  const light = lightAt(timeline.lights, sec)
  const camera = timeline.cameraAt(sec)
  const drift = timeline.driftAt(sec, stageW)
  const layout = phoneLayout(camera, videoWidth, videoHeight, stageW, stageH, drift)
  // Which face of the handset the pool is on. The rim is drawn on that side, so
  // the phone is lit by the floodlight rather than pasted over it.
  const poolX = light.shape.centreX * stageW + parallax("pool", drift.x)
  const litFrom = poolX <= layout.left + layout.width / 2 ? "left" : "right"
  // No footage, no phone on stage: its shadow goes with it.
  const phoneOpacity = clip === null ? 0 : channel(phoneFade, sec)
  const waddle = timeline.waddles.find((cue) => sec >= cue.at && sec <= cue.at + cue.duration)
  const body = timeline.poseAt(sec)
  // A slow idle sway, so a held pose is never a still image. The waddle rides on
  // top of it: the SSH entrance is the same body language, not a one-off.
  const pose = addPose(
    { ...body, rotateZ: body.rotateZ + swayAt(sec, 0.45) },
    waddle === undefined ? NO_WADDLE : waddleAt(waddle, sec),
  )
  const ripples = timeline.ripples
    .map((ripple) => ({ ...ripple, progress: rippleProgress(sec, ripple.at) }))
    .filter((ripple) => ripple.progress > 0 && ripple.progress < 1)

  const intro = timeline.scenes[0]
  const outro = timeline.scenes[timeline.scenes.length - 1]
  const ssh = timeline.scenes.find((scene) => scene.slug === "ssh")
  const introOpacity = interpolate(
    sec,
    [0, (ssh?.from ?? 3.5) - 0.5, (ssh?.from ?? 3.5) + 0.05],
    [1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )
  const outroOpacity = interpolate(sec, [outro.from, outro.from + 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <AbsoluteFill style={{ background: ink, fontFamily: sansFamily }}>
      <FontLoader />
      <Music />

      {/* back: wall and floor, then the pool */}
      <StageBack light={light} drift={drift.x} />
      <PoolGlow light={light} drift={drift.x} />
      {/* the phone's shadow on the lit floor, so it stands in the light */}
      <ContactShadow layout={layout} light={light} opacity={phoneOpacity} />

      {/* Notes slide out from behind the phone, so they are drawn before it. */}
      {timeline.copy
        .filter((item) => item.kind === "note")
        .map((item) => (
          <NoteView key={`note-${item.at}`} item={item} sec={sec} layout={layout} />
        ))}

      {/* phone: the mid layer */}
      <PhoneView
        layout={layout}
        clip={clip}
        sec={sec}
        ripples={ripples}
        pose={pose}
        pop={celebrationStyle(timeline.celebrations, sec)}
        opacity={phoneOpacity}
        light={light}
        litFrom={litFrom}
      />

      {/* haze: the nearest layer, so it passes over the phone */}
      <StageHaze light={light} drift={drift.x} sec={sec} />

      {/* confetti falls in the light */}
      <ConfettiLayer bursts={timeline.confetti} sec={sec} light={light.shape} />

      {/* copy */}
      {timeline.copy.map((item, index) => {
        switch (item.kind) {
          case "card":
            return <CardView key={`card-${index}`} item={item} sec={sec} layout={layout} />
          case "callout":
            return <CalloutView key={`callout-${index}`} item={item} sec={sec} layout={layout} />
          case "spotlight":
            return <SpotlightView key={`spot-${index}`} item={item} sec={sec} />
          case "box":
            return <BoxView key={`box-${index}`} item={item} sec={sec} layout={layout} />
          case "cap":
            return <CapView key={`cap-${index}`} item={item} sec={sec} />
          case "note":
            return null
        }
      })}

      {/* intro and outro: the only graphics-only scenes */}
      {sec < intro.to + 0.4 ? (
        <Slide variant="intro" sec={sec - intro.from} opacity={introOpacity} light={light.shape} />
      ) : null}
      {sec >= outro.from ? (
        <Slide
          variant="outro"
          sec={sec - outro.from}
          opacity={outroOpacity}
          light={light.shape}
        />
      ) : null}

      {/* sound effects: real taps, real keystrokes, one ping per copy primitive */}
      {timeline.sounds.map((sound, index) => (
        <Sequence key={`sfx-${index}`} from={Math.round(sound.at * fps)}>
          <Audio src={staticFile(`sfx/${sound.name}.wav`)} volume={sound.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
