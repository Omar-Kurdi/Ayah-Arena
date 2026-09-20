# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository. Anyone working
here can read it as the short version of how the project fits together.

## What this is

Ayah Arena: a social Quran recitation-challenge webapp. One ayah appears; the reader gives
the next one — typed, recited aloud with the device listening, or recited from memory and
self-marked — and gets it scored gently. Phase 1 (solo drill mode) is built end to end over
the whole Quran, in English and Arabic. Duels, shareable result cards, circles/group
leaderboards and spaced-repetition revision are not built yet — see "What's next" in
README.md for the intended order, and futureTasks.md for the detail.

**Non-negotiable product constraints** (violating these is a regression, not a style choice):

- Quran text is never generated, paraphrased, or edited — every character displayed comes
  from `data/`, which comes only from the Quran.com API fetch script.
- No AI-generated tajweed, fatwa or pastoral content, ever. The one model in the project is
  the on-device listener, and it is scoped to drill logistics: it answers "which of these
  words came back", nothing else. Any further AI feature needs explicit sign-off first.
- Gentle gamification only: no streak-loss guilt, no "you failed" messaging, no red/failure
  coloring anywhere in the UI, no streak counter or "last active" date in the schema.
- Privacy-first: no location tracking, no selling/sharing data — stated explicitly in the UI.
  The listener's audio and transcript never leave the device.
- The browser tab and metadata stay neutral ("Arena", not "Ayah Arena") — many readers share
  a phone and may not want an obviously-Islamic app icon/title visible.

## Commands

Node 22.5 or newer: progress is stored through `node:sqlite`, which does not exist before
that. CI runs Node 22 LTS, which is the floor this project holds itself to.

```bash
./start.sh                # dev server at http://localhost:3210, in its own session
./start.sh --prod         # build, then serve it the way it is deployed
./stop.sh                 # stop whichever one is running (pid in .run/, gitignored)
npm run dev               # the same dev server, in the foreground
npm run build             # production build
npm run fetch:quran       # refetch all 114 surahs + rebuild data/index.json
npm run fetch:quran -- 2 112   # refetch only these surahs, then rebuild the index
```

Verification, cheapest first. `npm run verify` runs everything in this table except the
browser suites, and must stay that way: no browser download, no model download, no network.

| Command | What it covers |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | ESLint flat config, `--max-warnings=0`. Not `next lint` |
| `npm run check` | grading, normalization and glyph alignment over all 6,236 real ayat |
| `npm test` | unit tests (Vitest): pure logic, no browser, server, database or network |
| `npm run skylos` | the Skylos baseline gate (see below) |
| `npm run audit:prod` | `npm audit --omit=dev --audit-level=high` |
| `npm run test:integration` | real route handlers and real SQLite, one throwaway database per test |
| **`npm run verify`** | **all of the above, in that order** |
| `npm run test:e2e` | production build + Playwright `desktop` and `mobile-375` |
| `npm run test:e2e:listener` | the real microphone path: fake capture device, real model |

`npm run test:e2e` and `npm run test:e2e:listener` compose smaller scripts — `build:e2e`,
`test:e2e:run`, `fixtures:listener`, `test:e2e:listener:run` — so CI can run the same steps
one at a time without restating the commands in YAML. Change the script, not the workflow.

## Testing

Four layers, each with a rule about what it may touch:

- **Unit** (`src/**/*.test.ts`, `vitest.config.ts`) — pure functions. If a test needs a
  database, a server or a browser, it belongs in a lower layer.
- **Integration** (`tests/integration/`, `vitest.integration.config.ts`) — the real route
  handlers against real SQLite. Every test gets its own database: `temporaryDataDir()` in
  `tests/integration/harness.ts` points `AYAH_ARENA_DATA_DIR` at a fresh temp directory
  *and* drops the connection cached on `globalThis.__ayahArenaDb`, because the cached handle
  would otherwise keep serving the previous database. `tests/integration/setup.ts` is a
  backstop so a file that forgets cannot open `.data/ayah-arena.db`. Files do not share a
  worker (`fileParallelism: false`) for the same reason.
- **Browser** (`tests/e2e/*.spec.ts`, `playwright.config.ts`) — journeys, the no-red and
  no-leaked-answer guardrails, axe accessibility, and the 375px layout. Always against
  `next start` on a production build in `.next-e2e`, never `next dev`, with its own
  throwaway database directory.
- **Listener** (`tests/e2e/listener.spec.ts`) — Chromium plays a real recitation into a fake
  capture device and the app downloads and runs its real speech model. Slow, so it is its
  own Playwright project, its own workflow, and never part of `verify` or the PR gate.

Fixtures for the listener are provisioned by `scripts/listener-fixtures.mjs` into `.cache/`
(gitignored): a recitation pinned by URL and SHA-256, converted to 16kHz mono 16-bit WAV
with ffmpeg, and the model mirrored at a pinned revision by `tests/e2e/model-mirror.ts`.
Never commit the model or the audio — the recording is someone else's work and the model is
~220MB. The listener Playwright project runs one worker at a time: the tests share that
mirrored model.

## CI

- `.github/workflows/ci.yml` — on pull requests and pushes to main. **Fast checks** (the
  `verify` list, plus a Skylos install and assertions that the run left no tracked file
  changed) and **Browser tests** (Playwright `desktop` + `mobile-375`). Two jobs, kept
  separate on purpose.
- `.github/workflows/listener.yml` — the real microphone path, nightly and on manual
  dispatch, with a `cold-cache` input that ignores the cached model. Never on a pull request.
- Actions are pinned by commit SHA, `persist-credentials: false`, `npm ci --ignore-scripts`.
- `.github/dependabot.yml` opens weekly pull requests for npm and for the actions. Nothing
  merges itself.

Note that `next build` rewrites `tsconfig.json` (it reformats it and adds the e2e types
path). The Browser tests and Listener jobs therefore leave a modified `tsconfig.json` on the
runner, which is why only Fast checks asserts a clean tree. Locally: check `git status`
after a build and restore it rather than committing it.

## Skylos

Static analysis (dead code, some security patterns), installed with pipx — `skylos==4.37.0`,
not a project dependency, and not in `package.json`. Its settings live in `pyproject.toml`,
which is there only because that is where Skylos reads its configuration.

Skylos fingerprints a finding as `rule:absolute-path:line`, so a committed baseline would
match nothing in another checkout — silently, since an unmatched fingerprint is reported as
new. `scripts/skylos-baseline.mjs` therefore keeps the reviewed baseline in
`.skylos/baseline.portable.json` with repo-relative paths and expands it into the
`.skylos/baseline.json` Skylos actually reads (gitignored).

```bash
npm run skylos                          # apply the portable baseline, then the strict gate
node scripts/skylos-baseline.mjs save   # rescan and rewrite both files -- only after review
```

Every baselined finding is justified by hand in `.skylos/REVIEW.md`. A new finding is fixed,
or reviewed and written up there before it is baselined — never baselined because it is
inconvenient, and never silenced with a broad exclusion. Line numbers move when a file is
edited, so a re-save after an unrelated edit is normal; a genuinely new fingerprint is not.

Skylos's dependency scan cannot resolve this project's caret ranges, so it is not the
dependency gate. `npm run audit:prod` is.

## Architecture

**Data layer is file-based and build-time, not runtime.** `scripts/fetch-quran.mjs` is the
*only* code that talks to the Quran.com API (v4, Tanzil Uthmani edition). It writes one JSON
file per surah to `data/surah/<n>.json` (Uthmani, Imlaei, and undiacritized spellings, plus
per-ayah juz number) and derives `data/index.json` from those files (surah + juz metadata for
the picker UI). Both are committed to the repo — the running app makes zero network calls,
apart from the listener's one-time model download, which only happens if the reader asks.

**Storage is per-surah, not per-juz, on purpose.** A drill pair is only ever two consecutive
ayat of the *same surah* — reciting across a surah boundary is a different task. Juz
boundaries cut straight through surahs (19 surahs straddle one; e.g. juz 2 opens mid-Baqarah
at 2:142), so a "juz" scope is assembled at read time from the surah files it spans
(`src/lib/quran.ts`: `buildPairs`, `scopeSpans`). An ayah is always resolved by its own key
(`verseByKey`), never by looking through a juz — this is what keeps old sessions resolvable
across data-layout changes and keeps a juz-scoped drill from asking for an ayah in the
adjacent juz.

**Grading accepts three spellings and keeps the best result.** A phone Arabic keyboard can't
produce Uthmani orthography, and the undiacritized spelling differs from Imlaei on a large
share of ayat (dagger alef presence, no local rule reconciles them). `src/lib/quran.ts`
(`expectedAyah`) exposes all three as acceptable; `src/lib/score.ts` (`gradeTyped`) grades
against each and keeps the highest-accuracy result, but the ayah shown back on review is
*always* the Uthmani/mushaf spelling regardless of which one was typed — someone memorizing
hifz should never see the answer in a script their mushaf doesn't use. Grading normalization
(`src/lib/arabic.ts`) is used for scoring only and must never leak into anything actually
displayed. Gentleness is encoded in the scoring function itself, not just copy: a word within
one edit still earns partial credit, speed is a bonus that's never a penalty
(`speedBonus`), and skipping an ayah ("show me this one") is recorded distinctly from a blank
attempt and excluded from every accuracy figure.

**Three ways to answer, two stored modes.** The home page offers "Recite it"
(`?mode=listen`), "Type it" (`?mode=type`) and "Check yourself" (`?mode=recite`). The server
only ever stores `type` or `recite` (`DrillMode` in `src/lib/store.ts`); listening is a
client-side capability on top of a recite round, carried as `config.listen`
(`src/app/drill/page.tsx`). Anything reasoning about what the reader did should read both.

**Rounds are server-authoritative.** The answer text never reaches the client before an
attempt is submitted (`src/lib/drill.ts`: `startSession` / `submitAttempt`, backed by the API
routes under `src/app/api/drill/`). Recite-aloud mode has a separate, explicit reveal endpoint
restricted to that mode — typed mode must never leak the answer pre-submission. This is
intentional groundwork for duels being fair later, not just current-feature scope.
`tests/e2e/guardrails.spec.ts` holds that line in the browser.

**The listener runs in the reader's browser, or not at all.** `src/lib/listen/` holds the
recorder and the worker; `src/components/ListenCheck.tsx` holds the consent panel, which
comes before any download. transformers.js runs a Whisper fine-tune on-device; the transcript
is graded and discarded, never rendered and never sent anywhere. The result only pre-selects
a self-grade — the reader still decides. It may not judge tajweed or pronunciation.

**Persistence is isolated behind one file.** `src/lib/store.ts` is the only file that knows
SQLite is the storage engine (Node's built-in `node:sqlite`, no native modules). Tables:
`players`, `sessions`, `session_items`, `attempts`. The DB handle is lazily created and cached
on `globalThis` (`__ayahArenaDb`) — this avoids both Next's parallel build-worker lock
contention and re-opening the connection on every HMR reload in dev. `AYAH_ARENA_DATA_DIR`
moves the database file, which is how tests stay off `.data/ayah-arena.db`. Additive schema
changes go through the `migrate()` function (`PRAGMA table_info` check + `ALTER TABLE`), not by
editing the `CREATE TABLE` and expecting existing local DBs to pick it up. Attempts record
`{mode, rawInput, selfGrade, accuracy, points, elapsedMs}` per ayah specifically so the future
spaced-repetition queue doesn't need a migration when it lands.

**Identity is cookie-only, no accounts.** `src/lib/player.ts` sets one opaque `httpOnly`
cookie (1 year, `sameSite: lax`). Nothing to sign in to; nothing personal stored.

**Language is a cookie too.** `src/lib/i18n.ts` holds both dictionaries; `src/app/locale/route.ts`
switches between them. Not a URL segment, so a shared link opens in the recipient's own
language. That route resolves its redirect target and compares origins — it was an open
redirect once, and `tests/integration/locale-redirect.test.ts` exists to keep it closed.

**UI signature: the "mushaf page."** `src/components/MushafPage.tsx` renders the prompt ayah
and the answer line inside one double-ruled frame with a surah cartouche, so the blank line
reads as the next line of the same passage rather than a separate form field. Two rules are
enforced everywhere (documented as comments in `src/app/globals.css`, and checked by
`tests/e2e/guardrails.spec.ts` against computed styles): nothing in the UI is red or otherwise
signals "wrong" (muted/quiet only — verdant marks what held, nothing marks what didn't beyond
going quiet), and the ayah is always the largest type on any screen it appears on.
`src/components/Rosette.tsx` draws the ayah-boundary marker (with Arabic-Indic numerals) —
this is a reserved visual meaning; don't reuse the rosette shape for unrelated numbering
(e.g. the juz picker uses plain tiles, not rosettes, for exactly this reason).

**Scope picker** (`src/components/ScopePicker.tsx`) lets a reader choose among 30 juz or 114
surahs via two different controls (grid vs. filtered list) inside one native radio group, but
the actual submitted value comes from a hidden `<input name="scope">` synced to component
state — not from whichever radio happens to be checked — because the visible radios are
conditionally rendered/filtered and can unmount out from under the DOM while state still holds
a selection.

## Conventions

- Path alias `@/*` → `src/*`.
- `scripts/*.ts` run under plain Node (via `ts-resolve.mjs`), not Next's bundler — keep
  imports Node-compatible if editing them, and prefer `.ts` extensionless relative imports
  matching the pattern already used.
- Arabic text handling: never run display strings through `src/lib/arabic.ts` normalization
  functions — those exist purely to make grading tolerant, not to canonicalize what's shown.
- Copy is written in both languages or not at all: every string added to `src/lib/i18n.ts`
  needs its Arabic counterpart, and the tone stays beginner-safe and non-judgmental.
- Generated things stay out of Git: `.data/`, `.next/`, `.next-e2e/`, `.cache/`,
  `playwright-report/`, `test-results/`, `.skylos/baseline.json`, `.skylos/cache/`.
