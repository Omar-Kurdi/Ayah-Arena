import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { getLocale } from '@/lib/locale';
import { dict } from '@/lib/i18n';
import { QuranFontGuard } from '@/components/QuranFontGuard';
import './globals.css';

// The interface faces are served from the app itself (src/app/fonts, with
// their licences and how they were cut). next/font/google downloads its files
// during the build, so a moment's network trouble used to fail it.

// Vollkorn and Alegreya Sans are both book faces with calligraphic warmth and
// a sturdy, low-contrast build -- the closest Latin relatives to naskh, which
// is the only script on these pages that actually matters. A high-contrast
// display serif would have fought it.
const vollkorn = localFont({
  src: [
    { path: './fonts/vollkorn-wght.woff2', weight: '400 600', style: 'normal' },
    { path: './fonts/vollkorn-italic-wght.woff2', weight: '400 600', style: 'italic' },
  ],
  variable: '--font-vollkorn',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

const alegreyaSans = localFont({
  src: [
    { path: './fonts/alegreya-sans-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/alegreya-sans-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/alegreya-sans-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-alegreya-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

// Amiri is a revival of the naskh cut used by the Bulaq press. Ayat themselves
// are drawn in the mushaf fonts now, which frees it to be the Arabic interface's
// display face -- the naskh counterpart to Vollkorn.
const amiri = localFont({
  src: [
    { path: './fonts/amiri-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/amiri-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-amiri',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

// The Arabic interface's body face: a calm humanist sans with a real Arabic
// design, so running text in Arabic is not left to a system fallback.
const plexArabic = localFont({
  src: [
    { path: './fonts/plex-sans-arabic-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/plex-sans-arabic-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/plex-sans-arabic-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-arabic',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

/*
  The tab title, home-screen name and description are deliberately neutral.
  Plenty of readers use a shared or family phone and would rather not have an
  obviously religious app announcing itself from the home screen. The app calls
  itself Ayah Arena everywhere inside the door. This holds in Arabic too -- the
  title stays "Arena" rather than an Arabic name that would announce itself.
*/
export const metadata: Metadata = {
  title: 'Arena',
  description: 'A recall practice game.',
  applicationName: 'Arena',
  appleWebApp: { title: 'Arena', capable: true },
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: '#0d141e',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    // The font variables go on <html>, not <body>: the theme tokens that use
    // them (--font-display etc.) are declared on :root, and a custom property
    // resolves where it is declared -- on <body> they were undefined at :root
    // and every font fell back to the system stack.
    <html
      lang={locale}
      dir={dict(locale).dir}
      className={`${vollkorn.variable} ${alegreyaSans.variable} ${amiri.variable} ${plexArabic.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <QuranFontGuard />
        {children}
      </body>
    </html>
  );
}
