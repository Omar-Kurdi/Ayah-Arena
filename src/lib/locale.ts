import { cookies, headers } from 'next/headers';
import { isLocale, LOCALE_COOKIE, type Locale } from './i18n';

/**
 * The reader's interface language: their saved choice if they made one,
 * otherwise what their browser asks for, otherwise English.
 *
 * Deliberately a cookie rather than a /ar URL prefix. Challenge links are how
 * duels will travel, and a link someone sends you should open in your own
 * language, not the sender's.
 */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  const accept = (await headers()).get('accept-language') ?? '';
  const first = accept.split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('ar') ? 'ar' : 'en';
}
