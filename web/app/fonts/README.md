# Bundled site fonts

The curated, admin-selectable fonts (see `lib/fonts.ts`), loaded with
`next/font/local` in `app/layout.tsx`. They're committed here instead of
loaded with `next/font/google` because that loader downloads every family
from Google Fonts during `next build`, and an occasional unparseable response
from Google failed the whole build (and the VPS deploy with it).

Each file is the **Latin-subset variable WOFF2** that Google Fonts serves,
downloaded 2026-11-13:

| File | Family | Weights | Source |
|---|---|---|---|
| inter-latin-variable.woff2 | Inter | 100–900 | fonts.gstatic.com/s/inter/v20 |
| inter-tight-latin-variable.woff2 | Inter Tight | 400–700 | fonts.gstatic.com/s/intertight/v9 |
| ibm-plex-sans-latin-variable.woff2 | IBM Plex Sans | 400–700 | fonts.gstatic.com/s/ibmplexsans/v23 |
| montserrat-latin-variable.woff2 | Montserrat | 100–900 | fonts.gstatic.com/s/montserrat/v31 |
| mulish-latin-variable.woff2 | Mulish | 200–1000 | fonts.gstatic.com/s/mulish/v18 |
| lora-latin-variable.woff2 | Lora | 400–700 | fonts.gstatic.com/s/lora/v37 |
| source-serif-4-latin-variable.woff2 | Source Serif 4 | 200–900 | fonts.gstatic.com/s/sourceserif4/v15 |

All are licensed under the SIL Open Font License 1.1, which permits bundling
and redistribution with the site.

**Adding or refreshing a font:** request
`https://fonts.googleapis.com/css2?family=<Family>:wght@<min>..<max>` with a
modern browser User-Agent, take the `url(...)` of the `/* latin */` block,
save it here, then add a `localFont({ src, weight, variable })` entry in
`app/layout.tsx` and an option in `lib/fonts.ts`.
