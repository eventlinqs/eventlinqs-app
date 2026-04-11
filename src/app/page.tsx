// M4.5 polish: replace with full marketing landing page
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <span className="text-xl font-bold text-[#1A1A2E]">EVENTLINQS</span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-[#1A1A2E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d2d4a] transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-[#1A1A2E] sm:text-5xl lg:text-6xl">
          Tickets for the events
          <br />
          <span className="text-[#4A90D9]">you actually want to go to</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-[#6B7280]">
          Discover events, buy tickets in seconds, and share the experience with friends.
          Transparent pricing. Zero hidden fees.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/events"
            className="rounded-xl bg-[#4A90D9] px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[#3a7bc8] transition-colors"
          >
            Browse Events
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-gray-300 bg-white px-8 py-3.5 text-base font-semibold text-[#1A1A2E] hover:bg-gray-50 transition-colors"
          >
            For Organisers
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white px-4 py-6 text-center text-sm text-[#6B7280]">
        &copy; {new Date().getFullYear()} EventLinqs. All rights reserved.
      </footer>
    </div>
  )
}
