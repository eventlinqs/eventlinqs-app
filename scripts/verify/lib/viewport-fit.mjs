/**
 * WHAT "FITS THE VIEWPORT" MEANS, IN ONE PLACE (close-out UX6.2 and UX6.3).
 *
 * ------------------------------------------------------------------------
 * WHY THE OBVIOUS ASSERTION CANNOT SEE THE DEFECT IT WAS WRITTEN FOR.
 *
 * UX6 asks for `document.documentElement.scrollWidth <= window.innerWidth` at
 * every width. That assertion is kept below, verbatim, because it is the right
 * check for the ordinary case. It is NOT sufficient here, and the reason was
 * measured rather than reasoned about, on 10 September 2026:
 *
 *     src/app/globals.css:  html, body { overflow-x: clip }
 *
 * `overflow-x: clip` makes an element's scrollWidth equal its clientWidth by
 * definition. Content wider than the viewport is not scrolled to, it is CUT
 * OFF, and `documentElement.scrollWidth` reports the viewport width while a
 * buyer stares at half a price. Driven on the checkout page at 390: inserting a
 * 520px child into the order-summary grid moved the summary's right edge to
 * 536 while `documentElement.scrollWidth` stayed at exactly 390.
 *
 * That is UX6.3 word for word: "Clipped content is unreachable. No horizontal
 * scroll, no other route to it." So the clip rule is the mechanism by which the
 * defect hides, and an assertion that only reads scrollWidth is a gate that
 * cannot go red. The rule is not removed, because it is load-bearing (the
 * closed mobile drawer, the bleeding rails); instead the measurement is taken
 * where the truth is, on the element boxes.
 *
 * ------------------------------------------------------------------------
 * THE RULE. An element is a CLIPPING FAULT when its border box crosses the
 * right edge of the viewport and none of the following is true:
 *
 *   1. It is PARKED entirely off-canvas by a transform (`left >= innerWidth`
 *      AND it or an ancestor carries a non-identity transform). A closed drawer
 *      at `translate-x-full` shows nothing and therefore clips nothing. An
 *      element merely LAID OUT past the edge is not exempt: it is a worse
 *      defect than a clipped one, being invisible as well as unreachable, and
 *      the 768 drive found the header's account controls sitting there.
 *   2. An ancestor scrolls horizontally (`overflow-x: auto | scroll`). UX6.3
 *      allows exactly this: "Where content genuinely cannot fit it must scroll
 *      inside its own container". A rail is reachable by swiping the rail.
 *   3. It is decorative AND carries nothing a person needs: `aria-hidden="true"`
 *      or `role="presentation"` on it or an ancestor, AND no text of its own,
 *      AND no focusable descendant. A full-bleed hero raster that spills 8px is
 *      not a buyer losing a total. The three conditions are required together
 *      so that `aria-hidden` cannot be used to launder a real control.
 *
 * Only the OUTERMOST offender is reported: if a parent overflows, its children
 * inherit the fault and repeating them turns one defect into thirty lines.
 *
 * The function is a string on purpose. It is evaluated inside the page by
 * page.evaluate, so it must not close over anything in Node.
 */

/** Evaluated in the browser. Returns { innerWidth, docScrollWidth, faults, exempt }. */
export const MEASURE_VIEWPORT_FIT = `() => {
  const iw = window.innerWidth
  const de = document.documentElement
  const describe = (el) => {
    const parts = []
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cls = typeof n.className === 'string' ? n.className.split(/\\s+/).filter(Boolean).slice(0, 4).join('.') : ''
      parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (cls ? '.' + cls : ''))
    }
    return parts.slice(-6).join(' > ')
  }
  const focusable = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
  const faults = []
  const exempt = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const box = el.getBoundingClientRect()
    if (box.width === 0 && box.height === 0) continue
    if (box.right <= iw + 0.5) continue
    // outermost only: a child of an offender is the same defect
    if (el.parentElement) {
      const pb = el.parentElement.getBoundingClientRect()
      if (pb.right > iw + 0.5) continue
    }
    const record = {
      selector: describe(el),
      left: Math.round(box.left),
      width: Math.round(box.width),
      right: Math.round(box.right),
      overhang: Math.round(box.right - iw),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
    }
    /*
     * PARKED OFF-CANVAS, NOT PUSHED OFF THE EDGE. A closed drawer is moved out
     * of view by a TRANSFORM (translate-x-full) and shows nothing, so it clips
     * nothing. A control that a too-wide row has pushed past the edge is also
     * "entirely off-canvas", and it is a worse defect than the clipping that
     * revealed it: it is invisible AND unreachable. The first draft exempted
     * both on position alone, and the 768 drive showed what that costs - the
     * header's account controls were sitting past the right edge, exempt, while
     * the search box beside them was reported. The transform is what separates
     * the two, so the transform is what the exemption asks for.
     */
    let parked = false
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      // BOTH properties, because Tailwind v4 compiles translate-x-full to the
      // standalone \`translate\`, not to \`transform\`. Reading only \`transform\`
      // reported the closed mobile drawer as a control pushed off the screen on
      // every mobile page, which is the drill this rule failed on its first run.
      const t = cs.transform
      const tr = cs.translate
      const moved =
        (t && t !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)) ||
        (tr && tr !== 'none' && !/^0(px)?( 0(px)?)?$/.test(tr))
      if (moved) { parked = true; break }
    }
    if (box.left >= iw - 0.5 && parked) { exempt.push({ ...record, why: 'parked off-canvas by a transform' }); continue }
    if (box.left >= iw - 0.5) {
      faults.push({ ...record, note: 'pushed entirely past the right edge: invisible and unreachable' })
      continue
    }
    let scroller = null
    for (let n = el.parentElement; n; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX
      if (ox === 'auto' || ox === 'scroll') { scroller = describe(n); break }
    }
    if (scroller) { exempt.push({ ...record, why: 'scrolls inside ' + scroller }); continue }
    const hidden = el.closest('[aria-hidden="true"], [role="presentation"]') !== null
    const silent = record.text === '' && el.querySelector(focusable) === null && !el.matches(focusable)
    if (hidden && silent) { exempt.push({ ...record, why: 'decorative: aria-hidden, no text, nothing focusable' }); continue }
    faults.push(record)
  }
  return {
    innerWidth: iw,
    docScrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    faults,
    exempt,
  }
}`

/** Evaluated in the browser. Every marked order total, with its box. */
export const MEASURE_ORDER_TOTALS = `() => {
  const iw = window.innerWidth
  return [...document.querySelectorAll('[data-order-total]')].map((el) => {
    const b = el.getBoundingClientRect()
    return {
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim(),
      left: Math.round(b.left),
      right: Math.round(b.right),
      width: Math.round(b.width),
      innerWidth: iw,
      inside: b.left >= -0.5 && b.right <= iw + 0.5,
      visible: b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden',
    }
  })
}`

/**
 * The verdict for one surface at one width. `totalRequired` says the surface
 * must carry at least one marked total; a surface that renders none and is not
 * required simply has none to judge.
 */
export function judgeSurface({ label, width, fit, totals, totalRequired = false }) {
  const faults = []
  if (fit.docScrollWidth > fit.innerWidth) {
    faults.push(
      `${label} @ ${width}: documentElement.scrollWidth ${fit.docScrollWidth} exceeds innerWidth ${fit.innerWidth}`,
    )
  }
  for (const f of fit.faults) {
    faults.push(
      `${label} @ ${width}: ${f.note ?? `clipped ${f.overhang}px past the right edge and unreachable`}: ${f.selector}` +
        (f.text ? ` :: "${f.text}"` : ''),
    )
  }
  if (totalRequired && totals.length === 0) {
    faults.push(`${label} @ ${width}: no [data-order-total] on a surface that must show the buyer their total`)
  }
  for (const t of totals) {
    if (!t.visible) faults.push(`${label} @ ${width}: the order total is marked but not visible`)
    else if (t.text === '') faults.push(`${label} @ ${width}: the order total element is empty`)
    else if (!t.inside) {
      faults.push(
        `${label} @ ${width}: the order total "${t.text}" sits outside the viewport box (left ${t.left}, right ${t.right}, innerWidth ${t.innerWidth})`,
      )
    }
  }
  return faults
}
