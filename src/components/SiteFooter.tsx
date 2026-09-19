import { dict, type Locale } from '@/lib/i18n';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * The three things every page has to be able to say for itself: where the text
 * came from, what is and is not collected, and why the tab is called "Arena".
 */
export function SiteFooter({ locale, path }: { locale: Locale; path: string }) {
  const t = dict(locale).footer;

  return (
    <footer className="mt-auto border-t border-night-edge pt-6 pb-2 text-sm text-muted">
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <p className="marginal mb-1.5">{t.textHeading}</p>
          <p>{t.text}</p>
        </div>
        <div>
          <p className="marginal mb-1.5">{t.dataHeading}</p>
          <p>{t.data}</p>
        </div>
        <div>
          <p className="marginal mb-1.5">{t.phoneHeading}</p>
          <p>{t.phone}</p>
        </div>
      </div>
      <p className="mt-6">
        <LanguageSwitch locale={locale} path={path} />
      </p>
    </footer>
  );
}
