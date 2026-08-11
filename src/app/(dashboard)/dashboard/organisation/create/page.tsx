import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listOwnedOrganisations } from '@/lib/organisations/scope'
import { OrgCreateForm } from './org-create-form'

/**
 * Create a business. The FIRST one, or the fifth.
 *
 * WHAT THIS PAGE USED TO DO, and it is the reason a second business could not exist.
 * It resolved the caller's organisation with `.eq('owner_id', user.id).single()` and
 * redirected away if it found one. So:
 *
 *   - with exactly ONE organisation, `single()` returned it and the page redirected
 *     to /dashboard/organisation. There was no way, anywhere in the product, to
 *     create a second business.
 *   - with TWO or more, `single()` returned PGRST116 and `data: null`, the redirect
 *     did not fire, and the form rendered. So the product blocked the second
 *     business and then permitted the third, purely as a side effect of a
 *     postgrest error shape.
 *
 * The founder's ruling is that a person may run endless businesses with endless
 * bank accounts, so the redirect is gone. What replaces it is honest framing: the
 * first organisation reads as setting up, an additional one reads as adding another
 * business, and the organiser is told plainly that it gets its own Stripe account
 * and its own payouts, because that is the thing they need to know before they fill
 * the form in.
 */
export default async function CreateOrganisationPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const existing = await listOwnedOrganisations()
  const isFirst = existing.length === 0

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8">
        {!isFirst && (
          <Link
            href="/dashboard/organisation"
            className="text-sm text-ink-400 transition-colors hover:text-ink-600"
          >
            &larr; Your businesses
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-bold text-ink-900">
          {isFirst ? 'Create Your Organisation' : 'Add another business'}
        </h1>
        <p className="mt-2 text-ink-600">
          {isFirst
            ? 'Set up your organisation to start creating and selling event tickets.'
            : `This becomes a separate business alongside your ${existing.length === 1 ? 'existing one' : `${existing.length} existing ones`}. It gets its own Stripe account, its own bank account and its own payouts, and nothing it does affects the others.`}
        </p>
      </div>
      <OrgCreateForm
        userEmail={user.email ?? ''}
        submitLabel={isFirst ? 'Create Organisation' : 'Create business'}
      />
    </div>
  )
}
