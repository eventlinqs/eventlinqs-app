import Link from 'next/link'

/**
 * ComingSoon — simple branded stub rendered inside a SiteHeader/SiteFooter
 * shell. Used for marketing pages whose copy hasn't been written yet so
 * that footer and nav links never 404. Replace each usage with a real
 * page when the content lands.
 */

interface Props {
  title: string
  eyebrow?: string
  blurb?: string
}

export function ComingSoon({ title, eyebrow = 'Coming soon', blurb }: Props) {
  return (
    <section className="flex min-h-[60vh] items-center bg-canvas py-24">
      <div className="mx-auto w-full max-w-2xl px-4 text-center sm:px-6 lg:px-8">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
          {eyebrow}
        </p>
        <h1 className="mt-4 font-display text-4xl font-extrabold text-ink-900 sm:text-5xl">
          {title}
        </h1>
        {blurb ? (
          <p className="mt-5 text-base text-ink-600 sm:text-lg">{blurb}</p>
        ) : null}
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/events"
            className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
          >
            Browse events
          </Link>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-ink-200 px-6 py-3 text-sm font-semibold text-ink-900 transition-colors hover:border-gold-500 hover:text-gold-500"
          >
            Back to home
          </Link>
        </div>
      </div>
    </section>
  )
}
