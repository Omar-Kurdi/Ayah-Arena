import type { SourceMeta } from '@/lib/quran';

/**
 * The three things every page has to be able to say for itself: where the text
 * came from, what is and is not collected, and why the tab is called "Arena".
 */
export function SiteFooter({ source }: { source: SourceMeta }) {
  return (
    <footer className="mt-auto border-t border-night-edge pt-6 pb-2 text-sm text-muted">
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <p className="marginal mb-1.5">the text</p>
          <p>
            {source.attribution}. Nothing here is generated or paraphrased, and the
            app offers no tajweed rulings, tafsir or religious advice.
          </p>
        </div>
        <div>
          <p className="marginal mb-1.5">your data</p>
          <p>
            One anonymous cookie holds your progress. No location, no contacts, no
            tracking, no ads, and nothing sold or shared.
          </p>
        </div>
        <div>
          <p className="marginal mb-1.5">on a shared phone</p>
          <p>
            The browser tab and home-screen name stay neutral — just “Arena”, with no
            icon or title that announces what you are practising.
          </p>
        </div>
      </div>
    </footer>
  );
}
