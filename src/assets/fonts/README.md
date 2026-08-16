# Vendored brand typefaces (server-side rendering only)

These four TrueType files are the platform's own type stack, vendored so the
server can draw brand type into raster artefacts (the social cards, and any
future PDF work). They are NOT used by the browser: the site loads Archivo,
Hanken Grotesk and Manrope through `next/font/google` in `src/app/layout.tsx`.

Why vendored rather than fetched at render time: an artefact render must never
depend on a third-party network call. A cold Google Fonts fetch would add
latency to the one moment the organiser is watching, and a failed fetch would
silently drop the card back to a system face, which is precisely the defect
these files exist to fix.

| File | Family | Weight | Source |
|---|---|---|---|
| `Archivo-Bold.ttf` | Archivo | 700 | Google Fonts (`fonts.gstatic.com/s/archivo/v25`) |
| `Archivo-ExtraBold.ttf` | Archivo | 800 | Google Fonts (`fonts.gstatic.com/s/archivo/v25`) |
| `HankenGrotesk-Medium.ttf` | Hanken Grotesk | 500 | Google Fonts (`fonts.gstatic.com/s/hankengrotesk/v12`) |
| `HankenGrotesk-SemiBold.ttf` | Hanken Grotesk | 600 | Google Fonts (`fonts.gstatic.com/s/hankengrotesk/v12`) |

Licence: both families are released under the SIL Open Font License 1.1, which
permits redistribution as part of a larger work. Archivo is by Omnibus-Type,
Hanken Grotesk is by Alfredo Marco Pradil. The OFL requires the licence to
travel with the files; the canonical text is at
<https://openfontlicense.org/open-font-license-official-text/> and each family's
copy ships in its Google Fonts repository directory.

Retrieved 8 August 2026 through the Google Fonts CSS API
(`https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Hanken+Grotesk:wght@500;600`)
with a user agent that resolves to `format('truetype')`, because satori reads
TTF and OTF and cannot read woff2.
