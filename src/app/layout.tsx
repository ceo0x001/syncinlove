import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { myMove, type MoveState } from '@/lib/move'
import { movedTo } from '@/lib/supabase/moved'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

// Carries the question prompts and the sync score — the two places the app
// needs to feel written rather than rendered.
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://syncin.love'),
  title: 'SyncinLove',
  description: 'One question a day, for two people.',
  applicationName: 'SyncinLove',
  // Nothing in here belongs in a search index.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'SyncinLove', statusBarStyle: 'default' },
  // icon.png and apple-icon.png in this directory are picked up automatically.
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fffcfa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1020' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const moved = await movedTo()
  const move = await myMove()
  const line = move ? MOVE_LINE[move.state] : undefined
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {line ? (
          <Link href="/move" className="block bg-ink px-4 py-3 text-center t-small text-paper">
            {line}
          </Link>
        ) : moved ? (
          <a
            href={moved}
            className="block bg-ink px-4 py-3 text-center t-small text-paper"
          >
            Sync in Love has moved. This app is read-only now.{' '}
            <span className="underline">Open the new one</span>
          </a>
        ) : null}
        {children}
      </body>
    </html>
  )
}

/** The strip at the top while someone's account hasn't moved yet. */
const MOVE_LINE: Partial<Record<MoveState, string>> = {
  not_started: 'Sync in Love is moving. Bring your account across →',
  waiting: 'Your side is ready. Waiting for your partner to bring theirs →',
  held_back: 'Your move needs a closer look. We’ll be in touch →',
  left_behind: 'Add an email to bring your account across →',
}
