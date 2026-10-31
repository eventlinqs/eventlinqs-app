import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { ACTIVATION_WORDS, type ActivationAnswer } from '@/lib/growth/activation'

/**
 * THE ORGANISER'S WAY TO THEIR FIRST SALE (V3 item 6, the CONTROLLER's 05:45 of 1 November 2026). The steps after the
 * email are activationOf's (src/lib/growth/activation.ts), read from the organiser's own records, so this checklist,
 * the funnel and ticketing_activations always agree; it shows until the first paid ticket sells through EventLinqs.
 */
export type ChecklistStatus = {
  verifyEmail: boolean
  activation: ActivationAnswer
}

type Step = {
  key: string
  done: boolean
  label: string
  description: string
  href: string
  cta: string
}

export function GetStartedChecklist({ status }: { status: ChecklistStatus }) {
  const STEPS: Step[] = [
    {
      key: 'verifyEmail',
      done: status.verifyEmail,
      label: 'Verify your email',
      description: 'Confirm your email so we can send you tickets and receipts.',
      href: '/dashboard/organisation',
      cta: 'Resend verification',
    },
    ...status.activation.steps.map((s) => ({ key: s.step, done: s.done, ...ACTIVATION_WORDS[s.step] })),
  ]
  const completed = STEPS.filter((s) => s.done).length
  const total = STEPS.length
  const pct = Math.round((completed / total) * 100)
  const nextStep = STEPS.find((s) => !s.done)

  return (
    <section className="panel-elevated rounded-2xl border border-ink-100 bg-white">
      <header className="border-b border-ink-100 px-5 py-4">
        <h2 className="text-base font-semibold text-ink-900">Set up your account</h2>
        <p className="mt-1 text-xs text-ink-600">
          {completed === total
            ? 'All set. Your first ticket has sold through EventLinqs.'
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
            aria-label={`${completed} of ${total} setup steps complete`}
          />
        </div>
      </header>

      <ul className="divide-y divide-ink-100">
        {STEPS.map((step) => {
          const done = step.done
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
                      // gold-800 (brand-accent-strong): gold text on a light
                      // surface must meet 4.5:1; axe measured gold-600 here as
                      // a serious contrast failure on the C14 before-capture.
                      className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[var(--brand-accent-strong)] transition-colors hover:text-[var(--brand-accent-strong-hover)]"
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
