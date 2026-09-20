import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

// A safety net, not the isolation itself: every test file asks for its own
// database through the harness. This makes sure a file that forgets to still
// cannot open the developer's real one at .data/ayah-arena.db.
//
// The directory is only a path until something actually opens a database in
// it, and it is removed either way.
const fallback = join(tmpdir(), `ayah-arena-fallback-${process.pid}-${Date.now()}`);
process.env.AYAH_ARENA_DATA_DIR ||= fallback;

afterAll(() => {
  rmSync(fallback, { recursive: true, force: true });
});
