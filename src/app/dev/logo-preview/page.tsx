import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Logo preview — EventLinqs (dev)',
  robots: { index: false, follow: false },
}

const CONCEPTS = [
  {
    id: 'a',
    name: 'Concept A',
    tagline: 'Gold full stop',
    src: '/logos/eventlinqs-concept-a.svg',
    rationale:
      'Wordmark with a single gold dot after the final S. The most restrained option, reads like a confident full stop and doubles as a brand mark on social avatars and favicons.',
  },
  {
    id: 'b',
    name: 'Concept B',
    tagline: 'Q-tail underscore',
    src: '/logos/eventlinqs-concept-b.svg',
    rationale:
      'Q tail curves into a gold underscore running beneath the last two letters. Gives the wordmark a sense of motion, plays on the link in "Linqs," and is the most ownable shape of the three.',
  },
  {
    id: 'c',
    name: 'Concept C',
    tagline: 'Gold bracket',
    src: '/logos/eventlinqs-concept-c.svg',
    rationale:
      'Heavier, tighter wordmark anchored to a thin gold bracket on the left. Reads as editorial and premium, carries weight at hero sizes, and leaves room for a standalone bracket mark.',
  },
]

const SIZES = [
  { id: 'header',  label: 'Header (20px cap)',   height: 20 },
  { id: 'favicon', label: 'Favicon (32px cap)',  height: 32 },
  { id: 'hero',    label: 'Hero (64px cap)',     height: 64 },
]

type Surface = 'light' | 'dark'

function LogoSwatch({
  src,
  name,
  height,
  surface,
}: {
  src: string
  name: string
  height: number
  surface: Surface
}) {
  const wrapper =
    surface === 'light'
      ? 'bg-white text-ink-900 border-ink-200'
      : 'bg-ink-900 text-white border-ink-900'
  return (
    <div
      className={`flex items-center justify-center rounded-lg border px-6 py-6 ${wrapper}`}
    >
      {/* Plain img used intentionally — SVGs from /public/ render without next/image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${name} on ${surface} surface at ${height}px cap height`}
        style={{ height, width: 'auto' }}
      />
    </div>
  )
}

export default function LogoPreviewPage() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-500">
            Dev preview
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-ink-900 sm:text-4xl">
            EventLinqs logo concepts
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
            Three SVG wordmark concepts rendered at header (20px), favicon (32px),
            and hero (64px) cap heights on both white and ink-900 surfaces.
            Text uses <code className="font-mono text-xs">currentColor</code> so
            each mark inherits the surrounding text colour. Pick one, 2c will wire
            it through the nav and social surfaces.
          </p>
        </header>

        <div className="space-y-10">
          {CONCEPTS.map((concept) => (
            <section
              key={concept.id}
              aria-labelledby={`concept-${concept.id}-heading`}
              className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8"
            >
              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">
                    {concept.tagline}
                  </p>
                  <h2
                    id={`concept-${concept.id}-heading`}
                    className="mt-1 font-display text-xl font-bold text-ink-900"
                  >
                    {concept.name}
                  </h2>
                </div>
                <p className="max-w-lg text-sm leading-relaxed text-ink-600">
                  {concept.rationale}
                </p>
              </div>

              {SIZES.map((size) => (
                <div key={size.id} className="mb-4 last:mb-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">
                    {size.label}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <LogoSwatch
                      src={concept.src}
                      name={concept.name}
                      height={size.height}
                      surface="light"
                    />
                    <LogoSwatch
                      src={concept.src}
                      name={concept.name}
                      height={size.height}
                      surface="dark"
                    />
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-ink-100 pt-6 text-xs text-ink-400">
          This page is internal: noindex + nofollow. Remove from production build
          once the final logo is picked and wired through site-header and
          site-footer.
        </footer>
      </div>
    </div>
  )
}
