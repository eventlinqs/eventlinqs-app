/**
 * poster-visual-set.mjs - render a spread of real posters so a human can LOOK
 * at them.
 *
 * A passing assertion about bytes is not the same as somebody having seen the
 * artefact. The unit tests prove the fitter returns the largest size that fits;
 * they cannot tell you whether the result reads as a designed poster or as a
 * template with a gap, which is the actual question.
 *
 * The set is chosen to cover the cases that break layouts:
 *   short title      the case the typographic composition exists for, where the
 *                    old renderer drew 29pt type lost in half a page of navy
 *   medium title     the ordinary case
 *   long title       forces the fitter to step down and wrap
 *   unspaced token   a pasted URL, which used to run straight off the page
 *   with artwork     the same composition an organiser gets after uploading
 *
 * Output: docs/design/poster-composition/set/*.pdf
 * Usage:  npx vitest run tests/unit/poster-visual-set.test.ts
 *
 * This is driven by a test file rather than run directly because the renderer
 * is TypeScript behind the @/ alias, and vitest already resolves both.
 */
export const POSTER_SET = [
  {
    slug: '01-short-title-no-artwork',
    note: 'The case the composition exists for. Must print LARGE.',
    input: {
      title: "Ruby's 16th",
      dateLabel: 'Saturday 20 September 2026',
      locality: 'Belmont Hall, Geelong',
      priceLabel: 'Free entry',
      organiserName: 'The Nguyen Family',
    },
  },
  {
    slug: '02-medium-title-no-artwork',
    note: 'The ordinary case.',
    input: {
      title: 'Barwon Club Winter Session',
      dateLabel: 'Friday 3 July 2026',
      locality: 'The Barwon Club, Geelong',
      priceLabel: 'From $25',
      organiserName: 'Barwon Club Presents',
    },
  },
  {
    slug: '03-long-title-no-artwork',
    note: 'Forces the fitter to step down and wrap.',
    input: {
      title: 'Warehouse party at the Barwon Club with Marlo Reyes back to back with Kita all night long',
      dateLabel: 'Saturday 20 September 2026',
      locality: 'The Barwon Club, Geelong',
      priceLabel: 'From $25',
      organiserName: 'Barwon Club Presents',
    },
  },
  {
    slug: '04-unspaced-token-no-artwork',
    note: 'Used to run off the page. Must wrap mid-token.',
    input: {
      title: 'SUMMERFESTIVAL2026GEELONGWATERFRONTALLAGESSHOW',
      dateLabel: 'Sunday 11 January 2026',
      locality: 'Geelong Waterfront',
      priceLabel: 'From $40',
      organiserName: 'Waterfront Events',
    },
  },
  {
    slug: '04b-six-line-title-no-artwork',
    note: 'H2. Must keep real clear air above the QR block, not sit flush against it.',
    input: {
      // Deliberately long enough to take the fitter to its six line ceiling,
      // which is the case that used to print the last line straight through the
      // QR code. The headline is set across the FULL content width while the
      // date and locality are only in the left column, so the left column alone
      // was never the thing the headline had to clear.
      title:
        'The Barwon Club presents a very long winter warehouse session with Marlo Reyes back to back with Kita and friends across two rooms until sunrise',
      dateLabel: 'Saturday 20 September 2026',
      locality: 'The Barwon Club, 509 Moorabool Street, South Geelong',
      priceLabel: 'From $25',
      organiserName: 'Barwon Club Presents',
    },
  },
  {
    slug: '05-short-title-with-artwork',
    note: 'The artwork composition, unchanged, with a real photograph.',
    photo: 'public/images/hero/afrobeats.jpg',
    input: {
      title: "Ruby's 16th",
      dateLabel: 'Saturday 20 September 2026',
      locality: 'Belmont Hall, Geelong',
      priceLabel: 'Free entry',
      organiserName: 'The Nguyen Family',
    },
  },
  {
    slug: '06-long-title-with-artwork',
    note: 'The artwork composition with a title that must wrap.',
    photo: 'public/images/hero/amapiano.jpg',
    input: {
      title: 'Warehouse party at the Barwon Club with Marlo Reyes back to back with Kita',
      dateLabel: 'Saturday 20 September 2026',
      locality: 'The Barwon Club, Geelong',
      priceLabel: 'From $25',
      organiserName: 'Barwon Club Presents',
    },
  },
]
