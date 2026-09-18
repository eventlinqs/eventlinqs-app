/**
 * DRIVE: the homepage card system renders IDENTICALLY after its repeated class
 * lists are collapsed into composite utilities.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD clause C8B.3, 19 September 2026. The origin
 * cost table found that the homepage document is 1,007,295 B and that 34.9% of
 * it is `class` attribute values:
 *
 *     markup  class="..."       195,365 B   19.4% of the document
 *     flight  \"className\":    156,478 B   15.5% of the document
 *
 * across 131 distinct values, 98 of which repeat. One 464-character value ships
 * 104 times: once in the markup and once again in the RSC payload, because a
 * card component's class list is a string literal re-serialised per card.
 * Collapsing it into a composite utility removes it twice.
 *
 * ============================================================================
 * WHY A COMPUTED-STYLE DRIVE AND NOT A SCREENSHOT DIFF
 * ============================================================================
 *
 * The whole risk of this change is that `@apply` inside an `@utility` does not
 * reproduce the utilities it replaces. A screenshot proves the resting state at
 * one moment; it cannot see a transition-duration, a focus ring that exists
 * only under :focus-visible, or a hover transform. Those are exactly where a
 * hand-translation drifts, and two of them are founder law: the Motion
 * section's hover illumination, and the gold focus ring.
 *
 * So this reads getComputedStyle for a fixed property list in three states -
 * rest, hover, focus-visible - and compares BEFORE against AFTER value for
 * value. A screenshot is taken as well, because a computed style that matches
 * while the page looks wrong is a failure this would otherwise miss.
 *
 * ============================================================================
 * IT SELECTS STRUCTURALLY, NEVER BY THE CLASS UNDER TEST
 * ============================================================================
 *
 * Selecting `.home-card-surface` would make the BEFORE capture find nothing and
 * report a clean pass over an empty set, which is the vacuous green this
 * repository has been bitten by before. Cards are found by what they ARE - an
 * anchor to an event carrying an image and a heading - so the same elements are
 * measured on both trees. The comparison also REFUSES when it compared nothing.
 *
 * ============================================================================
 * IT MEASURES MORE THAN ONE CARD FAMILY, AND MORE THAN ONE PAGE
 * ============================================================================
 *
 * Added 19 September 2026 for the browse card (`EventCard`), the second family
 * to be collapsed. It is a DIFFERENT component from the home rail card, it
 * renders on eighteen surfaces, and on /events its class values are 26.6% of
 * the document. Giving it a second copy of this file would have meant two
 * harnesses to keep honest, so `--path=` was added instead and the role
 * finders are structural enough to serve both shapes.
 *
 * A role a page does not have reads `null`, and null on one side with a value
 * on the other is a FAULT rather than a skip - that is what stops a selector
 * that has gone blind from passing as "this page simply has no price".
 *
 * Usage (paths carry NO leading slash: MSYS rewrites a leading slash to a
 * Windows path before node sees it):
 *   node scripts/verify/card-class-collapse-drive.mjs --serve --port=3200 --path=home --out=before.json
 *   node scripts/verify/card-class-collapse-drive.mjs --serve --port=3200 --path=home --path=events --out=after.json --expect=before.json
 */
import { chromium } from 'playwright'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'
import { comparableValue } from './lib/transition-equivalence.mjs'

const TAG = '[card-class-collapse]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const OUT = args.find(a => a.startsWith('--out='))?.split('=')[1]
const EXPECT = args.find(a => a.startsWith('--expect='))?.split('=')[1]
const SHOTS = args.find(a => a.startsWith('--shots='))?.split('=')[1]
let BASE = args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`

/**
 * The pages to measure. `home` is the literal root; anything else is taken as
 * a path. Defaults to the homepage alone so every earlier invocation of this
 * drive still means what it meant.
 */
const PATHS = (() => {
  const given = args.filter(a => a.startsWith('--path=')).map(a => a.split('=')[1])
  if (given.length === 0) return ['/']
  return given.map(p => (p === 'home' || p === '' ? '/' : p.startsWith('/') ? p : `/${p}`))
})()

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

/**
 * BOTH MOTION BRANCHES, and the first version of this drive measured only one.
 *
 * Headless Chromium reports `prefers-reduced-motion: reduce` by default, so the
 * first BEFORE capture read `transition-property: none` and `transform: none`
 * everywhere: it was measuring the `motion-reduce:` branch and would have
 * proved the collapsed class correct in the one state where most of its
 * declarations are switched OFF. The hover lift, the 200ms eased transition and
 * the image zoom - the three things a reader would call "the card working" -
 * were all outside the proof.
 *
 * So every viewport is measured twice, and the AFTER comparison covers both.
 *
 * AND THE SECOND STATE HAS TO STOP LOOKING LIKE AN AUDIT, which is the part
 * that took two captures to find. `HEAD_HEADLESS_FLAG` in src/app/layout.tsx
 * tests the user agent for `HeadlessChrome` and, when it matches, sets
 * `data-headless="1"` and RETURNS - so `data-motion` is never set and
 * `[data-headless="1"]` disables every transition and animation on the page.
 * That is correct product behaviour (CLAUDE.md, Motion: headless audits see the
 * final state from first paint) and it made the first capture of this drive
 * read `transition-property: none` in BOTH states.
 *
 * So the `full` state presents the same browser under a real visitor's user
 * agent. Nothing is faked about the product: the page is the page, and the only
 * thing changed is the one signal the product itself uses to decide which of
 * its two documented branches to render. The capture records
 * `html[data-motion]` so a reader can confirm which branch each row measured,
 * and the comparison fails if that flag ever differs between the two trees.
 */
const REAL_VISITOR_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const MOTION_STATES = [
  { label: 'audit', reducedMotion: 'reduce', userAgent: undefined },
  { label: 'visitor', reducedMotion: 'no-preference', userAgent: REAL_VISITOR_UA },
]

/**
 * The properties each of the three collapsed class lists actually sets.
 *
 * `translate` AND `scale` ARE LISTED SEPARATELY FROM `transform` ON PURPOSE.
 * Tailwind v4 compiles `-translate-y-1` to the `translate` property and
 * `scale-[1.03]` to the `scale` property, not to `transform`. The first run of
 * this drive listed only `transform`, read `none` on a hovered card whose
 * box-shadow had visibly changed, and would have reported the founder's hover
 * lift and image zoom as unchanged while silently measuring neither.
 */
const PROPS = {
  card: [
    'display',
    'flex-direction',
    'width',
    'height',
    'overflow-x',
    'overflow-y',
    'border-top-left-radius',
    'border-top-width',
    'border-top-color',
    'background-color',
    'box-shadow',
    'transition-property',
    'transition-duration',
    'transition-timing-function',
    'outline-style',
    'transform',
    'translate',
    'scale',
  ],
  image: [
    'object-fit',
    'transition-property',
    'transition-duration',
    'transition-timing-function',
    'transform',
    'translate',
    'scale',
    'filter',
  ],
  title: [
    'font-size',
    'font-weight',
    'font-family',
    'line-height',
    'letter-spacing',
    'color',
    'margin-top',
    'transition-property',
    'transition-duration',
    '-webkit-line-clamp',
  ],
  label: ['font-size', 'font-weight', 'font-family', 'letter-spacing', 'text-transform', 'color'],
  date: ['font-size', 'font-weight', 'letter-spacing', 'text-transform', 'color'],
  price: ['font-size', 'font-weight', 'font-family', 'color'],
  /*
   * THE BROWSE CARD'S OWN ROLES, added 19 September 2026.
   *
   * These five carry properties the home card family never had in this drive,
   * and each one is here because the collapse MOVES it rather than renames it:
   * the body's padding, the meta row's gap, the footer's gap and padding-top,
   * the price's size and weight and the title's transition all arrived as
   * INLINE STYLES (`style={{ ... }}`), which is a per-card cost in the markup
   * and again as a serialised object in the flight payload. An inline style
   * beats every class in the cascade, so moving one into a class is the change
   * most able to go quietly wrong, and it is measured here property by
   * property because of that.
   */
  media: ['position', 'aspect-ratio', 'overflow-x', 'overflow-y', 'background-color', 'border-radius'],
  body: ['display', 'flex-grow', 'flex-direction', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  meta: ['display', 'align-items', 'gap', 'margin-top', 'font-size', 'line-height', 'font-weight', 'color'],
  footer: ['display', 'align-items', 'justify-content', 'margin-top', 'gap', 'padding-top'],
  priceText: ['font-family', 'font-size', 'font-weight', 'color'],
  badge: [
    'position',
    'left',
    'top',
    'display',
    'align-items',
    'border-radius',
    'padding-left',
    'padding-right',
    'padding-top',
    'padding-bottom',
    'font-size',
    'font-weight',
    'text-transform',
    'letter-spacing',
    'background-color',
    'color',
    'box-shadow',
  ],
  save: [
    'display',
    'width',
    'height',
    'position',
    'right',
    'top',
    'border-radius',
    'background-color',
    'color',
    'box-shadow',
    'transition-property',
    'transition-duration',
    'scale',
  ],
}

/** Every role the sampler reads, in the order a reader would meet them. */
const ROLES = ['card', 'media', 'image', 'badge', 'save', 'body', 'label', 'title', 'meta', 'footer', 'priceText', 'date', 'price']

/**
 * The canonical rail control (`ARROW_BTN` in src/components/ui/snap-rail.tsx).
 * It is measured in THREE states because two of its five class groups only
 * exist in states a resting screenshot never reaches: `disabled:` at a rail
 * end, and `focus-visible:`. Collapsing a 642-character list and proving only
 * the resting state would leave the muted disabled fill and the gold ring
 * unproven, and both are design law (CLAUDE.md, Rail Control System).
 */
const ARROW_PROPS = [
  'display',
  'width',
  'height',
  'border-radius',
  'background-color',
  'color',
  'box-shadow',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'translate',
  'scale',
  'cursor',
  'outline-style',
]

const faults = []
const notes = []
function check(ok, message) {
  if (!ok) faults.push(message)
  console.log(`${TAG}   ${ok ? 'ok  ' : 'FAIL'} ${message}`)
}

let stopServer = null
if (SERVE) {
  try {
    await refuseUnlessThePortIsFree(PORT, 'before the measurement server was started', 'pass --port= for one this lane owns')
  } catch (error) {
    console.error(`${TAG} REFUSING: ${error.message}`)
    process.exit(1)
  }
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), '.tmp/card-class-collapse-server.log', { port: PORT })
  if (started.error) {
    console.error(`${TAG} could not serve the build: ${started.error}`)
    process.exit(1)
  }
  BASE = started.base
  stopServer = started.stop
  console.log(`${TAG} serving the production build on ${BASE}`)
}

/**
 * Reads the three roles out of the first `count` event cards on the page.
 * Passed to the browser as a string so the property lists can be injected.
 */
function sampleScript(count) {
  return `(() => {
    const PROPS = ${JSON.stringify(PROPS)};
    const PROPS_CARD = PROPS.card;
    const PROPS_IMAGE = PROPS.image;
    const PROPS_TITLE = PROPS.title;
    const PROPS_LABEL = PROPS.label;
    const PROPS_DATE = PROPS.date;
    const PROPS_PRICE = PROPS.price;
    const read = (el, props) => {
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of props) o[p] = cs.getPropertyValue(p).trim();
      return o;
    };
    const anchors = [...document.querySelectorAll('a[href^="/events/"]')]
      .filter(a => a.querySelector('img') && a.querySelector('h3'));
    return anchors.slice(0, ${count}).map(a => {
      const img = a.querySelector('img');
      const h3 = a.querySelector('h3');
      const label = a.querySelector('p');
      /* HoverWash renders TWO aria-hidden spans (media-grade-veil and
       * card-hover-wash) inside the card's media div, and they come FIRST in
       * document order. The first version of this took spans[0] and spans[1]
       * and reported the veil's computed style as the card's date and price -
       * font-weight 400 and no uppercase, which is what gave it away. */
      const spans = [...a.querySelectorAll('span')].filter(s => !s.hasAttribute('aria-hidden'));
      /*
       * THE BROWSE CARD'S PARTS, FOUND BY STRUCTURE AND NEVER BY THE CLASS
       * UNDER TEST. The media box is whatever holds the image, the body is
       * whatever holds the heading, the meta row is the paragraph carrying the
       * pin icon, the footer is the body's last child and the price is the
       * paragraph inside it. A page without one of these reports null for it,
       * and the comparison treats null-on-one-side as a fault.
       */
      const media = img.parentElement;
      const body = h3.parentElement;
      const badge = media ? media.querySelector('span:not([aria-hidden])') : null;
      const save = media ? media.querySelector('button[aria-label]') : null;
      const meta = body ? [...body.querySelectorAll(':scope > p')].find(p => p.querySelector('svg')) : null;
      const footer = body && body.lastElementChild && body.lastElementChild.tagName === 'DIV'
        ? body.lastElementChild
        : null;
      const priceText = footer ? footer.querySelector('p') : null;
      return {
        href: a.getAttribute('href'),
        cardClassLength: (a.getAttribute('class') || '').length,
        imageClassLength: (img.getAttribute('class') || '').length,
        titleClassLength: (h3.getAttribute('class') || '').length,
        labelClassLength: label ? (label.getAttribute('class') || '').length : null,
        mediaClassLength: media ? (media.getAttribute('class') || '').length : null,
        bodyClassLength: body ? (body.getAttribute('class') || '').length : null,
        saveClassLength: save ? (save.getAttribute('class') || '').length : null,
        /* The inline styles the collapse moves into classes. Recorded as
         * LENGTHS so the saving is visible in the drive's own output, and as a
         * count so a style attribute that survives the change is not silently
         * lost among computed values that match. */
        inlineStyleChars:
          [a, media, img, body, h3, meta, footer, priceText, label]
            .filter(Boolean)
            .reduce((n, el) => n + (el.getAttribute('style') || '').length, 0),
        card: read(a, PROPS_CARD),
        image: read(img, PROPS_IMAGE),
        title: read(h3, PROPS_TITLE),
        label: label ? read(label, PROPS_LABEL) : null,
        date: spans[0] ? read(spans[0], PROPS_DATE) : null,
        price: spans[1] ? read(spans[1], PROPS_PRICE) : null,
        media: media ? read(media, PROPS.media) : null,
        body: body ? read(body, PROPS.body) : null,
        badge: badge ? read(badge, PROPS.badge) : null,
        save: save ? read(save, PROPS.save) : null,
        meta: meta ? read(meta, PROPS.meta) : null,
        footer: footer ? read(footer, PROPS.footer) : null,
        priceText: priceText ? read(priceText, PROPS.priceText) : null,
      };
    });
  })()`
}

/**
 * The rail arrows, in all three states. `disabled` is read from a rail that is
 * scrolled to its start (the previous control is disabled there), and focus is
 * read after focusing the enabled one.
 */
const ARROW_SCRIPT = `(() => {
  const PROPS = ${JSON.stringify(ARROW_PROPS)};
  const read = (el) => {
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of PROPS) o[p] = cs.getPropertyValue(p).trim();
    return o;
  };
  /* RailArrows label themselves "Scroll <rail> left|right". Matching
   * /previous|next/ instead found the HERO CAROUSEL's controls ("Previous
   * event"), which are a different component with a different class list, and
   * the drive would have proved the wrong button unchanged. The 298-character
   * translucent control it measured was the giveaway: ARROW_BTN is 642
   * characters and opaque. */
  const buttons = [...document.querySelectorAll('button[aria-label]')]
    .filter(b => /^Scroll .+ (left|right)$/.test(b.getAttribute('aria-label') || ''));
  const enabled = buttons.find(b => !b.disabled) || null;
  const disabled = buttons.find(b => b.disabled) || null;
  return {
    found: buttons.length,
    classLength: enabled ? (enabled.getAttribute('class') || '').length : null,
    enabled: enabled ? read(enabled) : null,
    disabled: disabled ? read(disabled) : null,
  };
})()`

const FIRST_CARD = `[...document.querySelectorAll('a[href^="/events/"]')].filter(x => x.querySelector('img') && x.querySelector('h3'))[0]`

const capture = {}

const browser = await chromium.launch()
try {
 for (const path of PATHS) {
  for (const vp of VIEWPORTS) {
   for (const motion of MOTION_STATES) {
    const key = `${path} ${vp.label}/${motion.label}`
    console.log(`${TAG} ${path}  ${vp.width}x${vp.height}  prefers-reduced-motion: ${motion.label}`)
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: motion.reducedMotion,
      ...(motion.userAgent ? { userAgent: motion.userAgent } : {}),
    })
    const page = await context.newPage()
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    check(res?.status() === 200, `${key}: the page answered ${res?.status()}`)

    /* Recorded so a reader can tell WHICH branch each capture exercised.
     * html[data-motion="1"] is set pre-paint by the head bootstrap and is what
     * arms the hover illumination; without it the card is deliberately inert. */
    const dataMotion = await page.evaluate(`document.documentElement.getAttribute('data-motion')`)
    console.log(`${TAG}   html[data-motion] = ${JSON.stringify(dataMotion)}`)

    const rest = await page.evaluate(sampleScript(3))
    check(rest.length === 3, `${key}: ${rest.length} event card(s) found to measure (3 needed)`)
    if (rest.length === 0) {
      notes.push(`${key}: no cards found, nothing measured`)
      await context.close()
      continue
    }

    /* HOVER. The founder's hover illumination law lives here: the card lifts,
     * the image brightens. Both are armed only under html[data-motion="1"], so
     * this records whatever this build actually does rather than asserting a
     * value, and the BEFORE/AFTER comparison is what judges it. */
    const firstCard = page.locator('a[href^="/events/"]').filter({ has: page.locator('img') }).first()
    await firstCard.hover()
    await page.waitForTimeout(400)
    const hovered = await page.evaluate(`(() => {
      const a = ${FIRST_CARD};
      const img = a.querySelector('img');
      const h3 = a.querySelector('h3');
      return {
        cardTransform: getComputedStyle(a).transform,
        cardTranslate: getComputedStyle(a).translate,
        cardScale: getComputedStyle(a).scale,
        cardBoxShadow: getComputedStyle(a).boxShadow,
        imageTransform: getComputedStyle(img).transform,
        imageTranslate: getComputedStyle(img).translate,
        imageScale: getComputedStyle(img).scale,
        imageFilter: getComputedStyle(img).filter,
        titleColor: getComputedStyle(h3).color,
      };
    })()`)

    /* FOCUS-VISIBLE. The gold ring is design law and exists only in this state,
     * so a rest-only capture would let it be deleted silently. */
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(`(() => {
      const a = ${FIRST_CARD};
      a.focus();
      const cs = getComputedStyle(a);
      return { boxShadow: cs.boxShadow, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor };
    })()`)

    const arrows = await page.evaluate(ARROW_SCRIPT)
    check(arrows.found > 0, `${key}: ${arrows.found} rail arrow control(s) found to measure`)

    capture[key] = { dataMotion, rest, hovered, focused, arrows }

    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true })
      const slug = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-')
      await page.screenshot({ path: `${SHOTS}/${slug}-${vp.label}-${motion.label}.png`, fullPage: false })
    }
    await context.close()
   }
  }
 }
} finally {
  await browser.close()
  if (stopServer) await stopServer()
}

/**
 * CALIBRATION. A drive that measured the same branch twice would compare two
 * inert pages and pass, which is exactly what the first version of this file
 * did. So it proves it reached BOTH branches before it is allowed to report.
 */
const motionFlags = Object.entries(capture).map(([k, v]) => [k, v.dataMotion])
const armed = motionFlags.filter(([, v]) => v === '1')
const inert = motionFlags.filter(([, v]) => v !== '1')
check(
  armed.length > 0,
  `at least one capture armed the motion branch (html[data-motion="1"]): ${armed.length} of ${motionFlags.length} did`,
)
check(
  inert.length > 0,
  `at least one capture measured the audit branch (no data-motion): ${inert.length} of ${motionFlags.length} did`,
)

if (OUT) {
  mkdirSync(dirname(resolve(OUT)), { recursive: true })
  writeFileSync(OUT, JSON.stringify(capture, null, 2))
  console.log(`${TAG} written ${OUT}`)
}

if (EXPECT) {
  if (!existsSync(EXPECT)) {
    console.error(`${TAG} REFUSING: --expect=${EXPECT} does not exist. Nothing to compare against.`)
    process.exit(1)
  }
  const before = JSON.parse(readFileSync(EXPECT, 'utf8'))
  let compared = 0
  const keys = PATHS.flatMap(p => VIEWPORTS.flatMap(v => MOTION_STATES.map(m => `${p} ${v.label}/${m.label}`)))
  for (const vp of keys) {
    const b = before[vp]
    const a = capture[vp]
    if (!b || !a) {
      faults.push(`${vp}: one side of the comparison is missing`)
      continue
    }
    compared += 1
    if (b.dataMotion !== a.dataMotion) {
      faults.push(`${vp} html[data-motion]: was ${JSON.stringify(b.dataMotion)}, now ${JSON.stringify(a.dataMotion)}`)
    }
    /* The class ATTRIBUTE is expected to change - that is the point of the
     * change - so it is REPORTED rather than compared. Everything the class
     * DOES is compared, and that is the contract this drive holds. */
    for (let i = 0; i < Math.min(b.rest.length, a.rest.length); i += 1) {
      if (b.rest[i].href !== a.rest[i].href) {
        notes.push(`${vp} card ${i}: href moved (${b.rest[i].href} -> ${a.rest[i].href}), styles still compared`)
      }
      for (const role of ROLES) {
        if (!b.rest[i][role] || !a.rest[i][role]) {
          if (b.rest[i][role] !== a.rest[i][role]) {
            faults.push(`${vp} card ${i} ${role}: present on one tree and absent on the other`)
          }
          continue
        }
        for (const prop of PROPS[role]) {
          compared += 1
          /* Read through `comparableValue`, which expands a single
           * transition-duration / timing-function across the property list
           * exactly as CSS does. A shorthand declares the duration once per
           * property and a longhand declares it once for all of them; the
           * behaviour is identical and only the serialisation differs. It
           * cannot hide a value that genuinely changed - see
           * scripts/verify/lib/transition-equivalence.mjs and its tests. */
          const was = comparableValue(b.rest[i][role], prop)
          const now = comparableValue(a.rest[i][role], prop)
          if (was !== now) faults.push(`${vp} card ${i} ${role} ${prop}: was "${was}", now "${now}"`)
        }
      }
    }
    for (const k of Object.keys(b.hovered)) {
      compared += 1
      if (b.hovered[k] !== a.hovered[k]) faults.push(`${vp} hover ${k}: was "${b.hovered[k]}", now "${a.hovered[k]}"`)
    }
    for (const k of Object.keys(b.focused)) {
      compared += 1
      if (b.focused[k] !== a.focused[k]) faults.push(`${vp} focus-visible ${k}: was "${b.focused[k]}", now "${a.focused[k]}"`)
    }
    /* The rail arrow, enabled AND disabled. The disabled state is only reached
     * at a rail end and carries a class group of its own; leaving it out would
     * let the muted fill be deleted silently. */
    for (const state of ['enabled', 'disabled']) {
      const bs = b.arrows?.[state]
      const as = a.arrows?.[state]
      if (!bs || !as) {
        if (Boolean(bs) !== Boolean(as)) {
          faults.push(`${vp} rail arrow ${state}: present on one tree and absent on the other`)
        }
        continue
      }
      for (const prop of ARROW_PROPS) {
        compared += 1
        const was = comparableValue(bs, prop)
        const now = comparableValue(as, prop)
        if (was !== now) {
          faults.push(`${vp} rail arrow ${state} ${prop}: was "${was}", now "${now}"`)
        }
      }
    }
    console.log(
      `${TAG} ${vp}: card class attribute ${b.rest[0].cardClassLength} -> ${a.rest[0].cardClassLength} chars, ` +
        `image ${b.rest[0].imageClassLength} -> ${a.rest[0].imageClassLength}, ` +
        `title ${b.rest[0].titleClassLength} -> ${a.rest[0].titleClassLength}, ` +
        `label ${b.rest[0].labelClassLength} -> ${a.rest[0].labelClassLength}, ` +
        `rail arrow ${b.arrows?.classLength} -> ${a.arrows?.classLength}`,
    )
    console.log(
      `${TAG} ${vp}: media ${b.rest[0].mediaClassLength} -> ${a.rest[0].mediaClassLength}, ` +
        `body ${b.rest[0].bodyClassLength} -> ${a.rest[0].bodyClassLength}, ` +
        `save ${b.rest[0].saveClassLength} -> ${a.rest[0].saveClassLength}, ` +
        `inline style ${b.rest[0].inlineStyleChars} -> ${a.rest[0].inlineStyleChars} chars on one card`,
    )
  }
  check(compared > 0, `the comparison examined ${compared} computed values (a comparison of nothing is not a pass)`)
}

for (const n of notes) console.log(`${TAG} note: ${n}`)
if (faults.length) {
  console.error(`${TAG} FAIL - ${faults.length} fault(s)`)
  for (const f of faults) console.error(`${TAG}   ${f}`)
  process.exit(1)
}
console.log(
  `${TAG} PASS - ${PATHS.length} path(s) (${PATHS.join(', ')}), ${VIEWPORTS.length} viewport(s), ` +
    `rest + hover + focus-visible, 0 faults`,
)
