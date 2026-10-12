# Interface fonts

The four interface faces, served from the app itself rather than fetched from
Google Fonts at build time. `next/font/google` downloads its files during
`next build`, so a moment's network trouble failed the build -- in CI and on a
deploy alike. These are loaded with `next/font/local` in `src/app/layout.tsx`.

The Quran is not drawn with these: the mushaf fonts are in `public/fonts/`.

| Face | Role | Files |
|---|---|---|
| Vollkorn | English display | `vollkorn-wght.woff2`, `vollkorn-italic-wght.woff2` (variable, 400–600) |
| Alegreya Sans | English body | `alegreya-sans-{400,500,700}.woff2` |
| Amiri | Arabic display; fallback for typed Quran text | `amiri-{400,700}.woff2` |
| IBM Plex Sans Arabic | Arabic body | `plex-sans-arabic-{400,500,600}.woff2` |

All four are under the SIL Open Font License 1.1; each licence is beside the
files (`*-OFL.txt`), as the licence requires.

## How they were made

Source: [google/fonts](https://github.com/google/fonts) at commit
`bd8f81ddb5c74d5c8897b36ad88b440266245103`, from `ofl/vollkorn`,
`ofl/alegreyasans`, `ofl/amiri` and `ofl/ibmplexsansarabic`.

Each face is cut down to the Unicode ranges Google Fonts itself serves for the
subsets this app's text uses -- the same characters a browser was downloading
before:

- English faces: `latin` + `latin-ext`.
- Arabic faces: `arabic` + `latin` + `latin-ext`. The Arabic interface still
  carries Latin words ("Hugging Face", "English"), and Amiri is a fallback for
  Unicode Quran text.

No string in `src/lib/i18n.ts` and no surah name in `data/index.json` falls
outside those ranges. Every OpenType layout feature is kept, because Arabic
shaping depends on them.

With [fontTools](https://github.com/fonttools/fonttools) and brotli:

```bash
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
LATINEXT="U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF"
ARABIC="U+0600-06FF,U+0750-077F,U+0870-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC7,U+10EC9-10EEE,U+10EF0-10EFF,U+1EE00-1EEFF"

# Vollkorn is variable: keep only the 400-600 the app uses, then subset.
fonttools varLib.instancer 'Vollkorn[wght].ttf' wght=400:600 -o vk.ttf
pyftsubset vk.ttf --unicodes="$LATIN,$LATINEXT" --layout-features='*' --flavor=woff2 --output-file=vollkorn-wght.woff2
# ...the same for Vollkorn-Italic[wght].ttf.

# The static faces: one file per weight.
pyftsubset AlegreyaSans-Regular.ttf --unicodes="$LATIN,$LATINEXT" --layout-features='*' --flavor=woff2 --output-file=alegreya-sans-400.woff2
pyftsubset Amiri-Regular.ttf --unicodes="$ARABIC,$LATIN,$LATINEXT" --layout-features='*' --flavor=woff2 --output-file=amiri-400.woff2
# ...and likewise for the other weights.
```

pyftsubset drops IBM Plex Sans Arabic's `meta` table, which only declares the
languages the font was designed for. Nothing renders from it.
