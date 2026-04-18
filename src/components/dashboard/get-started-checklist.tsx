import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'

export type ChecklistStatus = {
  verifyEmail: boolean
  createOrganisation: boolean
  connectPayouts: boolean
  publishFirstEvent: boolean
}

type Step = {
  key: keyof ChecklistStatus
  label: string
  description: string
  href: string
  cta: string
}

const STEPS: Step[] = [
  {
    key: 'verifyEmail',
    label: 'Verify your email',
    description: 'Confirm your email so we can send you tickets and receipts.',
    href: '/dashboard/organisation',
    cta: 'Resend verification',
  },
  {
    key: 'createOrganisation',
    label: 'Create your organisation',
    description: 'Add your brand name, logo, and payout details.',
    href: '/dashboard/organisation/create',
    cta: 'Set up organisation',
  },
  {
    key: 'connectPayouts',
    label: 'Connect payouts',
    description: 'Link Stripe so you can get paid out for ticket sales.',
    href: '/dashboard/organisation',
    cta: 'Connect Stripe',
  },
  {
    key: 'publishFirstEvent',
    label: 'Publish your first event',
    description: 'Create an event, set ticket tiers, and go live.',
    href: '/dashboard/events/create',
    cta: 'Create event',
  },
]

export function GetStartedChecklist({ status }: { status: ChecklistStatus }) {
  const completed = STEPS.filter((s) => status[s.key]).length
  const total = STEPS.length
  const pct = Math.round((completed / total) * 100)
  const nextStep = STEPS.find((s) => !status[s.key])

  return (
    <section className="rounded-xl border border-ink-100 bg-white">
      <header className="border-b border-ink-100 px-5 py-4">
        <h2 className="text-base font-semibold text-ink-900">Set up your account</h2>
        <p className="mt-1 text-xs text-ink-600">
          {completed === total
            ? 'All set. You are ready to sell tickets.'
            : `${completed} of ${total} steps complete`}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-gold-500 transition-all"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={total}
          />
        </div>
      </header>

      <ul className="divide-y divide-ink-100">
        {STEPS.map((step) => {
          const done = status[step.key]
          const isNext = !done && nextStep?.key === step.key

          return (
            <li key={step.key} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={[
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    done ? 'border-success bg-success text-white' : 'border-ink-200 bg-white',
                  ].join(' ')}
                >
                  {done && <Check className="h-3 w-3" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      'text-sm font-medium',
                      done ? 'text-ink-400 line-through' : 'text-ink-900',
                    ].join(' ')}
                  >
                    {step.label}
                  </p>
                  {!done && <p className="mt-0.5 text-xs text-ink-600">{step.description}</p>}
                  {isNext && (
                    <Link
                      href={step.href}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gold-600 transition-colors hover:text-gold-500"
                    >
                      {step.cta}
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
