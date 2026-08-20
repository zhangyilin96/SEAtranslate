# Open-source translator research: LunaTranslator and MORT

Date: 2026-08-20  
Scope: design research for Dota Scout / SEA Translate only

## 1. Research boundary

This review covers only screen/OCR translation patterns that can be used without
entering or modifying the game process:

- OCR region selection and fixed-region capture;
- binding capture to a visible game window;
- screen capture, OCR scheduling, change detection, and deduplication;
- language and translation-provider boundaries;
- latency, caching, presentation, and OCR performance.

Explicitly excluded:

- process injection, DLL loading, text hooks, memory reads, or hidden game state;
- embedded modification of game text;
- anti-cheat bypass or stealth techniques.

No source code from either project was copied into Dota Scout. LunaTranslator is
GPL-3.0, so its implementation is treated as design reference only. MORT is MIT,
but this review still recommends adapting ideas to the existing Dota Scout
pipeline rather than importing its application architecture.

Reviewed revisions:

| Project | Revision reviewed | License |
| --- | --- | --- |
| [LunaTranslator](https://github.com/HIllya51/LunaTranslator/tree/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70) | `4b5e7c63fe1e56ae2f08c231cd8718d17da61e70` (2026-08-20) | [GPL-3.0](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/LICENSE) |
| [MORT](https://github.com/killkimno/MORT/tree/117f72a53af1e4faf3b83a281479b6791c622319) | `117f72a53af1e4faf3b83a281479b6791c622319` (2026-08-15) | [MIT](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/LICENSE) |

## 2. Executive findings

The most useful combined pattern is a staged gate:

```text
capture fixed ROI
  -> cheap image-change check
  -> wait until the ROI is stable
  -> OCR only when stable and different from the last OCR image
  -> normalize and line-diff
  -> deduplicate in a bounded time window
  -> detect language per new line
  -> glossary-aware provider request
  -> publish a small immutable view model to the Widget
```

LunaTranslator is the stronger reference for deciding **when not to run OCR**.
MORT is the stronger reference for window-bound Windows Graphics Capture, keeping
capture/OCR/translation/presentation responsibilities separate, retaining a
small translation memory, and coping with capture target movement or resize.

Neither project supplies the exact SEA mixed-chat language stage Dota Scout
needs. Both are primarily configured around a selected OCR/source language.
Dota Scout should therefore keep language detection as its own line-level stage,
not hide it inside an OCR or translation provider.

Their overlay implementations are not suitable replacements for the selected
Xbox Game Bar host. Luna uses a topmost desktop window and MORT's README states
that its own overlay does not support exclusive fullscreen. Their presentation
ideas are useful; their host mechanisms are not the product route.

## 3. Feature-by-feature analysis

### 3.1 OCR region selection

LunaTranslator:

- represents each OCR region with a separately movable/resizable range UI;
- can keep one region or enable multiple regions;
- persists the selected rectangles and restores them on the next run;
- can temporarily hide the range UIs while taking a manual capture, preventing
  the selector itself from contaminating the image;
- lets the user focus one range without discarding the others.

Relevant sources: [range manager and persistence](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/src/LunaTranslator/textio/textsource/ocrtext.py), [range UI](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/src/LunaTranslator/gui/rangeselect.py).

MORT:

- uses visible resizable forms as OCR rectangles and exposes their exact size and
  screen position;
- supports multiple normal areas and separate exception areas;
- broadcasts move/resize changes back to current capture settings;
- enforces minimum dimensions and keeps regions inside usable monitor bounds;
- separates normal, quick, snapshot, and mouse-follow regions.

Relevant sources: [OcrAreaForm](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/OcrAreaForm.cs), [FormManager region lifecycle](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/Manager/FormManager.cs).

Use for Dota Scout:

- retain the existing `RegionSelector` and saved normalized rectangle;
- add a small minimum-size and monitor-bound validation before saving;
- keep one chat ROI for the first product version; multi-region support is not
  required for Dota chat and would add configuration cost;
- store enough target metadata to detect a monitor, scale, or resolution change
  and require re-selection instead of silently cropping the wrong pixels.

### 3.2 Fixed-region capture and game/window binding

LunaTranslator documents a useful user-level contract when an OCR source is
bound to a game window:

- capture only the selected window rather than whatever happens to cover it;
- move the OCR range with the bound window;
- keep the translation window out of its own capture;
- validate foreground process identity before accepting keyboard/mouse triggers.

Relevant sources: [window-binding behavior](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/docs/zh/gooduse/gooduseocr.md), [window-aware crop](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/src/LunaTranslator/myutils/ocrutil.py).

MORT uses `GraphicsCapturePicker` to obtain a `GraphicsCaptureItem`, creates a
capture session for that item, and tracks the target's DWM extended frame bounds.
It disables cursor capture and recreates frame resources after a target resize.
Its fallback mapping from capture item to HWND compares window title and size;
that is pragmatic but can be ambiguous when two windows share a title.

Relevant sources: [picker and target association](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/ScreenCapture/PopupScreenCapture.xaml.cs), [window filtering](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/ScreenCapture/WindowEnumerationHelper.cs), [capture bounds](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/ScreenCapture/ScreenCaptureProcesser.cs).

Use for Dota Scout:

- keep Dota process detection as a foreground/run-state gate, not a source of
  hidden game information;
- prefer a user-approved visible-window capture item if a later capture backend
  is introduced;
- represent the ROI in target-client coordinates and recompute screen placement
  when the target moves;
- never identify a target by title alone; retain stable PID/HWND/session metadata
  and invalidate it when the process exits.

### 3.3 Screen capture

LunaTranslator performs a native crop for the requested rectangle and permits an
optional preprocessing module before OCR. It also masks its own translation UI
when a window-specific capture method cannot exclude it. This is a good example
of making capture contamination an explicit failure mode.

MORT's attached-window path uses Windows Graphics Capture with a two-frame D3D11
frame pool. The frame callback keeps a recent BGRA buffer, handles content-size
changes, disables the cursor, and records the captured window position. OCR-area
crops are produced downstream from that buffer. MORT also keeps a small number
of backup frames and periodically refreshes a latest-frame copy when OCR is not
actively requesting one.

Relevant sources: [Luna crop and preprocessing](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/src/LunaTranslator/textio/textsource/ocrtext.py), [MORT WGC frame processing](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/ScreenCapture/ScreenCaptureProcesser.cs), [MORT image-model boundary](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/Service/ProcessTranslateService/TranslationImageModelService.cs).

Use for Dota Scout:

- the present Electron screenshot path is sufficient for a first OCR benchmark;
- crop as early as the current API permits and keep the captured ROI out of React
  state and IPC logs;
- if full-screen capture/canvas encoding becomes the measured bottleneck, replace
  only the capture adapter with a user-approved WGC target; do not rewrite the
  downstream pipeline;
- do not add a native capture backend before latency/CPU profiling proves the
  existing route is inadequate.

### 3.4 OCR triggering and text-change detection

LunaTranslator provides three relevant modes:

1. fixed-period execution;
2. image analysis;
3. keyboard/mouse trigger followed by a delay and stability wait.

The image-analysis mode maintains two distinct comparisons:

- current frame versus previous frame: is the image stable enough to OCR?
- current stable frame versus the last frame sent to OCR: did content actually
  change enough to justify OCR?

After OCR, it also compares the recognized string with the previous OCR string
using edit distance, which suppresses minor OCR jitter. This separation between
`last frame`, `last OCR frame`, and `last OCR text` is the most directly reusable
idea in this review.

Relevant sources: [automation implementation](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/src/LunaTranslator/textio/textsource/ocrtext.py), [parameter explanation](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/docs/zh/ocrparam.md).

MORT uses a configurable OCR interval (2 seconds by default in the reviewed
service). It performs OCR, normalizes line breaks, compares the full OCR string
with the prior string, and translates/publishes only on a difference. When text
is unchanged, it still repaints an overlay at a slower 1-second cadence because
the target window or OCR geometry may have moved.

Relevant source: [MORT processing loop](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/Service/ProcessTranslateService/ProcessTranslateService.cs).

Use for Dota Scout:

- start with a cheap ROI image fingerprint every 150–250 ms;
- require two close samples, or a short debounce, before declaring the ROI stable;
- run OCR only after a meaningful image change and stability;
- keep a slower forced OCR heartbeat (for example 2–3 seconds) to recover from a
  missed image threshold;
- expose capture, gate, OCR, translation, and Widget-ack timings separately.

This is a future OCR task. It was not implemented during the current IPC stage.

### 3.5 Deduplication and recent-message memory

LunaTranslator's OCR-stage edit-distance gate is good at suppressing recognition
jitter, but it operates on the whole recognized text. MORT similarly compares
the full current OCR string with the previous string. MORT also caches translation
results by source/provider and retains a bounded, optionally expiring list of
recent displayed translations.

Relevant sources: [Luna OCR text distance](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/src/LunaTranslator/textio/textsource/ocrtext.py), [MORT recent result memory](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/Service/ProcessTranslateService/TranslateResultMemoryService.cs), [MORT provider result cache](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/Manager/TransManager.cs).

Use for Dota Scout:

- treat the OCR result as an ordered list of chat lines, not one document;
- diff the new normalized list against the previous list and emit only appended
  or genuinely changed lines;
- use a bounded time-aware dedupe cache such as `(fingerprint, firstSeenAt,
  lastSeenAt)`, not a permanent session-wide set;
- allow an identical chat phrase to appear again after a short expiry because
  repeated calls such as `back` or `rs` are legitimate Dota messages;
- keep Widget presentation history fixed at three lines independently from the
  larger dedupe/translation cache.

The current Dota Scout `seen` set is capped by count but effectively suppresses
an identical line until the set is rebuilt. Before production OCR, replace that
behavior with list diff plus TTL dedupe.

### 3.6 Language detection

Neither reviewed project demonstrates a reusable, explicit per-line language
classifier for mixed English/Thai/Malay/Indonesian chat:

- LunaTranslator generally maps a configured source language into each provider;
  individual providers may offer their own auto-detection behavior;
- MORT configures OCR and translation source codes and maps them into provider-
  specific language codes. It includes Thai and Indonesian mappings, but this is
  configuration, not detection.

Use for Dota Scout:

- keep `detectLanguage(text) -> { language, confidence, scriptEvidence }` between
  dedupe and translation;
- detect Thai script deterministically first;
- distinguish Indonesian/Malay/English with a small local classifier or provider
  detection, while allowing `unknown` for very short Dota calls;
- let glossary/context override provider ambiguity for tokens such as `rs`, `bb`,
  `bkb`, `tp`, and lane abbreviations;
- store the selected language in the message envelope sent to the Widget.

### 3.7 Translation-provider abstraction and low latency

LunaTranslator uses a base translator class with per-provider subclasses. The
base owns language mapping, a priority queue, request spacing, result cache,
initialization/reinitialization, and streaming callbacks. For automatic input it
can abandon stale queued work when a newer request exists, while still caching a
request that already consumed provider resources.

Relevant source: [Luna base translator](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/src/LunaTranslator/translator/basetranslator.py).

MORT centralizes provider selection more heavily, but demonstrates three useful
behaviors: a stable custom HTTP API contract, batching multiple uncached lines
with split tokens, and translating only cache misses. It also propagates
cancellation into providers that support it.

Relevant sources: [MORT custom-provider contract](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/README.en.md), [provider dispatch and cache](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/Manager/TransManager.cs).

Use for Dota Scout:

```text
TranslationProvider.translate({
  text,
  sourceLanguage,
  targetLanguage: "zh-CN",
  glossaryVersion,
  signal
}) -> { translated, detectedLanguage?, provider, elapsedMs }
```

- keep provider choice outside UI and OCR code;
- cache by normalized source, source language, target language, glossary version,
  and provider;
- maintain at most one in-flight automatic request per message sequence and drop
  stale results before publication;
- prefer concise per-line requests for chat, with an optional one-line context
  hint rather than batching unrelated players' messages;
- measure provider time separately from Desktop-to-Widget IPC time.

### 3.8 Overlay presentation

LunaTranslator uses a frameless topmost desktop window and can toggle mouse
transparency while keeping a small toolbar interaction zone available. MORT has
multiple presentation skins behind an `ITransform` interface; its layered forms
separate text updates from painting and can toggle `WS_EX_TRANSPARENT`. MORT also
keeps a slower paint path alive when capture geometry changes without new text.

Relevant sources: [Luna presentation window](https://github.com/HIllya51/LunaTranslator/blob/4b5e7c63fe1e56ae2f08c231cd8718d17da61e70/src/LunaTranslator/gui/translatorUI.py), [MORT presentation interface](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/Interface/ITransform.cs), [MORT layered presentation](https://github.com/killkimno/MORT/blob/117f72a53af1e4faf3b83a281479b6791c622319/MORT/TransFormLayer.cs).

Use for Dota Scout:

- keep presentation behind the existing immutable Widget state envelope;
- keep only three lines, stable order, explicit language labels, and user opacity;
- let Xbox Game Bar remain the authority for pinned/click-through state;
- keep Native HWND Overlay only as fallback/debug/desktop preview;
- do not port Luna or MORT topmost-window code into the main overlay route.

## 4. Comparison matrix

| Concern | LunaTranslator | MORT | Dota Scout decision |
| --- | --- | --- | --- |
| Region selection | Adjustable, persistent, optional multi-region | Resizable persistent forms, multi/exception areas | Keep one normalized chat ROI initially |
| Window binding | Bound HWND, range follows window, capture avoids occlusion | User-selected WGC item plus HWND/bounds association | Later capture adapter may use user-approved WGC |
| Capture | Native window/region crop, optional preprocess | WGC + D3D11 two-frame pool, latest BGRA buffer | Benchmark current Electron path first |
| Trigger | Periodic, image-analysis, input trigger + stability | Configurable interval and one-shot paths | Image gate + stability + slow heartbeat |
| Change detection | Frame stability, last-OCR-image difference, OCR edit distance | Exact previous OCR string comparison | ROI fingerprint then ordered line diff |
| Deduplication | Whole-text distance | Exact text plus result memory/cache | TTL line fingerprint, allow legitimate repeats |
| Language | Mostly configured/provider-specific | Configured OCR/source/provider codes | Explicit line-level SEA detector |
| Provider design | Base class, queue, cache, spacing, streaming | Central dispatch, custom API, batching, cache | Small provider interface + cancellation + metrics |
| Latency | Avoids unnecessary OCR; drops stale queued work | WGC latest frame; cache only misses | Backpressure at each stage; report stage timings |
| Presentation | Desktop topmost/click-through | Several desktop/layered skins | Keep Xbox Game Bar Widget host |

## 5. Proposed Dota Scout pipeline boundaries

These are design recommendations for a later, user-approved OCR stage. They are
not part of the current Desktop-to-Widget implementation.

```text
CaptureAdapter
  -> RegionFrame

ImageChangeGate
  -> stable changed RegionFrame | no-op

OcrAdapter
  -> OcrDocument { lines, elapsedMs }

ChatLineDiffer
  -> NewChatLine[]

TtlDeduplicator
  -> unique NewChatLine[]

LanguageDetector
  -> DetectedChatLine[]

TranslationProvider + DotaGlossary
  -> TranslatedChatLine[]

WidgetPublisher
  -> versioned full-state snapshot, latest 3
```

Rules for the future implementation:

- every stage accepts/returns plain data and can be tested without Dota running;
- cancellation/sequence checks prevent stale OCR or provider results from
  overwriting newer chat;
- errors are stage-specific and do not clear the last valid Widget state;
- raw screenshots are not persisted by default;
- no stage opens, injects into, hooks, or reads memory from `dota2.exe`;
- Widget publication remains independent from OCR/provider implementation.

## 6. Recommendation after the IPC stage

Do not start OCR implementation yet. The next single task should be a user-run
acceptance pass of the newly dynamic Widget inside Dota 2, especially exclusive
fullscreen stability and perceived mouse latency with Game Bar click-through
enabled. Only after that host gate is accepted should the team define an OCR
benchmark around the existing capture path and the staged change gate above.
