import { dict, type Locale } from '@/lib/i18n';

/**
 * A plain link to the other language, labelled in that language -- a reader
 * looking for Arabic should find the word العربية, not "Arabic". The route sets
 * the cookie and brings them back to the same page.
 */
export function LanguageSwitch({ locale, path }: { locale: Locale; path: string }) {
  const target = dict(locale).switchTo;
  return (
    <a
      href={`/locale?to=${target.locale}&next=${encodeURIComponent(path)}`}
      lang={target.locale}
      className="text-muted underline underline-offset-4 hover:text-parchment"
    >
      {target.label}
    </a>
  );
}
