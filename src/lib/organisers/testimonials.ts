/**
 * Organiser testimonials - the content slot for the organiser landing.
 *
 * HONESTY LAW: this array ships EMPTY until real organisers say real things.
 * The testimonials band renders nothing while the array is empty, which is the
 * honest state for a pre-launch platform. Never seed this file with invented
 * quotes, names, or organisations: a fabricated testimonial is a consumer-law
 * breach, not placeholder copy. When a real quote arrives, add it here with
 * the organiser's written permission and it appears on the page with no
 * template change.
 */
export interface OrganiserTestimonial {
  quote: string
  name: string
  role: string
  organisation: string
  /** Optional path to a permitted headshot in the licensed library. */
  photoSrc?: string
}

export const ORGANISER_TESTIMONIALS: OrganiserTestimonial[] = []
