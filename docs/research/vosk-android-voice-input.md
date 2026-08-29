# Vosk on Android: continuous voice input and silence detection

Checked: 2026-08-25

Scope: replace Android `SpeechRecognizer` (Google) with on-device Vosk.
Focus: continuous listen loop, configurable silence (N seconds then finalize or restart).
Sources: Alpha Cephei docs, `vosk-android-demo`, `vosk-api` (C/Java/Android).

## Verdict

Vosk already endpoint-detects silence via Kaldi’s online endpointer.
`acceptWaveForm` returns true when an utterance ends.
You control trailing silence with `setEndpointerMode` / `setEndpointerDelays`.
Official Android `SpeechService` is already a continuous mic loop.
App-level RMS/energy silence is not what the official path uses.

## How Android integration works

### Dependency

Add the AAR from Maven Central
([install](https://alphacephei.com/vosk/install)):

```gradle
implementation 'com.alphacephei:vosk-android:0.3.75@aar'
implementation 'net.java.dev.jna:jna:5.18.1@aar'
```

Demo pins `0.3.75`
([demo `app/build.gradle`](https://github.com/alphacep/vosk-android-demo/blob/master/app/build.gradle)).

### Typical pipeline

1. Unpack model from assets to app storage (`StorageService.unpack`).
2. Build `org.vosk.Recognizer` with model + sample rate (demo uses 16000 Hz).
3. Start `SpeechService` with that recognizer.
4. `SpeechService` opens `AudioRecord` (VOICE_RECOGNITION, mono, PCM 16-bit).
5. Background thread reads ~0.2 s buffers and calls `recognizer.acceptWaveForm`.
6. Listener gets partials or finals.

Evidence:

- Demo UI and mic path:
  [VoskActivity.java](https://github.com/alphacep/vosk-android-demo/blob/master/app/src/main/java/org/vosk/demo/VoskActivity.java)
- Recorder + loop:
  [SpeechService.java](https://github.com/alphacep/vosk-api/blob/master/android/lib/src/main/java/org/vosk/android/SpeechService.java)
- Android overview:
  [alphacephei.com/vosk/android](https://alphacephei.com/vosk/android)

### Result callbacks

[`RecognitionListener`](https://github.com/alphacep/vosk-api/blob/master/android/lib/src/main/java/org/vosk/android/RecognitionListener.java):

| Callback | When |
| --- | --- |
| `onPartialResult` | `acceptWaveForm` false. Still decoding. |
| `onResult` | `acceptWaveForm` true. Silence / endpoint hit. Utterance JSON ready. |
| `onFinalResult` | Stream stopped. Flush with `getFinalResult`. |
| `onTimeout` | Optional wall-clock listen timeout expired. |
| `onError` | Recorder or other failure. |

C API matches this: accept returns 1 when silence occurs and you may call `result`
([vosk_api.h](https://github.com/alphacep/vosk-api/blob/master/src/vosk_api.h)).

Java wrapper:
[Recognizer.java](https://github.com/alphacep/vosk-api/blob/master/java/lib/src/main/java/org/vosk/Recognizer.java).

### Continuous listening in the demo

`SpeechService.startListening(listener)` runs until `stop()` / interrupt.
No silence timeout stops the service.
After each endpoint, `onResult` fires and the loop keeps reading mic data
([SpeechService.java](https://github.com/alphacep/vosk-api/blob/master/android/lib/src/main/java/org/vosk/android/SpeechService.java)).

Optional: `startListening(listener, timeoutMs)` stops after N ms of listening
(wall clock sample count), then `onTimeout`. That is not silence detection.

Same streaming pattern on desktop:
[test_microphone.py](https://github.com/alphacep/vosk-api/blob/master/python/example/test_microphone.py).

## Do you control end-of-utterance timing?

Yes. Two layers:

### 1. Built-in Kaldi endpointer (preferred)

`AcceptWaveform` advances decoding, then checks `decoder_->EndpointDetected(endpoint_config_)`
([recognizer.cc](https://github.com/alphacep/vosk-api/blob/master/src/recognizer.cc)).

Configure:

- `setEndpointerMode(mode)` — scales trailing-silence rules
  (`DEFAULT=0`, `SHORT=1`, `LONG=2`, `VERY_LONG=3`).
  Scales rules 2–4 by 0.5 / 0.75 / 1.5 / 4.0
  ([recognizer.cc](https://github.com/alphacep/vosk-api/blob/master/src/recognizer.cc)).
- `setEndpointerDelays(t_start_max, t_end, t_max)` — sets absolute delays:
  - `t_start_max` → rule1 min trailing silence (initial silence before speech)
  - `t_end` → rule2 (and rule3 = t_end+0.5, rule4 = t_end+1.0)
  - `t_max` → rule5 `min_utterance_length` (force end of long utterance)

Header comments say “milliseconds” but values are Kaldi seconds.
Demo model defaults use `0.5`, `0.75`, `1.0`
([model.conf in android demo](https://github.com/alphacep/vosk-android-demo/blob/master/models/src/main/assets/model-en-us/conf/model.conf)).
Official example: `SetEndpointerDelays(0.5, 0.3, 10.0)`
([test_ep.py](https://github.com/alphacep/vosk-api/blob/master/python/example/test_ep.py)).
Treat parameters as **seconds**.

`setWords(true)` adds per-word start/end/conf in final JSON.
It does not change endpoint timing
([Recognizer.java](https://github.com/alphacep/vosk-api/blob/master/java/lib/src/main/java/org/vosk/Recognizer.java),
[vosk_api.h](https://github.com/alphacep/vosk-api/blob/master/src/vosk_api.h)).

Force finalize without waiting for silence: `getFinalResult()` / `FinalResult`
([vosk_api.h](https://github.com/alphacep/vosk-api/blob/master/src/vosk_api.h)).

Reset for a fresh utterance: `reset()`
([Recognizer.java](https://github.com/alphacep/vosk-api/blob/master/java/lib/src/main/java/org/vosk/Recognizer.java)).

### 2. App-level listen timeout

`SpeechService` timeout is total listen duration in ms, not silence.
Use when you want “stop after N seconds of listening” regardless of speech
([SpeechService.java](https://github.com/alphacep/vosk-api/blob/master/android/lib/src/main/java/org/vosk/android/SpeechService.java)).

## Recommended approach for “N seconds silence then commit”

Use the built-in endpointer. Do not invent RMS silence first.

### Continuous listen, commit each pause, keep listening

1. Unpack model. Create `Recognizer(model, 16000f)`.
2. Call `setEndpointerDelays(t_start_max, N, t_max)` where `N` is desired
   trailing silence in **seconds** after speech (e.g. `2.0` for 2 s).
   Or use `setEndpointerMode` if coarse presets are enough.
3. `SpeechService(rec, 16000f).startListening(listener)` with no timeout.
4. On `onResult`, treat JSON `text` as committed utterance. Loop continues.
5. On user stop: `speechService.stop()` → `onFinalResult` for leftover audio.

Matches demo mic behavior plus explicit delay config
([VoskActivity](https://github.com/alphacep/vosk-android-demo/blob/master/app/src/main/java/org/vosk/demo/VoskActivity.java),
[test_ep.py](https://github.com/alphacep/vosk-api/blob/master/python/example/test_ep.py)).

### Single utterance then stop (or auto-restart)

Same as above, but in `onResult`:

- stop the service and hand text to the UI, or
- `reset()` / restart `startListening` if you want a fresh session boundary.

`onResult` already means “silence occurred”
([RecognitionListener](https://github.com/alphacep/vosk-api/blob/master/android/lib/src/main/java/org/vosk/android/RecognitionListener.java)).

### When would you use RMS / energy?

Official Android path does not measure buffer RMS for endpointing.
Silence for accept=true comes from Kaldi `OnlineEndpointConfig`
([recognizer.cc](https://github.com/alphacep/vosk-api/blob/master/src/recognizer.cc)).
`OnlineSilenceWeighting` inside the recognizer is feature weighting, not an app API.

App RMS only makes sense for extra UX (VU meter, wake-from-idle) on top of Vosk.
Not required for “N seconds silence then finalize.”

## Models: size, packaging, licensing

### Size (official)

Site: portable models ~50 Mb. Small models ~300 Mb RAM at runtime. Big models up to ~16 Gb for servers
([vosk home](https://alphacephei.com/vosk/),
[models](https://alphacephei.com/vosk/models)).

Android guidance: keep models small. Unpack into assets. Check demo sizes
([android docs](https://alphacephei.com/vosk/android)).

Example English small: `vosk-model-small-en-us-0.15` = 40M, Apache 2.0,
“Lightweight wideband model for Android and RPi”
([models](https://alphacephei.com/vosk/models)).

### Bundle in APK (official demo)

- Model lives under `models` Android library assets (`model-en-us/...`)
  ([demo tree](https://github.com/alphacep/vosk-android-demo/tree/master/models)).
- Gradle generates a `uuid` file so `StorageService` can detect updates
  ([models/build.gradle](https://github.com/alphacep/vosk-android-demo/blob/master/models/build.gradle)).
- At runtime: `StorageService.unpack(context, "model-en-us", "model", ...)`
  copies assets → `getExternalFilesDir`, then `new Model(path)`
  ([StorageService.java](https://github.com/alphacep/vosk-api/blob/master/android/lib/src/main/java/org/vosk/android/StorageService.java),
  [VoskActivity](https://github.com/alphacep/vosk-android-demo/blob/master/app/src/main/java/org/vosk/demo/VoskActivity.java)).

APK cost: full model folder is in the package (tens of MB for small English).
Native AAR + JNA add more. Exact APK size depends on ABIs
(demo filters `armeabi-v7a`, `arm64-v8a`, `x86_64`, `x86`
([app/build.gradle](https://github.com/alphacep/vosk-android-demo/blob/master/app/build.gradle))).

### Download at runtime

Official docs emphasize assets unpack for Android
([android docs](https://alphacephei.com/vosk/android)).
Models are downloadable from the [models page](https://alphacephei.com/vosk/models).
`Model` only needs a filesystem path
([vosk_api.h](https://github.com/alphacep/vosk-api/blob/master/src/vosk_api.h)).
So download-to-files-dir then `new Model(path)` is viable.
Not shown in the official Android demo. You own download, verify, and update.

### Licensing

| Piece | License (official) |
| --- | --- |
| vosk-api / Android lib / demo | Apache 2.0 ([COPYING](https://github.com/alphacep/vosk-api/blob/master/COPYING), [demo COPYING](https://github.com/alphacep/vosk-android-demo/blob/master/COPYING)) |
| Most small mobile models (e.g. en-us 0.15) | Apache 2.0 ([models](https://alphacephei.com/vosk/models)) |
| Some models | AGPL, LGPL-3.0, CC-BY-NC-SA, MIT, GPLv3 per model row ([models](https://alphacephei.com/vosk/models)) |

Pick the model’s license row before shipping. Do not assume all models are Apache.

## Mapping from Android SpeechRecognizer

| Google `SpeechRecognizer` idea | Vosk equivalent |
| --- | --- |
| Cloud / on-device Google engine | Offline Kaldi model on device ([vosk](https://alphacephei.com/vosk/)) |
| `startListening` | `SpeechService.startListening` |
| Partial results | `onPartialResult` |
| Final results | `onResult` (per utterance) / `onFinalResult` (stop) |
| Endpointer / silence | `setEndpointerDelays` / `setEndpointerMode` |
| Continuous conversation | Keep `SpeechService` running (default) |

## Gaps / caveats from primary sources

- Header text says endpointer delays are “milliseconds.” Implementation and model.conf use seconds. Prefer seconds.
- Android Java `Recognizer` exposes endpointer APIs in the shared Java binding.
  Confirm your AAR version includes them (demo uses `0.3.75`). Older AARs may lack `setEndpointerDelays`.
- Demo does not show downloadable models or RMS silence.
- Big server models are not for phones ([models](https://alphacephei.com/vosk/models)).

## Primary source index

| Source | URL |
| --- | --- |
| Vosk home | https://alphacephei.com/vosk/ |
| Android docs | https://alphacephei.com/vosk/android |
| Install / Maven | https://alphacephei.com/vosk/install |
| Models + licenses | https://alphacephei.com/vosk/models |
| Android demo | https://github.com/alphacep/vosk-android-demo |
| vosk-api | https://github.com/alphacep/vosk-api |
| C API | https://github.com/alphacep/vosk-api/blob/master/src/vosk_api.h |
| Recognizer impl | https://github.com/alphacep/vosk-api/blob/master/src/recognizer.cc |
| Android SpeechService | https://github.com/alphacep/vosk-api/blob/master/android/lib/src/main/java/org/vosk/android/SpeechService.java |
| Endpointer example | https://github.com/alphacep/vosk-api/blob/master/python/example/test_ep.py |
