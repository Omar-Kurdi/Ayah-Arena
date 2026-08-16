import type { Metadata, Viewport } from 'next';
import { Vollkorn, Alegreya_Sans, Amiri } from 'next/font/google';
import './globals.css';

// Vollkorn and Alegreya Sans are both book faces with calligraphic warmth and
// a sturdy, low-contrast build -- the closest Latin relatives to naskh, which
// is the only script on these pages that actually matters. A high-contrast
// display serif would have fought it.
const vollkorn = Vollkorn({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-vollkorn',
  display: 'swap',
});

const alegreyaSans = Alegreya_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-alegreya-sans',
  display: 'swap',
});

// Amiri is a revival of the naskh cut used by the Bulaq press, the lineage most
// printed mushafs still follow. Ayah text is set in it and nothing else.
const amiri = Amiri({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-amiri',
  display: 'swap',
});

/*
  The tab title, home-screen name and description are deliberately neutral.
  Plenty of readers use a shared or family phone and would rather not have an
  obviously religious app announcing itself from the home screen. The app calls
  itself Ayah Arena everywhere inside the door.
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${vollkorn.variable} ${alegreyaSans.variable} ${amiri.variable} min-h-dvh antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
