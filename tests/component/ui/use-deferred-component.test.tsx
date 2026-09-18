// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useDeferredComponent } from '@/components/ui/use-deferred-component'

/**
 * THE HOOK THAT REPLACED `next/dynamic` IN THE PLATFORM CHROME.
 *
 * WHY THIS FILE EXISTS. `useDeferredComponent` is now the only thing standing
 * between an interaction and two pieces of header chrome, on effectively every
 * route. It replaced `dynamic()`, which is a maintained library with its own
 * tests, with about fifteen lines of this repository's own code, and the whole
 * justification for that swap is 1306 bytes gzip. A saving of 1306 bytes that
 * breaks the city picker is not a saving.
 *
 * WHAT IS ACTUALLY AT RISK, which is what these tests are aimed at. The bytes
 * are measured elsewhere (`scripts/perf/first-load-budget.mjs`) and the source
 * shape is held elsewhere (`scripts/guards/no-loadable-in-platform-chrome.mjs`).
 * Neither can see the three ways a hand-rolled version of this goes wrong:
 *
 *   1. it fetches when it should not, which is the reduction undone
 *   2. it refetches on every render, because callers pass an inline arrow and
 *      an inline arrow is a new identity each time
 *   3. it lets a stale in-flight load overwrite a newer one, because nothing
 *      marks the superseded run dead
 *
 * Each of those has a test below, and each was drilled by breaking the hook and
 * watching that test, and only that test, go red.
 *
 * ONE OF THOSE DRILLS FAILED TO GO RED FIRST TIME, and the test it exposed is
 * gone rather than kept. See the note on the race test below: the unmount
 * formulation of clause 3 passed with the cancellation deleted, because React
 * 19 no longer warns about a setState on an unmounted component.
 *
 * THE FUNCTIONAL-SETTER TEST IS THE SUBTLE ONE. `setComponent(resolved)` and
 * `setComponent(() => resolved)` differ only when the value IS a function, and
 * the value here is always a function, because it is a component. The first
 * form makes React call the component as a state updater, with the previous
 * state as its props. It does not throw; it silently stores whatever the
 * component returns. `renders_the_component_not_its_return_value` fails on that
 * mistake and passes on the correct form.
 */

afterEach(cleanup)

/** A component distinguishable from anything React might produce by accident. */
function Panel({ label = 'panel' }: { label?: string }) {
  return <div data-testid="panel">{label}</div>
}

/**
 * A caller shaped exactly like the real ones: an `armed` flag the user flips,
 * an inline arrow for the loader, and a null-until-loaded render.
 */
function Harness({
  load,
  startArmed = false,
}: {
  load: () => Promise<typeof Panel>
  startArmed?: boolean
}) {
  const [armed, setArmed] = useState(startArmed)
  const [, forceRender] = useState(0)
  const Deferred = useDeferredComponent(armed, () => load())
  // react-hooks/static-components reads `Deferred` as a component built during
  // render, and the harm it names - that such a component resets its state each
  // time it is created - cannot happen here: the hook holds the component in
  // useState, so the identity is the module's own export and is stable for the
  // life of the mount. The rule does not fire on either PRODUCTION call site,
  // because it loses the type through `import('./x').then(m => m.X)`; it fires
  // here only because these harnesses hand it a statically known component.
  // Suppressed at the three lines that render it, never at file or rule level.
  // eslint-disable-next-line react-hooks/static-components
  const panel = Deferred ? <Deferred /> : null

  return (
    <>
      <button type="button" onClick={() => setArmed(true)}>
        arm
      </button>
      <button type="button" onClick={() => forceRender(n => n + 1)}>
        rerender
      </button>
      {panel}
    </>
  )
}

describe('useDeferredComponent', () => {
  test('renders nothing, and fetches nothing, while it is unarmed', () => {
    const load = vi.fn(async () => Panel)
    render(<Harness load={load} />)

    expect(screen.queryByTestId('panel')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  test('fetches once armed and then renders the component', async () => {
    const load = vi.fn(async () => Panel)
    render(<Harness load={load} startArmed />)

    await waitFor(() => expect(screen.getByTestId('panel')).toBeTruthy())
    expect(load).toHaveBeenCalledTimes(1)
  })

  test('renders the component, not its return value', async () => {
    // The functional-setter check. With `setComponent(resolved)` React calls
    // Panel as an updater, stores the <div> element it returns, and the render
    // below puts an object where a component belongs.
    const load = vi.fn(async () => Panel)
    render(<Harness load={load} startArmed />)

    const panel = await screen.findByTestId('panel')
    expect(panel.textContent).toBe('panel')
  })

  test('is null for at least one tick after arming, which is what makes it a split', async () => {
    // The assertion that tells a deferred import from a resolved static one. A
    // static import is in the DOM in the same tick; a promise cannot be,
    // whatever the module registry has already cached.
    const load = vi.fn(async () => Panel)
    render(<Harness load={load} startArmed />)

    expect(screen.queryByTestId('panel')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('panel')).toBeTruthy())
  })

  test('does not refetch when the caller re-renders with a fresh arrow identity', async () => {
    // `Harness` passes `() => load()`, a new function on every render, exactly
    // as the real callers do. If `load` were an effect dependency this would
    // fetch again on each of the three re-renders below.
    const load = vi.fn(async () => Panel)
    render(<Harness load={load} startArmed />)
    await screen.findByTestId('panel')

    const rerender = screen.getByText('rerender')
    for (let i = 0; i < 3; i++) act(() => rerender.click())

    expect(load).toHaveBeenCalledTimes(1)
  })

  test('arming a second time does not fetch a second time', async () => {
    const load = vi.fn(async () => Panel)
    render(<Harness load={load} />)

    const arm = screen.getByText('arm')
    act(() => arm.click())
    await screen.findByTestId('panel')
    act(() => arm.click())

    expect(load).toHaveBeenCalledTimes(1)
  })

  test('a slow earlier load cannot overwrite a faster later one', async () => {
    // THE CANCELLATION HALF, AND THIS FORMULATION IS THE SECOND ATTEMPT.
    //
    // The obvious test is to unmount mid-flight and assert React logged no
    // "setState on an unmounted component" warning. That test was written, and
    // it PASSED with the cancellation deleted: React 19 removed that warning, so
    // the assertion could not fail and proved nothing. It was replaced rather
    // than kept, because a green test that cannot go red is worse than no test.
    //
    // What cancellation actually buys is this race. The effect re-runs when
    // `armed` changes, its cleanup marks the first run stale, and the first
    // load then resolves LAST. Without `cancelled` the stale result wins and the
    // hook ends up showing a component the caller has already moved on from.
    const First = () => <div data-testid="panel">first</div>
    const Second = () => <div data-testid="panel">second</div>

    let resolveFirst!: (c: typeof First) => void
    const first = new Promise<typeof First>(r => {
      resolveFirst = r
    })

    let call = 0
    const load = () => (call++ === 0 ? first : Promise.resolve(Second))

    function Racer() {
      const [armed, setArmed] = useState(true)
      const Deferred = useDeferredComponent(armed, load)
      // eslint-disable-next-line react-hooks/static-components
      const panel = Deferred ? <Deferred /> : null
      return (
        <>
          <button type="button" onClick={() => setArmed(false)}>
            disarm
          </button>
          <button type="button" onClick={() => setArmed(true)}>
            rearm
          </button>
          {panel}
        </>
      )
    }

    render(<Racer />)
    // Cleanup of run 1, then run 2, which resolves immediately.
    act(() => screen.getByText('disarm').click())
    act(() => screen.getByText('rearm').click())
    await waitFor(() => expect(screen.getByTestId('panel').textContent).toBe('second'))

    // Now the stale first load lands.
    await act(async () => {
      resolveFirst(First)
      await first
    })

    expect(screen.getByTestId('panel').textContent).toBe('second')
  })

  test('keeps the component once loaded, even if the caller disarms', async () => {
    // `armed` never goes back to false in the real callers, but the hook
    // promises this anyway, because the promise is what makes every open after
    // the first synchronous.
    function Disarming({ load }: { load: () => Promise<typeof Panel> }) {
      const [armed, setArmed] = useState(true)
      const Deferred = useDeferredComponent(armed, load)
      // eslint-disable-next-line react-hooks/static-components
      const panel = Deferred ? <Deferred /> : null
      return (
        <>
          <button type="button" onClick={() => setArmed(false)}>
            disarm
          </button>
          {panel}
        </>
      )
    }

    const load = vi.fn(async () => Panel)
    render(<Disarming load={load} />)
    await screen.findByTestId('panel')

    act(() => screen.getByText('disarm').click())

    expect(screen.getByTestId('panel')).toBeTruthy()
  })
})
