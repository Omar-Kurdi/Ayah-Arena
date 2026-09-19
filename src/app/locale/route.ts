import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Switches the interface language and returns the reader to where they were.
 * A plain link, so it works before any JS runs. `next` must be a same-site
 * path; anything else goes home rather than becoming an open redirect.
 */
export function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get('to');
  const nextParam = request.nextUrl.searchParams.get('next') ?? '/';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

  const response = NextResponse.redirect(new URL(next, request.url));
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
