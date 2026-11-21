import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ContactForm } from '@/components/features/contact/ContactForm'

/**
 * THE CONTACT FORM SAYS ONLY WHAT HAPPENED (WINDOW 5C, 21 November 2026). It used to open a mailto: link and show
 * "Message received" half a second later whatever happened. Now "Message received" follows only an ok answer from
 * /api/contact; a refused or failed send says it was not sent; and the page never hands the visitor to a mail app.
 */
function fill() {
  fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Aria' } })
  fireEvent.change(screen.getByLabelText(/^Email address/), { target: { value: 'aria@example.com' } })
  fireEvent.change(screen.getByLabelText(/^Subject/), { target: { value: 'Photos' } })
  fireEvent.change(screen.getByLabelText(/^Message/), { target: { value: 'I could not upload my photographs.' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ContactForm', () => {
  it('says Message received only after /api/contact answers ok', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ContactForm />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByText('Message received. Thanks.')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/contact')
    expect(JSON.parse(String(init.body))).toMatchObject({ name: 'Aria', email: 'aria@example.com', subject: 'Photos' })
  })

  it('never says Message received when the send failed, and says it was not sent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 502 })))
    render(<ContactForm />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/was not sent/))
    expect(screen.queryByText('Message received. Thanks.')).toBeNull()
  })

  it('never says Message received when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<ContactForm />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/was not sent/))
    expect(screen.queryByText('Message received. Thanks.')).toBeNull()
  })

  it('never hands the visitor to a mail app on Send', async () => {
    const before = window.location.href
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    render(<ContactForm />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByText('Message received. Thanks.')).toBeTruthy())
    expect(window.location.href).toBe(before)
    expect(window.location.href.startsWith('mailto:')).toBe(false)
  })
})
