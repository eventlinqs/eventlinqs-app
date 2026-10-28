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

## The campaign treatments' faces (28 October 2026)

Lawal approved the three creative treatments on 28 October 2026 (the reference
designs in `C:\dev\EVIDENCE\CREATIVE-APPROVED-28OCT`). They set the headline in
Archivo at condensed widths and every detail in Manrope, the two families the
site itself loads (`src/app/layout.tsx`). satori draws only static faces and
cannot set a variable font's width axis, so the widths the references use are
cut as static instances of the variable files and vendored here.

| File | Family as registered | Weight | Instance |
|---|---|---|---|
| `ArchivoCompressed-Black.ttf` | Archivo Compressed | 900 | Archivo `wdth=62 wght=900` |
| `ArchivoCondensed-Heavy.ttf` | Archivo Condensed | 800 | Archivo `wdth=72 wght=850` (registered at 800, the nearest weight satori names) |
| `Archivo-SemiBold.ttf` | Archivo | 600 | Archivo `wdth=100 wght=600` |
| `Manrope-Medium.ttf` to `Manrope-ExtraBold.ttf` | Manrope | 500, 600, 700, 800 | Manrope `wght=500` to `800` |

Sources, fetched 28 October 2026 from the Google Fonts repository:
`https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf`
(sha256 0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053) and
`https://github.com/google/fonts/raw/main/ofl/manrope/Manrope%5Bwght%5D.ttf`
(sha256 3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6),
instanced with fontTools `varLib.instancer`. Both are SIL Open Font License 1.1;
the licence texts travel with the files as `OFL-Archivo.txt` and `OFL-Manrope.txt`.
