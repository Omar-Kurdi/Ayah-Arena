/**
 * Makes the Skylos baseline portable.
 *
 * Skylos 4.37.0 fingerprints a finding as `rule:file:line` using the file path
 * exactly as the scan produced it, which is absolute
 * (skylos/core/baseline.py, save_baseline / filter_new_findings). A committed
 * .skylos/baseline.json therefore carries the machine it was made on, and
 * matches nothing in a checkout at any other path -- silently, since a
 * fingerprint that does not match simply reports the finding as new.
 *
 * So the file committed here is .skylos/baseline.portable.json: the same
 * format Skylos writes, with paths relative to the repository root. Skylos
 * never reads that file. `apply` expands it into the .skylos/baseline.json
 * Skylos does read, for wherever this checkout happens to live, and that
 * generated file is gitignored.
 *
 *   node scripts/skylos-baseline.mjs save    # rescan, rewrite both files
 *   node scripts/skylos-baseline.mjs apply   # portable -> local baseline.json
 *   node scripts/skylos-baseline.mjs check   # apply, then the strict gate
 *
 * Dead-code fingerprints ("dead:unused_functions:name") carry no path and are
 * passed through untouched.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const LOCAL = join(ROOT, '.skylos', 'baseline.json');
const PORTABLE = join(ROOT, '.skylos', 'baseline.portable.json');

// `rule:path:line`, where the path may itself contain colons -- take the last
// colon before the line number. Anything else (dead code) has no path.
const WITH_PATH = /^([^:]*):(.*):(\d+)$/;

const mapFingerprints = (baseline, mapPath) => ({
  counts: baseline.counts,
  fingerprints: baseline.fingerprints
    .map((fp) => {
      const parts = WITH_PATH.exec(fp);
      return parts ? `${parts[1]}:${mapPath(parts[2])}:${parts[3]}` : fp;
    })
    .sort(),
});

// Matches how Skylos itself writes the file, so `save` and `apply` agree byte
// for byte with `skylos baseline .`.
const write = (path, baseline) => writeFileSync(path, JSON.stringify(baseline, null, 2) + '\n');

const toRelative = (file) =>
  file === ROOT ? '.' : file.startsWith(`${ROOT}/`) ? file.slice(ROOT.length + 1) : file;

// Anything already absolute belongs to another machine and cannot be repaired.
const toAbsolute = (file) => (file === '.' ? ROOT : file.startsWith('/') ? file : join(ROOT, file));

function save() {
  execFileSync('skylos', ['baseline', '.'], { cwd: ROOT, stdio: 'inherit' });
  const local = JSON.parse(readFileSync(LOCAL, 'utf8'));
  write(PORTABLE, mapFingerprints(local, toRelative));
  console.log(`portable baseline written (${local.fingerprints.length} fingerprints)`);
}

function apply() {
  if (!existsSync(PORTABLE)) throw new Error(`missing ${PORTABLE} -- run "save" first`);
  const portable = JSON.parse(readFileSync(PORTABLE, 'utf8'));
  const stray = portable.fingerprints.filter((fp) => WITH_PATH.exec(fp)?.[2].startsWith('/'));
  if (stray.length) {
    throw new Error(`portable baseline holds absolute paths:\n  ${stray.join('\n  ')}`);
  }
  write(LOCAL, mapFingerprints(portable, toAbsolute));
}

function check() {
  apply();
  try {
    execFileSync(
      'skylos',
      ['.', '-a', '--baseline', '--strict', '--no-upload', '--format', 'concise'],
      { cwd: ROOT, stdio: 'inherit' }
    );
  } catch (err) {
    // The gate failing is an ordinary outcome: pass its status on rather than
    // burying the findings under a Node stack trace.
    if (typeof err?.status === 'number') process.exit(err.status);
    throw err;
  }
}

const commands = { save, apply, check };
const command = commands[process.argv[2] ?? 'check'];
if (!command) {
  console.error(`usage: node scripts/skylos-baseline.mjs [${Object.keys(commands).join('|')}]`);
  process.exit(2);
}
command();
