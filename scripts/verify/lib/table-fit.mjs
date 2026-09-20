/**
 * WHAT A DATA TABLE DOES TO A PERSON HOLDING A PHONE, MEASURED IN THE PAGE.
 *
 * Extracted from scripts/verify/organiser-tables-fit-drive.mjs on 21 September
 * 2026, when a second drive needed the identical measurement for the admin
 * tables. Two copies of a measurement is two answers to the same question, and
 * the one that matters here is subtle enough to get wrong twice: whether a
 * control can be REACHED is not whether it is visible, and `overflow: hidden`
 * still scrolls programmatically while no finger can move it.
 *
 * Both functions are passed to `locator.evaluate`, so they run in the browser
 * and take the `<table>` element. They return FACTS, never verdicts: the
 * clauses are judged by the caller, where they can be read beside the numbers
 * that produced them.
 */

/**
 * THE MEASUREMENT, RUN INSIDE THE PAGE ON ONE TABLE.
 *
 * Passed to `locator.evaluate`, so `el` is the `<table>` itself and every
 * number below is read off the live layout rather than computed from a class
 * name. It returns FACTS, not verdicts: the clauses are judged outside, where
 * they can be read beside the numbers that produced them.
 */
export function measureTable(el) {
  const round = (n) => Math.round(n)
  const tableBox = el.getBoundingClientRect()

  // Every ancestor between the table and the document, with what it does to
  // anything wider than itself.
  const ancestors = []
  let node = el.parentElement
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node)
    const box = node.getBoundingClientRect()
    ancestors.push({
      tag: node.tagName.toLowerCase(),
      overflowX: style.overflowX,
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      left: round(box.left),
      right: round(box.right),
      // `auto` and `scroll` are the only two a finger can move. `hidden` and
      // `clip` scroll programmatically and not by any gesture, which is the
      // whole reason this distinction is recorded rather than assumed.
      userScrollable: style.overflowX === 'auto' || style.overflowX === 'scroll',
      clips: style.overflowX === 'hidden' || style.overflowX === 'clip',
    })
    node = node.parentElement
  }

  // CLAUSE 2's subject: a clipping ancestor narrower than what it holds.
  const clipped = ancestors.filter((a) => a.clips && a.scrollWidth > a.clientWidth + 1)

  // CLAUSE 3 and 5's subject: the controls, at the arrival scroll position.
  /*
   * THE WALK STOPS AT THE FIRST BOX A FINGER CAN MOVE, AND THE FIRST VERSION
   * DID NOT, WHICH MADE IT ACCUSE SEVEN ADMIN SCREENS OF A DEFECT THEY DO NOT
   * HAVE.
   *
   * Measured 21 September 2026 on /admin/events at 390: Pause, Cancel and
   * Archive were reported unreachable because they sat at x 762 and `body` is
   * `overflow-x: hidden` at 0..390. But the control lives inside a wrapper
   * that IS `overflow-x: auto`, so a thumb swipes it into view and the body's
   * clip never comes into it. The walk was finding a clipping ancestor OUTSIDE
   * the scroller and reporting it.
   *
   * That mattered more than a wrong line in a report: the fix it implied was
   * rebuilding seventeen admin tables, and only one of them is really clipped.
   *
   * So: the moment an ancestor is user-scrollable, the control is reachable
   * and the walk ends. `hidden` and `clip` outside a scroller cannot take away
   * what the scroller gives.
   */
  const controls = [...el.querySelectorAll('a, button')].map((c) => {
    const box = c.getBoundingClientRect()
    let outsideOf = null
    let parent = c.parentElement
    while (parent && parent !== document.documentElement) {
      const style = getComputedStyle(parent)
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        parent.scrollWidth > parent.clientWidth + 1
      ) {
        break
      }
      if (style.overflowX === 'hidden' || style.overflowX === 'clip') {
        const pb = parent.getBoundingClientRect()
        if (box.right > pb.right + 1 || box.left < pb.left - 1) {
          outsideOf = `${parent.tagName.toLowerCase()} ${round(pb.left)}..${round(pb.right)}`
          break
        }
      }
      parent = parent.parentElement
    }
    return {
      label: (c.textContent ?? '').trim().slice(0, 24),
      width: round(box.width),
      height: round(box.height),
      left: round(box.left),
      right: round(box.right),
      unreachable: outsideOf,
    }
  })

  return {
    table: { width: round(tableBox.width), scrollWidth: el.scrollWidth },
    ancestors,
    clipped,
    controls,
  }
}

/**
 * CLAUSE 4, RUN AS A GESTURE RATHER THAN AS A CALCULATION.
 *
 * Finds the nearest ancestor a thumb could swipe, pushes it to its right edge,
 * and reports where the first cell of the first data row ended up. A table
 * with nothing to scroll returns `scrolled: false` and passes, which is the
 * correct answer and not a skipped check.
 */
export function scrollRightAndReadTheRowName(el) {
  const round = (n) => Math.round(n)
  let scroller = null
  let node = el.parentElement
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node)
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) {
      scroller = node
      break
    }
    node = node.parentElement
  }
  /*
   * THE FIRST DATA CELL, NOT THE FIRST CELL. A single cell spanning the whole
   * table is an empty state or a footer note, and measuring where "No open
   * disputes. Chargebacks ra..." ends up is a fault nobody can fix.
   */
  const firstCell = [...el.querySelectorAll('tbody tr')]
    .map((r) => [...r.querySelectorAll('td')])
    .filter((cells) => cells.length > 0 && !(cells.length === 1 && Number(cells[0].getAttribute('colspan') ?? '1') > 1))
    .map((cells) => cells[0])[0]
  if (!firstCell) return { scrolled: false, reason: 'no data cell' }
  if (!scroller) {
    const box = firstCell.getBoundingClientRect()
    return {
      scrolled: false,
      name: (firstCell.textContent ?? '').trim().slice(0, 32),
      left: round(box.left),
      right: round(box.right),
      onScreen: box.left >= -1 && box.right <= window.innerWidth + 1,
    }
  }
  scroller.scrollLeft = scroller.scrollWidth
  const box = firstCell.getBoundingClientRect()
  const sb = scroller.getBoundingClientRect()
  return {
    scrolled: true,
    scrollLeft: round(scroller.scrollLeft),
    name: (firstCell.textContent ?? '').trim().slice(0, 32),
    left: round(box.left),
    right: round(box.right),
    // WHOLE, not overlapping. See the clause 4 note in this file's header.
    onScreen: box.left >= sb.left - 1 && box.right <= sb.right + 1,
  }
}
