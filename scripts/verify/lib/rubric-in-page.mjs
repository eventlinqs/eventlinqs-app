/**
 * The C14 rubric measurements that run INSIDE a page (CLOSE-OUT C14.12).
 *
 * Both functions are serialised by Playwright's page.evaluate, so they must be
 * self-contained: no imports, no closures over module scope. They are shared by
 * scripts/verify/c14-rubric-measure.mjs (our screens) and
 * scripts/verify/c14-competitor-capture.mjs (the benchmark), so the two sides
 * are measured by exactly the same code.
 */

export function measureInPage() {
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    // 8px: anything smaller is a visually hidden (sr-only) node, not a design element
    if (r.width < 8 || r.height < 8) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
  }
  const toHsl = (rgb) => {
    const m = rgb.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
    if (!m) return null
    const a = m[4] === undefined ? 1 : Number(m[4])
    if (a === 0) return null
    const r = Number(m[1]) / 255
    const g = Number(m[2]) / 255
    const b = Number(m[3]) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return { h: 0, s: 0, l, a }
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
    return { h, s, l, a }
  }
  const isGold = (rgb) => {
    const c = toHsl(rgb)
    return !!c && c.h >= 32 && c.h <= 56 && c.s >= 0.45 && c.l >= 0.2 && c.l <= 0.8
  }
  const nameOf = (el) => {
    const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '')
  }
  // Tailwind composes ring and shadow utilities into one box-shadow with
  // transparent zero-size placeholder layers; strip those so two elements
  // with the same visible shadow count as one.
  const normaliseShadow = (s) =>
    s
      .split(/,(?![^(]*\))/)
      .map((x) => x.trim())
      .filter((x) => !/rgba?\([^)]*,\s*0\)\s+0px 0px 0px 0px$/.test(x))
      .join(', ') || 'none'

  const all = [...document.body.querySelectorAll('*')].filter(vis)
  const pageW = document.documentElement.scrollWidth
  const pageH = document.documentElement.scrollHeight
  const pageArea = pageW * pageH

  const fontSizes = {}
  const fontSizeSamples = {}
  const families = {}
  const radii = {}
  const radiiSamples = {}
  const shadows = {}
  const shadowSamples = {}
  let goldFillArea = 0
  let goldBorderArea = 0
  let goldTextCount = 0
  const goldSamples = []
  const addSample = (map, key, el) => {
    const list = (map[key] ??= [])
    const n = nameOf(el)
    if (list.length < 5 && !list.includes(n)) list.push(n)
  }

  for (const el of all) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
    if (hasOwnText) {
      fontSizes[cs.fontSize] = (fontSizes[cs.fontSize] ?? 0) + 1
      addSample(fontSizeSamples, cs.fontSize, el)
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
      families[fam] = (families[fam] ?? 0) + 1
      if (isGold(cs.color)) goldTextCount += 1
    }
    if (cs.borderRadius && cs.borderRadius !== '0px') {
      radii[cs.borderRadius] = (radii[cs.borderRadius] ?? 0) + 1
      addSample(radiiSamples, cs.borderRadius, el)
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      const key = normaliseShadow(cs.boxShadow)
      if (key !== 'none') {
        shadows[key] = (shadows[key] ?? 0) + 1
        addSample(shadowSamples, key, el)
      }
    }
    const area = r.width * r.height
    if (isGold(cs.backgroundColor)) {
      goldFillArea += area
      if (goldSamples.length < 12) goldSamples.push(`${nameOf(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    } else if (cs.backgroundImage && cs.backgroundImage !== 'none' && /rgb/.test(cs.backgroundImage)) {
      const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []
      if (stops.some(isGold)) goldFillArea += area * 0.5
    }
    const bw = parseFloat(cs.borderTopWidth) || 0
    if (bw > 0 && isGold(cs.borderTopColor)) goldBorderArea += 2 * bw * (r.width + r.height)
  }

  // Line length and orphans on wrapping text blocks.
  const blocks = [...document.body.querySelectorAll('p, h1, h2, h3, h4, li, dd, dt')].filter(vis)
  const lineLengths = []
  const orphans = []
  for (const el of blocks) {
    const text = (el.innerText || '').trim()
    if (text.length < 45) continue
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
    const r = el.getBoundingClientRect()
    const lines = Math.max(1, Math.round(r.height / lh))
    const charsPerLine = Math.round(text.length / lines)
    lineLengths.push({ chars: charsPerLine, lines, sample: text.slice(0, 60), tag: el.tagName.toLowerCase(), el: nameOf(el) })
    if (lines < 2) continue
    const lastText = [...el.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim())
    if (!lastText) continue
    const trimmed = lastText.textContent.trimEnd()
    const idx = trimmed.lastIndexOf(' ')
    if (idx <= 0) continue
    const range = document.createRange()
    range.setStart(lastText, idx + 1)
    range.setEnd(lastText, trimmed.length)
    const wr = range.getBoundingClientRect()
    const pr = document.createRange()
    pr.selectNodeContents(el)
    const rects = [...pr.getClientRects()].filter((x) => Math.abs(x.top - wr.top) < 2).sort((a, b) => a.left - b.left)
    const lineStart = rects[0]
    if (lineStart && Math.abs(lineStart.left - wr.left) < 2 && Math.abs(lineStart.width - wr.width) < 2) {
      orphans.push({ word: trimmed.slice(idx + 1), sample: text.slice(0, 60), tag: el.tagName.toLowerCase(), el: nameOf(el) })
    }
  }

  // Touch targets.
  const interactive = [...document.body.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex="0"]')].filter(vis)
  const small = []
  for (const el of interactive) {
    const r = el.getBoundingClientRect()
    if (r.width < 44 || r.height < 44) {
      // a text link inside prose is exempt (WCAG 2.5.8 inline exception)
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p, li, dd')
      if (inline) continue
      // a checkbox or radio whose wrapping label is itself a 44px target is
      // judged by the label (WCAG 2.5.8 counts the label as the target)
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        const label = el.closest('label')
        if (label) {
          const lr = label.getBoundingClientRect()
          if (lr.width >= 44 && lr.height >= 44) continue
        }
      }
      small.push({ w: Math.round(r.width), h: Math.round(r.height), label: (el.getAttribute('aria-label') || el.innerText || el.tagName).trim().slice(0, 40), el: nameOf(el) })
    }
  }

  // Does any stylesheet carry a dark-scheme rule at all?
  let darkRules = 0
  for (const sheet of document.styleSheets) {
    let list
    try {
      list = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of list) {
      if (rule.media && /prefers-color-scheme\s*:\s*dark/.test(rule.media.mediaText)) darkRules += 1
    }
  }

  return {
    page: { width: pageW, height: pageH },
    fontSizes,
    fontSizeSamples,
    families,
    radii,
    radiiSamples,
    shadows,
    shadowSamples,
    darkRules,
    gold: {
      fillSharePct: Number((((goldFillArea + goldBorderArea) / pageArea) * 100).toFixed(2)),
      textElements: goldTextCount,
      samples: goldSamples,
    },
    lineLengths: {
      max: Math.max(0, ...lineLengths.map((l) => l.chars)),
      over75: lineLengths.filter((l) => l.chars > 75).slice(0, 12),
      count: lineLengths.length,
    },
    orphans: orphans.slice(0, 20),
    orphanCount: orphans.length,
    interactiveCount: interactive.length,
    smallTargets: small.slice(0, 60),
    smallTargetCount: small.length,
  }
}

/* Focus rings: an element passes when programmatic focus changes its outline,
   shadow or border, or when a :focus-visible rule targets it. */
export function focusSampleInPage(limit) {
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const els = [...document.body.querySelectorAll('a[href], button, input, select')].filter(vis).slice(0, limit)
  const rules = []
  // Tailwind nests its utilities under @layer and @media, so walk grouping
  // rules too; a top-level scan misses every focus-visible utility.
  const collect = (list) => {
    for (const rule of list) {
      if (rule.selectorText && rule.selectorText.includes('focus-visible')) rules.push(rule.selectorText)
      if (rule.cssRules) collect(rule.cssRules)
    }
  }
  for (const sheet of document.styleSheets) {
    try {
      collect(sheet.cssRules)
    } catch {
      // a cross-origin sheet
    }
  }
  const missing = []
  for (const el of els) {
    if (el.disabled) continue
    const before = getComputedStyle(el)
    const b = before.outlineStyle + before.outlineWidth + '|' + before.boxShadow + '|' + before.borderColor
    el.focus({ preventScroll: true })
    const after = getComputedStyle(el)
    const a = after.outlineStyle + after.outlineWidth + '|' + after.boxShadow + '|' + after.borderColor
    let ruled = false
    for (const sel of rules) {
      try {
        if (el.matches(sel.replace(/:focus-visible/g, ''))) {
          ruled = true
          break
        }
      } catch {
        // a selector the engine cannot evaluate without the pseudo-class
      }
    }
    if (a === b && !ruled) missing.push((el.getAttribute('aria-label') || el.innerText || el.tagName).trim().slice(0, 40))
    el.blur()
  }
  return { sampled: els.length, missingRing: missing }
}
