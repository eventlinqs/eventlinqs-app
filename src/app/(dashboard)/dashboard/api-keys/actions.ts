'use server'

import { revalidatePath } from 'next/cache'
import { resolveOrganisationScope } from '@/lib/organisations/scope'
import { listApiKeys, mintApiKey, revokeApiKey, type OrganiserApiKeyRecord } from '@/lib/api/v1/keys'

/**
 * API1. THE TWO WRITES BEHIND THE KEY SCREEN.
 *
 * Both begin with `resolveOrganisationScope`, which establishes identity from
 * the session and then verifies that this person OWNS the organisation being
 * named. An organisation id arriving in a form field is a request, never an
 * authority: a uuid that is not in the caller's own list is refused here, and
 * `revokeApiKey` carries the organisation into its `where` clause as well, so
 * even a mistake in this file could not reach another owner's key.
 *
 * THE PLAIN TOKEN CROSSES THIS BOUNDARY EXACTLY ONCE. `mintApiKey` returns it,
 * this action hands it to the screen in the action result, and it is never
 * stored, never logged and never sent again. Everything afterwards works from
 * the prefix.
 */

export type ApiKeyActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'created'; token: string; record: OrganiserApiKeyRecord }
  | { status: 'revoked'; keyId: string }

const REFUSALS: Record<string, string> = {
  unauthenticated: 'Sign in again to manage API keys.',
  no_organisation: 'Create an organisation before you create an API key.',
  not_your_organisation: 'That organisation is not yours.',
}

export async function createApiKeyAction(
  _previous: ApiKeyActionState,
  formData: FormData,
): Promise<ApiKeyActionState> {
  const organisationId = String(formData.get('organisationId') ?? '')
  const scope = await resolveOrganisationScope(organisationId || undefined)
  if (!scope.ok) return { status: 'error', message: REFUSALS[scope.reason] ?? 'That request was refused.' }

  const name = String(formData.get('name') ?? '').trim()
  if (name.length === 0) return { status: 'error', message: 'Give the key a name so you can tell it from the next one.' }
  if (name.length > 80) return { status: 'error', message: 'Keep the name to 80 characters or fewer.' }

  const existing = await listApiKeys(scope.active.id)
  /*
   * A CEILING ON LIVE KEYS, and the reason is operational rather than technical.
   * Ten is far more integrations than any organiser runs, and a screen with
   * forty rows on it is a screen nobody audits, which is exactly when a
   * forgotten key stays live. Revoked keys do not count against it: the history
   * is worth keeping and costs nothing.
   */
  if (existing.filter((k) => k.revokedAt === null).length >= 10) {
    return { status: 'error', message: 'You have ten active keys. Revoke one before you create another.' }
  }

  const minted = await mintApiKey({ organisationId: scope.active.id, name, createdBy: scope.userId })
  if (!minted.ok) return { status: 'error', message: 'The key could not be created. Try again in a moment.' }

  revalidatePath('/dashboard/api-keys')
  return { status: 'created', token: minted.token, record: minted.record }
}

export async function revokeApiKeyAction(
  _previous: ApiKeyActionState,
  formData: FormData,
): Promise<ApiKeyActionState> {
  const organisationId = String(formData.get('organisationId') ?? '')
  const scope = await resolveOrganisationScope(organisationId || undefined)
  if (!scope.ok) return { status: 'error', message: REFUSALS[scope.reason] ?? 'That request was refused.' }

  const keyId = String(formData.get('keyId') ?? '')
  if (!keyId) return { status: 'error', message: 'That key could not be found.' }

  const revoked = await revokeApiKey({ organisationId: scope.active.id, keyId, revokedBy: scope.userId })
  if (!revoked.ok) return { status: 'error', message: 'That key is already revoked, or it is not yours.' }

  revalidatePath('/dashboard/api-keys')
  return { status: 'revoked', keyId }
}
