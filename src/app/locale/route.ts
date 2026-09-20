import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Switches the interface language and returns the reader to where they were.
 * A plain link, so it works before any JS runs. `next` must resolve to this
 * site; anything else goes home rather than becoming an open redirect.
 *
 * The check is on the resolved URL, not the string: URL parsing reads
 * "/\evil.example" (or a tab or newline after the first slash) as
 * "//evil.example", another host, so a "starts with one slash" test lets it
 * through.
 */
export function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get('to');
  const home = new URL('/', request.url);
  const target = new URL(request.nextUrl.searchParams.get('next') ?? '/', home);

  const response = NextResponse.redirect(target.origin === home.origin ? target : home);
  if (isLocale(to)) {
    response.cookies.set(LOCALE_COOKIE, to, {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ONE_YEAR,
      path: '/',
    });
  }
  return response;
}
