# Skylos baseline review

`baseline.json` holds 48 findings, every one reviewed by hand against Skylos
4.37.0 (`skylos . -a`): first on 2026-09-19, and again as each stage changed
the code. None was accepted because it was inconvenient to investigate.
Findings that were real and fixable were fixed instead of baselined (see
"Fixed instead of baselined" below).

How it got here: 47 at the first review, 49 by the end of stage 8 as the
listener test and its fixtures brought code of their own, and 48 after
stage 9. Stage 9 was the
refactoring stage, and it ended three `SKY-Q301` complexity findings by
splitting the code that earned them -- `DrillClient` (33), `ListenCheck` (26)
and `ScopePicker` (12) are all under the limit now. Two of the pieces they
were split into, `drill/useDrillSession.ts` and `drill/useListening.ts`, are
long enough to earn `SKY-C304` of their own, and those are accepted below.
Line numbers move whenever a file is edited, so several entries in the same
files moved with them; every add, removal and move was read one at a time
against the previous baseline.

A plain `skylos . -a` still reports all of them; only `--baseline` hides them.

## Accepted: legitimate framework entrypoints (2)

| Fingerprint | Why it is safe |
|---|---|
| `dead:unused_variables:nextConfig` | `next.config.mjs` default-exports it; Next.js loads that file by convention. Its webpack alias is what lets the listener worker build. |
| `SKY-E003 postcss.config.mjs:1` | Next.js loads `postcss.config.mjs` by convention. It is the only thing that runs Tailwind (`@import 'tailwindcss'` in globals.css). |

## Accepted: verified false positives (28)

| Fingerprint | Why it is wrong |
|---|---|
| `dead:unused_functions:parseConfig` | Called at `src/app/drill/page.tsx:46`. Skylos's own call graph records `called_by: DrillPage` and marks DrillPage a live framework root, yet still reports it. |
| `dead:unused_functions:closing` | Called at `src/app/results/[sessionId]/page.tsx:58`, from ResultsPage. Same Skylos inconsistency. |
| `SKY-D212 src/lib/store.ts:69, 70, 71, 129` | `handle.exec(...)` is `node:sqlite` `DatabaseSync.exec` with constant SQL. `child_process` is not imported. The rule matches any `.exec(` member call. |
| `SKY-D216 scripts/fetch-quran.mjs:36`, `scripts/asr-spike/eval.mjs:97` | Local developer CLI scripts, not server code. Host is hard-coded (`api.quran.com`); surah numbers are validated 1-114. No attacker-controlled input reaches `fetch`. |
| `SKY-D216 scripts/listener-fixtures.mjs:105` | Fetches the recitation for the listener test. The URL is a constant in that file, the lines above the `fetch` reject any host but `verses.quran.com`, and the bytes are checked against a pinned SHA-256 afterwards. Developer tooling, never server code. |
| `SKY-D253 scripts/listener-fixtures.mjs:110` | Compares the downloaded recitation's SHA-256 with the digest pinned in the same file. Both sides are public -- the expected digest is committed here -- so there is no secret for timing to leak, and `timingSafeEqual` would only suggest otherwise. The check exists to catch the file changing, not an attacker guessing it. |
| `SKY-D216 tests/e2e/model-mirror.ts:93` | The test's model mirror. `isAllowed()` checks the URL against a fixed list of Hugging Face and jsDelivr hosts before the request reaches this line, and the model's own files are re-pointed at a pinned revision. The rule matches `fetch(variable)` syntactically and cannot see either check. |
| `SKY-D280 src/app/api/drill/{start,answer,reveal}/route.ts` | There are no accounts by design (anonymous httpOnly cookie, see `src/lib/player.ts`). Every route calls `requirePlayerId()`, and `drill.ts:137`/`:165` reject another player's session. `SameSite=Lax` keeps the cookie off cross-site POSTs. (Separate, unflagged: there is no rate limiting.) |
| `SKY-D230 src/app/locale/route.ts:21` | The open redirect was real and is fixed. The rule matches any `redirect()` with a variable. The target is now resolved and its origin compared with the site's; `/\x`, tab, newline, `//x` and absolute URLs all land on `/` (tested against the running server). |
| `SKY-L007 drill/listening.ts:30`, `drill/useListening.ts:98` | Both catch blocks carry a comment explaining why ignoring the error is safe, which is what the rule asks for: a private window refusing storage, and a live listening pass that missed. Skylos does not read the comment. |
| `SKY-Q402 scripts/fetch-quran.mjs:72` | Pagination: each page request depends on the previous one. |
| `SKY-Q402 scripts/fetch-quran.mjs:274, 276` | Sequential on purpose: one surah at a time, politely, with per-surah progress. |
| `SKY-Q402 scripts/fetch-quran.mjs:194` | Reads 114 small local files once in a one-off dev script. Not worth parallelising. |
| `SKY-Q402 scripts/asr-spike/eval.mjs:97, 100` | A retry-with-backoff loop, sequential by definition. |
| `SKY-Q402 scripts/asr-spike/eval.mjs:162, 173` | A benchmark that times each clip; running clips concurrently would corrupt the timing it measures. |
| `SKY-T105 src/lib/quran.ts:124, 138`, `scripts/check-scoring.ts:19` | The JSON is the app's own committed data, written by `scripts/fetch-quran.mjs` (which throws on any mismatch) and checked in full by `npm run check`. It never comes from users. |

## Accepted: genuine debt, weighed and left (18)

These are accurate. Stage 9 fixed the three worth fixing; what is left is
here with the reason it is left. "Long" is not the same as "tangled": every
one of these is now under the complexity limit except `align`, and what they
have in common is length that comes from markup, data or a sequence of steps
that reads better in one place.

| Fingerprint | Note |
|---|---|
| `SKY-C304 DrillClient.tsx:22` (110 lines) | Split in stage 9: the session moved to `drill/useDrillSession.ts` and the sections to `drill/`. Complexity 33 -> under the limit, and it no longer carries `SKY-Q301`. What is left is a page of layout. |
| `SKY-C304 drill/useDrillSession.ts:61` (144 lines) | The round's state machine: five actions, each short, over one set of state. Splitting it further would spread one transition across files to satisfy a line count. Its complexity is under the limit. |
| `SKY-C304 ListenCheck.tsx:21` (93 lines) | Split in stage 9: the listening lifecycle moved to `drill/useListening.ts` and the pure decisions to `drill/listening.ts`. Complexity 26 -> under the limit, and it no longer carries `SKY-Q301`. What is left is one arm of markup per stage. |
| `SKY-C304 drill/useListening.ts:120` (111 lines) | Consent, the model download, the microphone and the finish, in the order they happen. The live-pass loop is its own hook in the same file and is under both limits. Its complexity is under the limit. |
| `SKY-C304 ScopePicker.tsx:29` (77 lines) | Split in stage 9: the two controls moved to `scope/ScopeChoices.tsx`, which draws one kind of tile for both, and the surah search is a pure function in `scope/matchSurahs.ts` with its own tests. Complexity 12 -> under the limit, and it no longer carries `SKY-Q301`. What is left is the tab bar, the selection line and the sticky Start. |
| `SKY-Q301` + `SKY-C304` `score.ts:79` `align` (13, 68 lines) | A Needleman-Wunsch alignment: a scoring loop and a traceback, and the branches are the algorithm. Splitting it would hide it. Covered in full by `npm run check` and the unit tests. |
| `SKY-C304` `app/page.tsx:15`, `results/[sessionId]/page.tsx:22` | Page components, mostly markup. |
| `SKY-C304` `listener.ts:131` `startRecording` (87 lines) | The AudioWorklet path and the ScriptProcessor fallback for browsers without it. The fallback has no automated coverage -- the listener end-to-end test exercises whichever path Chromium takes -- and splitting untested code to satisfy a line count is the wrong trade. Worth revisiting if the fallback ever gets a test. |
| `SKY-C304` `Rosette.tsx:23`, `store.ts:68`, `drill.ts:154`, `drill.ts:242`, `fetch-quran.mjs:186`, `eval.mjs:149` | Over the 50-line default (SVG markup, SQL DDL, dev scripts). The threshold may be the better thing to tune. |
| `SKY-R103 pyproject.toml:7` | No `[tool.skylos.gate]` policy. The gate this project actually uses is `scripts/skylos-baseline.mjs check` in CI, which fails on any new finding -- stricter than the thresholds `[tool.skylos.gate]` would set. Adding the section to quiet the rule would be configuration written for the checker, not for the project. |
| `SKY-R104` (repo root) | No pre-commit policy file. The same checks run through `npm run verify` and on every pull request; a hook file would be a second place to keep them in step. Declined deliberately, not overlooked. |

## Fixed instead of baselined (12)

- `SKY-D230 src/app/locale/route.ts:16`: exploitable open redirect
  (`/locale?next=/%5Cevil.example` returned `307 http://evil.example/`).
- `dead:unused_functions:juzEntries`, `sourceMeta` (`src/lib/quran.ts`): removed.
- `SKY-E004` unnecessary exports: `SURAH_COUNT`, `JUZ_COUNT`, `surahEntries`,
  `juzEntry` (quran.ts), `dictionaries` (i18n.ts), `SAMPLE_RATE` (listener.ts).
- `SKY-R105 package.json:1` ("no npm script runs tsc"): fixed in stage 3 by the
  `typecheck` script, so the entry left the baseline.
- `SKY-Q301` on `DrillClient` (complexity 33), `ListenCheck` (26) and
  `ScopePicker` (12): fixed in stage 9 by splitting each one along its own
  seams -- the session and its clock out of the drill, the listening lifecycle
  out of the panel, the two controls and the surah search out of the picker.
  The behaviour is unchanged and the browser and listener suites both say so.
  The decisions that came out as pure functions (`recallWords`, `matchSurahs`)
  gained unit tests they could not have had inside a component.

## How the baseline is stored, and why

`skylos baseline .` fingerprints every finding as `rule:file:line` using the
path exactly as the scan produced it, and that path is absolute
(`skylos/core/baseline.py`, `save_baseline`; `filter_new_findings` rebuilds the
same string when matching). A committed `.skylos/baseline.json` would therefore
carry `/var/home/<user>/...` into the repository and match nothing in a
checkout at any other path -- and it fails *open*: an unmatched fingerprint is
simply reported as a new finding.

Checked before working around it, on 2026-09-20:

- No CLI flag, config key or environment variable produces relative paths
  (`skylos --help`, `skylos/config.py`, all `SKYLOS_*` variables).
- 4.37.0 is the latest release on PyPI, so there is no version to upgrade to.
- Upstream `main` builds the fingerprint the same way, so it is unfixed there too.
- No upstream issue tracks it.

So this is a real Skylos 4.37.0 limitation, not a misuse, and the workaround is
ours rather than an official feature:

| File | Role |
|---|---|
| `.skylos/baseline.portable.json` | **Committed.** Skylos's own format, paths relative to the repository root. Skylos never reads it. |
| `.skylos/baseline.json` | Generated, gitignored. What Skylos actually reads, with this checkout's absolute paths. |
| `scripts/skylos-baseline.mjs` | Converts between the two. |

```bash
node scripts/skylos-baseline.mjs check   # rebuild the local baseline, run the strict gate
node scripts/skylos-baseline.mjs save    # rescan and rewrite both files (after reviewing new findings)
```

`apply` reproduces `skylos baseline .` byte for byte, and refuses to run if the
committed file ever picks up an absolute path. Committing the relative file
directly as `baseline.json` was tested and is **not** a shortcut: Skylos then
matches only the three name-keyed dead-code entries and the other 44 findings
come back.

## Dependency scanning (`--sca`) does not cover this project

`--sca` reports zero vulnerabilities here, and that means **not checked**, not
clean. In `skylos/rules/sca/vulnerability_scanner.py` 4.37.0:

- `package-lock.json` is in `UNSUPPORTED_LOCKFILE_NAMES` (so are `yarn.lock`
  and `pnpm-lock.yaml`), so the file holding the exact installed versions is
  only counted, never read.
- npm versions come from `package.json` through `parse_package_json`, which is
  `exact_only=True`: "Parse only exact npm versions that are safe to send to
  OSV". Every dependency here is a caret range (`^15.5.0`), so all 11
  declarations across the two `package.json` files are skipped.
- The scan confirms it: `unresolved_dependency_count: 11`,
  `queried_dependency_count: 0`.

Verified by pinning one dependency to an exact version in a throwaway copy of
the tree: `dependency_count` went to 1 and OSV was queried. The machinery works;
it just never sees a ranged version. Nothing was changed in this repository to
suit it.

**This gap is currently hiding real advisories.** Querying OSV directly for the
installed `next@15.5.23` (from `package-lock.json`) returns two CRITICAL
unauthenticated RCE advisories, `GHSA-2xp9-vwfh-vxw4` (image optimization, AVIF)
and `GHSA-p293-qw3h-jr36` (Windows-hosted servers only), both fixed in
**15.5.24**. The declared `^15.5.0` range already allows that, so an update
fixes it without touching `package.json`. Dependency scanning is therefore a separate gate:
`npm run audit:prod` (`npm audit --omit=dev --audit-level=high`), which reads
the committed `package-lock.json`. Skylos findings and dependency advisories
stay separate things; neither substitutes for the other.

## `skylos verify` is not a gate

`skylos verify .` exits **2** (`status: incomplete`) and must not be wired up as
a required check yet. Two causes, neither a defect in this repository:

1. 56 references resolve to external packages (`next`, `react`, `node:*`), which
   Skylos cannot prove locally.
2. One file fails to parse: `src/app/page.tsx`.

Minimal reproduction of (2) -- one line is enough:

```tsx
export const A = () => <a href="/x?a=1&b=2">t</a>;   // PARSE ERROR
export const B = () => <a href="/x?a=1&amp;b=2">t</a>;  // ok
export const C = () => <a>one & two</a>;             // PARSE ERROR
export const D = () => <a href={"/x?a=1&b=2"}>t</a>; // ok
```

A bare `&` inside a JSX attribute string or JSX text defeats
tree-sitter-typescript 0.23.2, which TypeScript itself accepts. 0.23.2 is the
newest published grammar and still fails; Skylos pins `<0.24`. So no upgrade
fixes it today, and the valid application code stays as it is.

Exit codes, measured:

| Command | Exit |
|---|---|
| `skylos . -a` | 0 always, whatever it finds |
| `skylos . -a --gate` | 0 with up to 5 HIGH / 10 security / 10 quality findings |
| `node scripts/skylos-baseline.mjs check` (`--baseline --strict`) | 0 clean, 1 on any new finding |
| `skylos verify .` | 2 (incomplete), 0 with `--no-fail` |

The parse gap does not weaken the gate: `analysis_errors` is 0 and
`incomplete_languages` is unset, so the strict run is unaffected, and
`page.tsx` still produces ordinary findings (`SKY-C304 page.tsx:15`). Only the
AI-reference check skips that file.

## Other limits of this baseline (Skylos 4.37.0)

- Line-based: moving code resurfaces its findings as new (one blank line added
  to `DrillClient.tsx` brought back two baselined findings).
- Dead code is keyed by name only: a new unused function that reuses a
  baselined name (`parseConfig`, `closing`, `nextConfig`) is hidden. Tested.
- `unused_exports` and `unused_parameters` can be neither baselined nor failed
  on by `--strict`. The six unnecessary exports were fixed rather than accepted
  for this reason.
- `SKY-D212` matches any `x.exec(...)`, so `db.exec` is flagged while a named
  `import { exec } from 'node:child_process'` call is missed.
