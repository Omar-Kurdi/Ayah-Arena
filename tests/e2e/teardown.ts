import { rmSync } from 'node:fs';

/** Removes the run's throwaway database directory. */
export default function teardown() {
  if (process.env.E2E_DATA_DIR) {
    rmSync(process.env.E2E_DATA_DIR, { recursive: true, force: true });
  }
}
