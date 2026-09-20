import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinTail, micProblem } from './listener';

// The recorder itself needs Web Audio and a microphone, so it belongs to the
// listener end-to-end stage. These are the two pieces of it that are ordinary
// functions: the tail arithmetic, and the reason a microphone refused.

const named = (name: string) => {
  const err = new Error(name);
  err.name = name;
  return err;
};

const block = (...values: number[]) => Float32Array.from(values);

describe('joinTail', () => {
  it('joins every block when no tail is asked for', () => {
    expect([...joinTail([block(1, 2), block(3), block(4, 5)], null)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps only the last samples when a tail is asked for', () => {
    expect([...joinTail([block(1, 2), block(3), block(4, 5)], 2)]).toEqual([4, 5]);
  });

  it('cuts inside a block when the tail starts mid-block', () => {
    expect([...joinTail([block(1, 2, 3), block(4, 5, 6)], 4)]).toEqual([3, 4, 5, 6]);
  });

  it('drops whole blocks that fall before the tail', () => {
    expect([...joinTail([block(1, 2), block(3, 4), block(5, 6)], 2)]).toEqual([5, 6]);
  });

  it('returns everything when the tail is longer than the recording', () => {
    expect([...joinTail([block(1, 2)], 99)]).toEqual([1, 2]);
  });

  it('leaves the blocks it was given alone', () => {
    const blocks = [block(1, 2), block(3, 4)];
    const copy = blocks.map((b) => [...b]);
    joinTail(blocks, 2);
    expect(blocks.map((b) => [...b])).toEqual(copy);
  });
});

describe('joinTail: edges', () => {
  it.each([
    ['no blocks', [] as Float32Array[], 5, []],
    ['empty blocks', [block(), block()], 5, []],
    ['zero-length tail', [block(1, 2)], 0, []],
    ['tail of exactly the whole recording', [block(1, 2)], 2, [1, 2]],
    ['empty blocks mixed in', [block(), block(1), block(), block(2)], 2, [1, 2]],
  ])('%s', (_name, blocks, tail, expected) => {
    expect([...joinTail(blocks, tail)]).toEqual(expected);
  });
});

describe('micProblem', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const withPermission = (state: PermissionState | 'throws') =>
    vi.stubGlobal('navigator', {
      permissions: {
        query: async () =>
          state === 'throws' ? Promise.reject(new Error('unsupported')) : { state },
      },
    });

  it('names an insecure page, which is the one the reader can act on fastest', async () => {
    await expect(micProblem(named('InsecureContextError'))).resolves.toBe('insecure');
  });

  it('separates "blocked for this site" from "the browser has no microphone yet"', async () => {
    withPermission('denied');
    await expect(micProblem(named('NotAllowedError'))).resolves.toBe('deniedSite');

    withPermission('prompt');
    await expect(micProblem(named('NotAllowedError'))).resolves.toBe('deniedApp');
  });

  it('treats a refusal it cannot explain as a site block, the actionable advice', async () => {
    withPermission('throws');
    await expect(micProblem(named('NotAllowedError'))).resolves.toBe('deniedSite');
  });

});

describe('micProblem: every refusal has a reason', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['NotAllowedError', 'SecurityError', 'PermissionDeniedError'])(
    '%s is a permission refusal',
    async (name) => {
      vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'denied' }) } });
      await expect(micProblem(named(name))).resolves.toBe('deniedSite');
    }
  );

  it.each(['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'])(
    '%s means there is no microphone',
    async (name) => {
      await expect(micProblem(named(name))).resolves.toBe('missing');
    }
  );

  it('falls back to a generic reason for anything else, including non-errors', async () => {
    await expect(micProblem(named('AbortError'))).resolves.toBe('other');
    await expect(micProblem('a string')).resolves.toBe('other');
    await expect(micProblem(undefined)).resolves.toBe('other');
  });
});
