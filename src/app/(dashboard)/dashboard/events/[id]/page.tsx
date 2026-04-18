import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowUpRight,
  Calendar,
  Eye,
  MapPin,
  Pencil,
  TrendingUp,
  Ticket,
  Wallet,
} from 'lucide-react'
import type { Event, EventStatus, TicketTier } from '@/types/database'

type Props = {
  params: Promise<{ id: string }>
}

const STATUS_COPY: Record<EventStatus, { label: string; className: string }> = {
  draft:      { label: 'Draft',      className: 'bg-ink-100 text-ink-600' },
  scheduled:  { label: 'Scheduled',  className: 'bg-gold-100 text-gold-600' },
  published:  { label: 'Live',       className: 'bg-emerald-100 text-emerald-700' },
  paused:     { label: 'Paused',     className: 'bg-amber-100 text-amber-700' },
  postponed:  { label: 'Postponed',  className: 'bg-orange-100 text-orange-700' },
  cancelled:  { label: 'Cancelled',  className: 'bg-rose-100 text-rose-700' },
  completed:  { label: 'Completed',  className: 'bg-purple-100 text-purple-700' },
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency.toUpperCase(),
    currencyDisplay: 'code',
  }).format(cents / 100)
}

function formatEventDate(iso: string, timezone: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

export default async function EventViewPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('*, ticket_tiers(id, name, total_capacity, sold_count, price, currency)')
    .eq('id', id)
    .single() as { data: (Event & { ticket_tiers: TicketTier[] }) | null }

  if (!event) notFound()

  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, slug')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .single()

  if (!org) notFound()

  // Revenue + ticket stats via admin (buyer rows aren't visible to organiser under RLS)
  const { data: orders } = await admin
    .from('orders')
    .select('total_cents, platform_fee_cents, processing_fee_cents, currency, status, order_items(item_type, quantity)')
    .eq('event_id', id)

  const confirmed = (orders ?? []).filter(o =>
    ['confirmed', 'partially_refunded', 'refunded'].includes(o.status)
  )
  const grossCents = confirmed.reduce((s, o) => s + (o.total_cents ?? 0), 0)
  const ticketsSold = confirmed.reduce((s, o) => {
    const items = (o.order_items ?? []) as { item_type: string; quantity: number }[]
    return s + items.filter(i => i.item_type === 'ticket').reduce((ss, i) => ss + i.quantity, 0)
  }, 0)
  const currency = (confirmed[0]?.currency ?? event.ticket_tiers?.[0]?.currency ?? 'AUD') as string
  const totalCapacity = (event.ticket_tiers ?? []).reduce((s, t) => s + (t.total_capacity ?? 0), 0)
  const sellThrough = totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : 0

  const status = STATUS_COPY[event.status] ?? STATUS_COPY.draft
  const coverUrl = event.cover_image_url
  const isPublished = event.status === 'published' || event.status === 'scheduled'

  return (
    <div>
      {/* ─── Breadcrumb ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-2 text-sm text-ink-600">
        <Link href="/dashboard/events" className="hover:text-ink-900">My events</Link>
        <span aria-hidden="true">/</span>
        <span className="truncate text-ink-900">{event.title}</span>
      </div>

      {/* ─── Hero strip ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="relative h-40 w-full bg-ink-900 sm:h-48">
          {coverUrl ? (
            <>
              <Image
                src={coverUrl}
                alt=""
                fill
                className="object-cover opacity-70"
                priority
              />
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(10,22,40,0.15) 0%, rgba(10,22,40,0.85) 100%)',
                }}
              />
            </>
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse 70% 55% at 100% 0%, rgba(232,183,56,0.35) 10%, transparent 55%)',
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-4 border-t border-ink-100 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
              {event.visibility !== 'public' && (
                <span className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium capitalize text-ink-600">
                  {event.visibility}
                </span>
              )}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
              {event.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                {formatEventDate(event.start_date, event.timezone)}
              </span>
              {event.venue_city && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {event.venue_city}
                </span>
              )}
              <span className="text-ink-400">·</span>
              <span>{org.name}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {isPublished && (
              <a
                href={`/events/${event.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                View public page
              </a>
            )}
            <Link
              href={`/dashboard/events/${event.id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit event
            </Link>
          </div>
        </div>
      </section>

      {/* ─── KPI row ────────────────────────────────────────────────────── */}
      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<Ticket className="h-4 w-4" aria-hidden="true" />}
          label="Tickets sold"
          value={ticketsSold.toLocaleString()}
          hint={totalCapacity > 0 ? `of ${totalCapacity.toLocaleString()} (${sellThrough}%)` : 'No capacity set'}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          label="Revenue"
          value={formatMoney(grossCents, currency)}
          hint={`${confirmed.length} confirmed order${confirmed.length === 1 ? '' : 's'}`}
        />
        <KpiCard
          icon={<Eye className="h-4 w-4" aria-hidden="true" />}
          label="Page views"
          value="—"
          hint="Wiring up in M5"
          dim
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          label="Conversion"
          value="—"
          hint="Wiring up in M5"
          dim
        />
      </section>

      {/* ─── Tabs ───────────────────────────────────────────────────────── */}
      <nav aria-label="Event sections" className="mt-8 border-b border-ink-100">
        <ul className="-mb-px flex flex-wrap gap-1">
          <TabLink href={`/dashboard/events/${event.id}`} active>Overview</TabLink>
          <TabLink href={`/dashboard/events/${event.id}/orders`}>Orders</TabLink>
          <TabLink href={`/dashboard/events/${event.id}/orders#attendees`}>Attendees</TabLink>
          <TabLink href={`/dashboard/events/${event.id}/edit`}>Settings</TabLink>
        </ul>
      </nav>

      {/* ─── Overview tab body ──────────────────────────────────────────── */}
      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-ink-100 bg-white p-6">
            <h2 className="text-base font-semibold text-ink-900">About this event</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-600">
              {event.summary || event.description || 'No description yet. Edit the event to add one.'}
            </p>
          </div>

          <div className="rounded-xl border border-ink-100 bg-white">
            <header className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <h2 className="text-base font-semibold text-ink-900">Ticket tiers</h2>
              <Link
                href={`/dashboard/events/${event.id}/edit`}
                className="text-sm font-medium text-ink-600 transition-colors hover:text-gold-600"
              >
                Manage tiers
              </Link>
            </header>
            {event.ticket_tiers && event.ticket_tiers.length > 0 ? (
              <ul className="divide-y divide-ink-100">
                {event.ticket_tiers.map(tier => {
                  const pct = tier.total_capacity > 0
                    ? Math.min(100, Math.round((tier.sold_count / tier.total_capacity) * 100))
                    : 0
                  return (
                    <li key={tier.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{tier.name}</p>
                        <p className="text-xs text-ink-600">
                          {tier.price === 0 ? 'Free' : formatMoney(tier.price, tier.currency)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="h-full rounded-full bg-gold-500"
                            style={{ width: `${pct}%` }}
                            role="progressbar"
                            aria-valuenow={tier.sold_count}
                            aria-valuemin={0}
                            aria-valuemax={tier.total_capacity}
                            aria-label={`${pct}% sold`}
                          />
                        </div>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-ink-600">
                          {tier.sold_count}/{tier.total_capacity || '—'}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-ink-600">No ticket tiers yet.</p>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-ink-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-ink-900">Share this event</h3>
            <p className="mt-1 text-xs text-ink-600">
              Copy the public URL for your audience once you are ready.
            </p>
            <div className="mt-3 rounded-lg border border-ink-100 bg-canvas px-3 py-2 text-xs text-ink-600">
              <span className="block truncate">eventlinqs.com/events/{event.slug}</span>
            </div>
            {isPublished ? (
              <a
                href={`/events/${event.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100"
              >
                Open public page
              </a>
            ) : (
              <p className="mt-3 text-xs text-ink-400">
                Publish the event to make the public URL live.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-ink-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-ink-900">Quick actions</h3>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href={`/dashboard/events/${event.id}/orders`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-ink-200 bg-white text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100"
              >
                View orders
              </Link>
              <Link
                href={`/dashboard/events/${event.id}/discounts`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-ink-200 bg-white text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100"
              >
                Discount codes
              </Link>
              <Link
                href={`/dashboard/events/${event.id}/edit`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-ink-200 bg-white text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100"
              >
                Edit event
              </Link>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  dim,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  dim?: boolean
}) {
  return (
    <div className={`rounded-xl border border-ink-100 bg-white p-5 ${dim ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-600">
        <span className="text-ink-400">{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={[
          'inline-flex h-10 items-center rounded-t-lg px-4 text-sm font-medium transition-colors',
          active
            ? 'border-b-2 border-gold-500 text-ink-900'
            : 'text-ink-600 hover:text-ink-900',
        ].join(' ')}
      >
        {children}
      </Link>
    </li>
  )
}
