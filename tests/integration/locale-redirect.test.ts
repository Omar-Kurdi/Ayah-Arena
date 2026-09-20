import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/locale/route';

/**
 * Regression cover for the open redirect fixed in stage 1.
 *
 * The original guard accepted any `next` that started with one slash. The URL
 * parser then read "/\evil.example" -- and the tab and newline variants -- as
 * "//evil.example", so `/locale?to=en&next=/%5Cevil.example` answered
 * 307 http://evil.example/. Proven against the running server at the time.
 *
 * This calls the real route handler. Nothing is reimplemented here: if the
 * origin check in src/app/locale/route.ts is weakened, these fail.
 */

const SITE = 'http://localhost:3210';
const EVIL = 'evil.example';

const call = (query: string) => GET(new NextRequest(`${SITE}/locale?${query}`));
const location = (response: Response) => response.headers.get('location') ?? '';

describe('the redirect cannot be sent off-site', () => {
  // Written the way an attacker writes them in a link: the raw query value,
  // not re-encoded, so the route sees exactly what a browser would send.
  it.each([
    ['encoded backslash (the reported bug)', '/%5Cevil.example'],
    ['raw backslash', '/\\evil.example'],
    ['encoded tab after the slash', '/%09/evil.example'],
    ['encoded newline after the slash', '/%0A/evil.example'],
    ['encoded carriage return after the slash', '/%0D/evil.example'],
    ['protocol-relative', '//evil.example'],
    ['double backslash', '\\\\evil.example'],
    ['absolute http', 'http://evil.example'],
    ['absolute https', 'https://evil.example'],
    ['uppercase scheme', 'HTTPS://evil.example'],
    ['leading space before a scheme', '%20https://evil.example'],
    ['userinfo that looks like this site', 'https://localhost:3210@evil.example'],
    ['triple slash', '///evil.example'],
    ['backslash then slash', '/%5C/evil.example'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
  ])('sends %s home instead', async (_name, next) => {
    const response = await call(`to=en&next=${next}`);
    const target = new URL(location(response));

    expect(target.origin).toBe(SITE);
    expect(target.host).not.toContain(EVIL);
    expect(location(response)).toBe(`${SITE}/`);
  });

  it('keeps the host even when the value is this site on another port', async () => {
    const response = await call('to=en&next=http://localhost:9999/drill');
    expect(location(response)).toBe(`${SITE}/`);
  });

  it.each(['/%5Cevil.example', '//evil.example', 'https://evil.example', '/%5C/evil.example'])(
    'keeps the reader on this host when switching language with %s',
    async (next) => {
      const response = await call(`to=ar&next=${next}`);
      expect(new URL(location(response)).hostname).toBe('localhost');
    }
  );
});

describe('the redirect still works for the reader', () => {
  it('returns to a normal path', async () => {
    const response = await call('to=ar&next=%2Fdrill');
    expect(location(response)).toBe(`${SITE}/drill`);
  });

  it('keeps a query string', async () => {
    const response = await call(`to=ar&next=${encodeURIComponent('/drill?scope=juz:30&mode=listen')}`);
    expect(location(response)).toBe(`${SITE}/drill?scope=juz:30&mode=listen`);
  });

  it('handles a path with a dynamic segment', async () => {
    const response = await call(`to=en&next=${encodeURIComponent('/results/abc-123')}`);
    expect(location(response)).toBe(`${SITE}/results/abc-123`);
  });

  it('goes home when no destination is given', async () => {
    const response = await call('to=ar');
    expect(location(response)).toBe(`${SITE}/`);
  });
});

describe('the language cookie', () => {
  it.each(['ar', 'en'])('is set to %s when asked', async (locale) => {
    const response = await call(`to=${locale}&next=%2Fdrill`);
    const cookie = response.cookies.get('locale');

    expect(cookie?.value).toBe(locale);
    expect(cookie?.path).toBe('/');
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.maxAge).toBe(60 * 60 * 24 * 365);
  });

  it.each(['fr', '', 'EN', 'javascript:alert(1)'])(
    'is left alone for %s, which is not a language the app has',
    async (to) => {
      const response = await call(`to=${encodeURIComponent(to)}&next=%2Fdrill`);
      expect(response.cookies.get('locale')).toBeUndefined();
      expect(location(response)).toBe(`${SITE}/drill`); // the redirect still happens
    }
  );

  it('still switches language while refusing an off-site destination', async () => {
    const response = await call('to=ar&next=/%5Cevil.example');
    expect(response.cookies.get('locale')?.value).toBe('ar');
    expect(location(response)).toBe(`${SITE}/`);
  });
});

describe('the response itself', () => {
  it('is a redirect', async () => {
    const response = await call('to=ar&next=%2Fdrill');
    expect([302, 303, 307, 308]).toContain(response.status);
  });

  it('works behind a different host, using the host of the request', async () => {
    const response = await GET(
      new NextRequest('https://arena.example.com/locale?to=ar&next=%2Fdrill')
    );
    expect(location(response)).toBe('https://arena.example.com/drill');
  });

  it('will not send a reader from that host to another one', async () => {
    const response = await GET(
      new NextRequest('https://arena.example.com/locale?to=ar&next=/%5Cevil.example')
    );
    expect(location(response)).toBe('https://arena.example.com/');
  });
});
