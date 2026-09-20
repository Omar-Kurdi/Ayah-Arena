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
| Step 0b — evaluate on real learners' recordings | P1 | ⬜ | The result that decides the feature, and the automated listener test does not stand in for it: that one proves the pipeline with a professional reciter. Either use recite mode's "Check by listening" yourself, or record 20–30 ayat on a phone (your voice, others with consent, a child if possible, some deliberate mistakes) named `<surah>_<ayah>.m4a` and run `eval.mjs --dir <folder>`. |
| Re-export the base model to actually hit ~72MB | P1 | ⬜ | The available ONNX conversion downloads **~196MB** (fp32 encoder 79MB + merged 4-bit decoder 118MB). Its int8 encoder uses `ConvInteger`, which onnxruntime can't run. Re-export `tarteel-ai/whisper-base-ar-quran` with Optimum and quantize so the download is ~72MB. The consent panel says "about 200MB" until then. |
| Test the smaller ~38MB model (whisper-tiny-ar-quran) | P2 | ⬜ | Same `eval.mjs` runs, both professional and own recordings. Compare accuracy and false accepts against base; if tiny holds up, it halves the download and speeds up live dots. Candidate ONNX: `Sharjeelbaig/whisper-tiny-ar-quran-onnx`. |
| Ayat longer than 30 seconds | P2 | ✅ | Chunked with overlap (`chunk_length_s: 30, stride_length_s: 5`). Checked on Alafasy 9:24 (51s): 51% without chunking, 99% with. Works in the browser too (2:255, 52s, ~19s to transcribe on single-thread WASM). |
| Browser runtime check | P2 | 🟡 | Runs in a Web Worker: WebGPU if the browser has an adapter, else WASM. In the dev browser (WASM, one thread): ~3s per pass for a 6s ayah. Still to test: Chrome/Android with WebGPU, Safari/iOS, a low-memory phone. |
| Multi-threaded WASM | P2 | ⬜ | Cross-origin isolation (COOP/COEP credentialless) was tried and **hung**: onnxruntime's thread workers try to re-load Next's bundled worker chunk (`_N_E is not defined`). Needs the ORT wasm/mjs files self-hosted in `public/` and `env.backends.onnx.wasm.wasmPaths` pointed at them. Would also remove the jsDelivr fetch. |
| Step 1 — opt-in "check by listening" in recite mode | P1 | 🟡 | Built (`ListenCheck.tsx`, `src/lib/listen/`). Consent panel before any download (remembered in localStorage); mic only on "Start reciting"; transcript graded in the browser and discarded, never shown or sent; result only pre-selects a self-grade, the reader decides. Verified end to end with a reciter clip piped in as the mic. **Not yet tested with a real voice** — that is step 0b. The clip path now runs unattended: `.github/workflows/listener.yml` plays a pinned recitation into Chromium's fake microphone nightly, with the real model. |
| Step 2 — live word-by-word follow-along | P2 | 🟡 | Built as a dot per word that lights as it comes back (count only, never the words). Re-hears the last 20s every 1.5s, lit dots stay lit, auto-finishes when every word is back. Speed depends on the device; on slow WASM the dots lag a few seconds. |
| Self-grade verdict vs. listener marks | P3 | ⬜ | After "Got it" the heading says "Word for word." while a word may still be marked "nearly" by the listener. Consider a verdict line that reflects both. |

## Roadmap from the original brief

| Task | Priority | Status | Notes |
|---|---|---|---|
| Solo drill (typed + recited), whole Quran, any juz or surah | P1 | ✅ | |
| Shareable result cards (image) | P1 | ⬜ | Next in the brief's order. Image, not video. Must carry the mushaf font, which means rendering glyph fonts server-side or in a canvas. |
| Async duels via challenge link | P1 | ⬜ | Rounds are already server-authoritative. Caveat: "check by listening" fetches the answer before the reader recites (it grades on the device so the voice never leaves it), so recite-mode duels can't be scored by the listener without rethinking that. The language cookie means a link opens in the recipient's language. |
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
| Native-speaker review of the Arabic copy | P1 | ⬜ | Written to match the English tone; needs a native eye, especially the verdicts and results lines. `README.ar.md` needs the same read-through. |
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
| Update README (and CLAUDE.md) for fonts, glyph data, Arabic and the ASR spike | P2 | ✅ | Both rewritten for the current app. The project instructions are now tracked at `.claude/CLAUDE.md` instead of an untracked file per machine. |
| Automated UI tests | P3 | ✅ | Vitest units, integration tests against real route handlers and real SQLite, and Playwright over journeys, the no-red and no-leaked-answer guardrails, axe and the 375px layout. `npm run verify` runs everything that needs no browser. |
