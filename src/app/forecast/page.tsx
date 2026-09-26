import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { HeroMedia } from '@/components/media/HeroMedia'
import { FORECAST_HERO } from '@/lib/images/forecast-photos'
import { HERO_SCRIM_GRADIENT } from '@/components/features/home/hero-scrim'
import { ContentSection } from '@/components/layout/ContentSection'
import { forecast } from '@/lib/forecast/arithmetic'
import { METHOD_SENTENCE, methodOf, methodSentence } from '@/lib/forecast/method'
import { readForecastOptions } from '@/lib/forecast/read'
import {
  EMAIL_CONSENT_TEXT,
  FOUNDING_FIGURE_LABEL,
  FOUNDING_SENTENCE,
  feeSentence,
  centsAsFormDollars,
  countAsFormValue,
  presentBreakEven,
  presentScenarios,
} from '@/lib/forecast/present'
import { forecastSignupPath } from '@/lib/growth/loops'
import { runForecast } from './actions'
import {
  feePassTypeFrom,
  flagIsSet,
  one,
  positiveInteger,
  type QueryValue,
} from '@/lib/forecast/params'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Event forecast | EventLinqs',
  description:
    'Work out how many tickets your event has to sell to cover its costs, and what you keep at a quarter, half and a full room. Free, no account, and the arithmetic is shown.',
  alternates: { canonical: '/forecast' },
  openGraph: {
    title: 'Event forecast | EventLinqs',
    description:
      'How many tickets does your event have to sell to break even, and what do you keep. Free, no account.',
    url: '/forecast',
    type: 'website',
    images: ['/opengraph-image'],
  },
}

/**
 * THE FREE FORECAST, AND THE HONEST ARITHMETIC IT STARTS WITH.
 *
 * Close-out FT1. Every organiser asks the same question before they will trust
 * a platform: how many will I sell, and will I make money. This answers the
 * half of it that can be answered honestly on day zero, says in plain words
 * that it is arithmetic and not a prediction, and says what it becomes when
 * there is something to measure.
 *
 * THE ORDER IS THE ITEM'S ORDER AND IT IS NOT A STYLE CHOICE. Break even first,
 * because it is pure arithmetic and the most useful number on the page. Then
 * the scenarios. Then the fee on each, with the Founding figure beside it. The
 * ONE call to action sits UNDER the result and nowhere above it, because a tool
 * that asks for the signup before it has given the answer is an advertisement
 * with a calculator on it.
 *
 * IT RENDERS ON THE SERVER AND SHIPS NO CALCULATOR. The result lives on the
 * query string, so it is shareable, survives a back button and costs a
 * marketing page nothing in JavaScript. The submit is a server action, because
 * a run has to be STORED and a render must not be.
 *
 * NOTHING ON THIS PAGE IS TYPED. Every fee, every rate and every list comes
 * from `readForecastOptions`, every figure from the pure arithmetic, and every
 * string from `present.ts`. That is what the registered guard checks.
 */

type Props = { searchParams: Promise<Record<string, QueryValue>> }

export default async function ForecastPage({ searchParams }: Props) {
  const params = await searchParams
  const options = await readForecastOptions()

  const capacity = positiveInteger(params.capacity)
  const ticketPriceCents = positiveInteger(params.price)
  const costsCents = positiveInteger(params.costs)
  const daysUntilEvent = positiveInteger(params.days)
  const feePassType = feePassTypeFrom(params.fee)
  const eventType = one(params.eventType)
  const citySlug = one(params.city)
  const ranBefore = one(params.ranBefore)
  const emailWasSent = flagIsSet(params.sent)
  const wasRateLimited = flagIsSet(params.busy)

  const hasResult = capacity > 0 && ticketPriceCents > 0
  const result = hasResult
    ? forecast({ capacity, ticketPriceCents, costsCents, daysUntilEvent, feePassType }, options.rates)
    : null

  const breakEven = result ? presentBreakEven(result.breakEven, capacity, options.currency) : null
  const scenarios = result ? presentScenarios(result, options.currency) : []
  const sentence = result ? methodSentence(methodOf(result)) : METHOD_SENTENCE.arithmetic

  return (
    <PageShell>
      {/*
        A PHOTOGRAPHIC HERO, because Law 4 makes a text-only marketing surface a
        defect by definition and this page sells the platform as much as it
        serves an organiser. Marketing tier, `hero-marketing`, the one platform
        hero scale; the same bottom-up navy scrim, gold eyebrow and display
        scale as every other hero. The image is the one priority raster on the
        page and owns the LCP, so it never animates.
      */}
      <section aria-labelledby="forecast-hero-heading" className="relative overflow-hidden">
        <div className="hero-marketing relative w-full">
          <HeroMedia
            image={FORECAST_HERO.src}
            alt={FORECAST_HERO.alt}
            objectPosition={FORECAST_HERO.objectPosition}
            priority
          />
          {/*
            THE ONE HERO SCRIM, imported rather than copied. It is the measured
            one (close-out C17.4): its stops were chosen by compositing every
            curated raster at the real drive geometry so the headline and the
            subline clear 4.5 to 1 at 390, 768 and 1440. Every other copy of a
            navy wash in this tree is a weaker gradient somebody typed, and a
            scrim tuned in one place and copied to another is how the C3 scrim
            defect happened.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: HERO_SCRIM_GRADIENT }}
          />
          <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-8 pt-20 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12">
            <div className="hero-enter max-w-2xl">
              <p
                className="type-micro font-display font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]"
              >
                Free tool, no account
              </p>
              <h1
                id="forecast-hero-heading"
                className="mt-2 font-headline text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl"
              >
                What does your event have to sell?
              </h1>
              <p className="mt-3 max-w-xl text-sm text-white/85 sm:text-base">
                Tell us the room, the price and what the night costs you. We will tell you the
                number of tickets that covers it, and what you keep if you fill a quarter, half or
                all of it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ContentSection surface="base" width="prose">
        {/* THE METHOD SENTENCE, ALWAYS VISIBLE AND NEVER IN SMALL PRINT (FT1.4).
            It sits ABOVE the form as well as beside the result, because the
            honest thing is to say what this is before somebody types into it. */}
        <p
          data-forecast="method"
          className="rounded-xl border border-ink-200 bg-white px-5 py-4 text-sm leading-relaxed text-ink-700"
        >
          {sentence}
        </p>

        {wasRateLimited && (
          <p role="status" className="mt-4 rounded-xl border border-gold-400/40 bg-gold-100/50 px-5 py-4 text-sm text-ink-700">
            That is a lot of forecasts in a short time. Give it a minute and try again.
          </p>
        )}

        <form action={runForecast} className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900">
            What kind of event
            <select
              name="eventType"
              defaultValue={eventType ?? ''}
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            >
              <option value="">Not sure yet</option>
              {options.eventTypes.map(type => (
                <option key={type.slug} value={type.slug}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900">
            Where
            <select
              name="city"
              defaultValue={citySlug ?? ''}
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            >
              <option value="">Not sure yet</option>
              {options.cities.map(city => (
                <option key={city.slug} value={city.slug}>
                  {city.name}, {city.state}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900">
            How many the room holds
            <input
              name="capacity"
              inputMode="numeric"
              required
              defaultValue={countAsFormValue(capacity)}
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900">
            Ticket price
            <input
              name="price"
              inputMode="decimal"
              required
              defaultValue={centsAsFormDollars(ticketPriceCents)}
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900">
            What the night costs you
            <input
              name="costs"
              inputMode="decimal"
              defaultValue={centsAsFormDollars(costsCents)}
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900">
            Days until the event
            <input
              name="days"
              inputMode="numeric"
              defaultValue={countAsFormValue(daysUntilEvent)}
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900">
            Who pays the fee
            <select
              name="feePassType"
              defaultValue={feePassType}
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            >
              <option value="pass_to_buyer">The buyer, on top of the ticket</option>
              <option value="absorb">Me, out of what I keep</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900">
            Have you run an event before
            <select
              name="ranBefore"
              defaultValue={ranBefore ?? ''}
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            >
              <option value="">Rather not say</option>
              <option value="yes">Yes</option>
              <option value="no">This is my first</option>
            </select>
          </label>

          {/* THE OPTIONAL ADDRESS (FT1.7). No email is required to see the
              result, and the wording somebody agrees to is stored with it. */}
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink-900 sm:col-span-2">
            Send me this result (optional)
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900"
            />
            <span className="text-xs font-normal leading-relaxed text-ink-600">{EMAIL_CONSENT_TEXT}</span>
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gold-400 px-6 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
            >
              Work it out
            </button>
          </div>
        </form>
      </ContentSection>

      {result && breakEven && (
        <ContentSection surface="alt" width="prose" id="result">
          {emailWasSent && (
            <p role="status" className="mb-6 rounded-xl border border-ink-200 bg-white px-5 py-4 text-sm text-ink-700">
              We have your address and this result. Somebody will answer it by hand, once.
            </p>
          )}

          {/* 1. BREAK EVEN, first, because it is the most useful number here. */}
          <p className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-500">To cover your costs</p>
          <p
            data-forecast="break-even"
            className="mt-2 font-display text-4xl font-bold leading-none tracking-tight text-ink-900 sm:text-5xl"
          >
            {breakEven.headline}
          </p>
          {breakEven.perDay && <p className="mt-3 text-sm text-ink-600">{breakEven.perDay}</p>}
          {breakEven.beyondTheRoomSentence && (
            <p className="mt-3 rounded-lg border border-gold-400/40 bg-gold-100/50 px-4 py-3 text-sm text-ink-800">
              {breakEven.beyondTheRoomSentence}
            </p>
          )}
          <p className="mt-3 text-sm text-ink-600">
            Each ticket leaves you {breakEven.keepsPerTicket} before your costs.
          </p>

          {/* 2. THE RANGE, as stated fractions of their own room. */}
          <div className="mt-10 space-y-4">
            <p className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-500">If you fill</p>
            {scenarios.map(scenario => (
              <div
                key={scenario.key}
                data-forecast="scenario"
                className="rounded-xl border border-ink-200 bg-white p-5"
              >
                <p className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-ink-900">{scenario.label}</span>
                  <span className="font-display text-lg text-ink-900">{scenario.tickets} tickets</span>
                </p>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-600">Tickets sold</dt>
                    <dd className="text-ink-900">{scenario.gross}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-600">EventLinqs fee</dt>
                    <dd className="text-ink-900">{scenario.fee}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-600">{FOUNDING_FIGURE_LABEL}</dt>
                    <dd className="text-ink-900">{scenario.foundingFee}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-600">You keep, after your costs</dt>
                    <dd className="font-semibold text-ink-900">{scenario.keeps}</dd>
                  </div>
                </dl>
                {scenario.perDay && <p className="mt-3 text-xs text-ink-500">{scenario.perDay}</p>}
              </div>
            ))}
          </div>

          {/* 3. WHERE THE FEE FIGURES CAME FROM. */}
          <p className="mt-8 text-sm leading-relaxed text-ink-600">
            {feeSentence(options.rates.platformFeePercent, options.rates.platformFeeFixedCents, options.currency)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">{FOUNDING_SENTENCE}</p>

          <p data-forecast="method-result" className="mt-6 text-sm leading-relaxed text-ink-700">
            {sentence}
          </p>

          {/* THE ONE CALL TO ACTION, UNDER THE RESULT AND NOWHERE ABOVE IT. */}
          <div data-forecast="cta" className="mt-10 rounded-xl border border-gold-400/40 bg-gold-100/50 p-6 text-center">
            <p className="text-sm font-semibold text-ink-900">Put this event on EventLinqs</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-600">
              We will carry what you just typed into the event form, so you do not type it twice.
            </p>
            <Link
              href={forecastSignupPath({
                categoryId: eventType,
                city: citySlug,
                capacity,
                priceCents: ticketPriceCents,
              })}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gold-400 px-6 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
            >
              Publish this event
            </Link>
          </div>
        </ContentSection>
      )}
    </PageShell>
  )
}
