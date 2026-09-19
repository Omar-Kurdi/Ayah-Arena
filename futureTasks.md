# Future tasks

Things to revisit, in one place. Update the status as work lands.

**Priority** — P1: next up, or blocks something important · P2: should happen · P3: idea / nice to have
**Status** — ✅ Done · 🟡 Partly done · ⬜ Not started

---

## Recitation checking (on-device speech model)

Tarteel has no public API. The plan is Tarteel's open Whisper fine-tune running in the
reader's browser, so audio never leaves the device, with the transcript graded by the same
gentle word-matching as typed answers. **Scope limit:** it may only answer "did these words
come back". Judging tajweed or pronunciation quality stays off the table.

| Task | Priority | Status | Notes |
|---|---|---|---|
| Step 0a — evaluate base model (~72MB class) on professional reciters | P1 | ✅ | `scripts/asr-spike/eval.mjs`. 96 clips, 4 reciters (incl. mujawwad): 100% of correct recitations held, 0% false accepts, ~20× faster than real time on CPU. **Caveat:** these reciters are very likely in the training data (EveryAyah), so this proves the pipeline, not the product. Results in `scripts/asr-spike/results.json`. |
| Step 0b — evaluate on real learners' recordings | P1 | ⬜ | The result that decides the feature. Record 20–30 ayat on a phone: your own voice, others (with consent), a child if possible, and some deliberate mistakes. Name them `<surah>_<ayah>.m4a` and run `eval.mjs --dir <folder>`. Go/no-go gate for step 1. |
| Re-export the base model to actually hit ~72MB | P1 | ⬜ | The available ONNX conversion downloads **~196MB** in transformers.js (fp32 encoder 79MB + merged 4-bit decoder 118MB). Its int8 encoder uses `ConvInteger`, which onnxruntime's CPU backend can't run. Re-export `tarteel-ai/whisper-base-ar-quran` with Optimum and quantize so the browser download is ~72MB. Blocks shipping step 1. |
| Test the smaller ~38MB model (whisper-tiny-ar-quran) | P2 | ⬜ | Same `eval.mjs` runs, both professional and own recordings. Compare accuracy and false accepts against base; if tiny holds up, it halves the download. Candidate ONNX: `Sharjeelbaig/whisper-tiny-ar-quran-onnx`. |
| Ayat longer than 30 seconds | P2 | ⬜ | Whisper hears 30s at a time. 24 of 120 sampled clips were longer and were left out. Needs chunking with overlap, then stitching transcripts before grading. |
| Browser runtime check | P2 | ⬜ | WebGPU with WASM fallback in a Web Worker. Test Chrome/Android, Safari/iOS, and a low-memory phone; measure first-load and per-ayah latency. |
| Step 1 — opt-in "check by listening" in recite mode | P2 | ⬜ | Blocked on 0b and the re-export. Mic requested only on click; download size shown before downloading; every result can be overridden ("that's not what I said"), falling back to self-grade. Needs explicit sign-off (standing rule on AI features). |
| Step 2 — live word-by-word follow-along | P3 | ⬜ | Streaming transcription while reciting. Much heavier; only after step 1 proves itself. |

## Roadmap from the original brief

| Task | Priority | Status | Notes |
|---|---|---|---|
| Solo drill (typed + recited), whole Quran, any juz or surah | P1 | ✅ | |
| Shareable result cards (image) | P1 | ⬜ | Next in the brief's order. Image, not video. Must carry the mushaf font, which means rendering glyph fonts server-side or in a canvas. |
| Async duels via challenge link | P1 | ⬜ | Rounds are already server-authoritative. The language cookie means a link opens in the recipient's language. |
| Circles / group leaderboards | P2 | ⬜ | Scoped to a circle, mosque or school only; no global leaderboard, no streak shaming. |
| Spaced-repetition revision mode | P2 | 🟡 | Attempts already record per-ayah accuracy, timing and skips, so no migration is needed. The queue and UI aren't built. The results page already promises "they will come back around". |

## Mushaf fonts and text

| Task | Priority | Status | Notes |
|---|---|---|---|
| QPC V2 page fonts for all Quran text; surah-name and juz-title fonts | P1 | ✅ | Glyph words verified against grading on all 6,236 ayat by `npm run check`. |
| Font fallback on slow networks | P2 | 🟡 | A *failed* page font now falls back to the correct Unicode text (`QuranFontGuard`). But `font-display: block` only hides text for ~3s, so on a very slow connection a fallback font can briefly draw the glyph codes as the wrong Arabic. Consider hiding glyphs until `document.fonts.load()` resolves. |
| Preload the next round's page font | P3 | ⬜ | The next ayah's page is known when the round starts. |
| Font licensing | P3 | 🟡 | QUL states no license terms; attribution to King Fahd Complex / QUL is in the footer. Worth a note to QUL/Tarteel to confirm redistribution is welcome. |
| Copying an ayah from the page | P3 | ⬜ | Glyphs are non-selectable (copying them would paste the wrong characters). A "copy ayah" button could copy the real Unicode text. |

## Arabic interface

| Task | Priority | Status | Notes |
|---|---|---|---|
| Full Arabic UI (RTL, Arabic-Indic numerals, Amiri + IBM Plex Sans Arabic) | P1 | ✅ | Language kept in a cookie, not the URL, so shared links open in the reader's language. Tab title stays "Arena". |
| Native-speaker review of the Arabic copy | P1 | ⬜ | Written to match the English tone; needs a native eye, especially the verdicts and results lines. |
| Check the "+١١٤" points figure in RTL | P3 | ⬜ | Bidi may put the plus sign on the unexpected side. |

## Picker and drill UX

| Task | Priority | Status | Notes |
|---|---|---|---|
| Juz grid with mushaf juz titles; surah grid with search and "start from An-Nas" | P1 | ✅ | |
| Remember the reader's last scope and mode | P3 | ⬜ | Per-viewer convenience, e.g. localStorage. |
| Mutashabihat drill (similar ayat) | P3 | ⬜ | QUL publishes mutashabihat data; a drill on easily confused passages is exactly what hifz students need. |
| Show the ayah in its real mushaf page context | P3 | ⬜ | QUL has mushaf layout data; the prompt could sit on the actual page. |
| Ayah marker wrapping onto its own line | P3 | ⬜ | On long ayat the closing rosette sometimes wraps alone. Consider keeping it attached to the last word. |
| Occasional doubled rule under the empty hero line | P3 | ⬜ | Seen at one viewport size; likely sub-pixel rounding of the repeating gradient. |

## Project upkeep

| Task | Priority | Status | Notes |
|---|---|---|---|
| Update README (and local CLAUDE.md) for fonts, glyph data, Arabic and the ASR spike | P2 | ⬜ | Both still describe the pre-font, English-only app. |
| Automated UI tests | P3 | ⬜ | Only `npm run check` (data and grading) exists. Browser checks are manual. |
