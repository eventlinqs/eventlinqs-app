import { permanentRedirect } from 'next/navigation'

/**
 * /for-organisers - permanent redirect to /organisers.
 *
 * /for-organisers is a natural path users and external links reach for,
 * but the only real organiser landing is /organisers, so /for-organisers
 * returned a hard 404. Redirect permanently (308) so the link works and
 * search engines consolidate on the canonical /organisers URL.
 */
export default function ForOrganisersRedirect(): never {
  permanentRedirect('/organisers')
}
