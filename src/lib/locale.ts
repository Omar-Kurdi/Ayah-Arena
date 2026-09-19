import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE, type Locale } from './i18n';

/**
 * The reader's interface language: their saved choice if they made one,
 * otherwise Arabic. Arabic is the default for everyone who has not chosen;
 * the switch in the header is one tap away.
 *
 * Deliberately a cookie rather than a /ar URL prefix. Challenge links are how
 * duels will travel, and a link someone sends you should open in your own
 * language, not the sender's.
 */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(saved) ? saved : 'ar';
}
