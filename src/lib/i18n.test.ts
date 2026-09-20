import { describe, expect, it } from 'vitest';
import { dict, isLocale, num, percent } from './i18n';

// The invariant worth enforcing is not the wording, which will keep changing,
// but the shape: an Arabic interface that silently falls back to English, or
// crashes on a missing entry, is the failure this guards against.

type Shape = { [key: string]: Shape | 'string' | 'function' };

function shapeOf(value: unknown): Shape | 'string' | 'function' {
  if (typeof value === 'function') return 'function';
  if (typeof value === 'string') return 'string';
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shapeOf(v)])
    ) as Shape;
  }
  return 'string';
}

/** Every leaf of the dictionary, as a dotted path, with the arity of any function. */
function leaves(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}(${(value as (...a: unknown[]) => unknown).length})`];
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k)
    );
  }
  return [path];
}

describe('dictionary parity', () => {
  it('gives Arabic exactly the same keys as English', () => {
    expect(shapeOf(dict('ar'))).toEqual(shapeOf(dict('en')));
  });

  it('gives every function the same arity in both languages', () => {
    expect(leaves(dict('ar')).sort()).toEqual(leaves(dict('en')).sort());
  });

  it('leaves no entry empty, in either language', () => {
    for (const locale of ['en', 'ar'] as const) {
      const empties = leaves(dict(locale)).filter((path) => {
        if (path.endsWith(')')) return false;
        const value = path.split('.').reduce<unknown>(
          (node, key) => (node as Record<string, unknown>)[key],
          dict(locale)
        );
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empties).toEqual([]);
    }
  });

  it('is the same object every time, so hook dependencies stay stable', () => {
    expect(dict('ar')).toBe(dict('ar'));
    expect(dict('en')).not.toBe(dict('ar'));
  });

  it('sets the writing direction each language needs', () => {
    expect(dict('en').dir).toBe('ltr');
    expect(dict('ar').dir).toBe('rtl');
  });

  it('keeps the Arabic copy in Arabic, not English left in place', () => {
    for (const entry of [dict('ar').drill.reveal, dict('ar').drill.howDidItGo, dict('ar').home.start]) {
      expect(entry).toMatch(/[؀-ۿ]/);
      expect(entry).not.toMatch(/[a-zA-Z]/);
    }
  });
});

describe('numbers', () => {
  it('writes Arabic-Indic figures in Arabic and Latin in English', () => {
    expect(num(30, 'en')).toBe('30');
    expect(num(30, 'ar')).toBe('٣٠');
    expect(num(0, 'ar')).toBe('٠');
  });

  it('puts the percent sign each language uses on a rounded figure', () => {
    expect(percent(0.85, 'en')).toBe('85%');
    expect(percent(0.855, 'en')).toBe('86%');
    expect(percent(1, 'ar')).toBe('١٠٠٪');
    expect(percent(0, 'ar')).toBe('٠٪');
  });
});

describe('Arabic plural agreement', () => {
  // آية واحدة / آيتان / ٣ آيات / ١١ آية -- the dual and the 3-10 plural are
  // the forms an English-shaped string would get wrong.
  it.each([
    [1, 'آية واحدة'],
    [2, 'آيتان'],
    [5, '٥ آيات'],
    [11, '١١ آية'],
  ])('%i ayat', (count, expected) => {
    expect(dict('ar').home.roundOption(count)).toBe(expected);
  });

  it('counts plainly in English', () => {
    expect(dict('en').home.roundOption(7)).toBe('7 ayat');
  });
});

describe('isLocale', () => {
  it.each([
    ['en', true],
    ['ar', true],
    ['EN', false],
    ['fr', false],
    ['', false],
    [undefined, false],
    [null, false],
    [{}, false],
  ])('%s -> %s', (value, expected) => {
    expect(isLocale(value)).toBe(expected);
  });
});
