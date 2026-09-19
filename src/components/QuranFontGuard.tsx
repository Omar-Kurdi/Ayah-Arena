'use client';

import { useEffect } from 'react';

const isPageFont = (face: FontFace) => face.family.replace(/["']/g, '').startsWith('qpc-p');

/**
 * If a mushaf page font fails to load, the glyph codes it would have drawn
 * fall through to a system font. They are Arabic presentation-form codepoints,
 * so that font draws real-looking Arabic that is not the ayah -- the one
 * failure this app cannot allow. On any page-font error this flags the
 * document, and CSS swaps every ayah to its Unicode text in the Uthmanic Hafs
 * font: plainer script, but the right words.
 */
export function QuranFontGuard() {
  useEffect(() => {
    const flag = () => document.documentElement.setAttribute('data-qpc-failed', '');

    if ([...document.fonts].some((face) => isPageFont(face) && face.status === 'error')) flag();

    const onError = (event: FontFaceSetLoadEvent) => {
      if (event.fontfaces.some(isPageFont)) flag();
    };
    document.fonts.addEventListener('loadingerror', onError);
    return () => document.fonts.removeEventListener('loadingerror', onError);
  }, []);

  return null;
}
