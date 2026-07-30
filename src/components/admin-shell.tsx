import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The console chrome: a rail of sections on the left, a titled bar on top.
 *
 * Borrowed from the shape of an ordinary admin tool rather than from this app,
 * deliberately. Sync's own layout is a centred phone column because it is read
 * one question at a time; an operator console is scanned, compared and worked
 * through, and that wants persistent navigation and a wide table.
 *
 * The rail is icon-only until there is room for labels, so it stays usable on a
 * tablet without becoming a drawer that has to be opened to find anything.
 */
export function AdminShell({
  title,
  breadcrumb,
  children,
}: {
  title: string
  breadcrumb: string
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-paper-sunken/40 p-3 sm:p-5">
      <div className="mx-auto flex max-w-[96rem] gap-3 sm:gap-5">
        <Rail />

        <div className="min-w-0 flex-1 overflow-hidden rounded-[1rem] border border-hairline bg-paper">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-7">
            <div>
              <h1 className="t-title text-ink">{title}</h1>
              <p className="t-small mt-0.5 text-ink-faint">
                <span className="text-ink-muted">Admin</span> › {breadcrumb}
              </p>
            </div>

            <Link
              href="/"
              className="press t-label inline-flex min-h-[2.5rem] items-center rounded-full border border-hairline bg-paper-raised px-4 text-ink-muted hover:text-ink"
            >
              Leave panel
            </Link>
          </header>

          <div className="px-5 py-6 sm:px-7">{children}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * The section rail.
 *
 * Anchors rather than routes: every section is on one page, and splitting them
 * across routes would mean four round trips to answer "is anything wrong today",
 * which is the question this console exists for.
 */
function Rail() {
  const sections = [
    { href: '#glance', label: 'Overview', icon: <GridIcon /> },
    { href: '#accounts', label: 'Accounts', icon: <PeopleIcon /> },
    { href: '#retention', label: 'Retention', icon: <ChartIcon /> },
    { href: '#economy', label: 'Economy', icon: <CoinIcon /> },
    { href: '#emails', label: 'Emails', icon: <MailIcon /> },
  ]

  return (
    <nav className="flex shrink-0 flex-col items-center gap-1 rounded-[1rem] border border-hairline bg-paper px-2 py-4 xl:w-52 xl:items-stretch xl:px-3">
      <span className="mb-3 flex items-center justify-center xl:justify-start xl:px-2">
        <picture>
          <source srcSet="/brand/syncicon.png" type="image/png" />
          <img
            src="/brand/syncicon.png"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-[0.5rem]"
          />
        </picture>
        <span className="t-label ml-2 hidden text-ink xl:inline">Console</span>
      </span>

      {sections.map((s) => (
        <a
          key={s.href}
          href={s.href}
          title={s.label}
          className="press flex min-h-[2.75rem] items-center justify-center gap-3 rounded-[0.625rem] px-3 text-ink-faint hover:bg-paper-sunken hover:text-ink xl:justify-start"
        >
          {s.icon}
          <span className="t-small hidden xl:inline">{s.label}</span>
        </a>
      ))}
    </nav>
  )
}

/* Hand-drawn rather than a dependency: five glyphs is not worth an icon set,
   and these inherit currentColor so they follow the theme for free. */

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'size-[1.125rem] shrink-0',
  'aria-hidden': true,
}

function GridIcon() {
  return (
    <svg {...stroke}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg {...stroke}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.5a3.25 3.25 0 0 1 0 6.5M17.5 19.5c0-2-.7-3.6-1.9-4.6" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg {...stroke}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 20v-6M12 20v-9M16 20v-4M20 20v-11" />
    </svg>
  )
}

function CoinIcon() {
  return (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.75 14.5c0 .97 1 1.5 2.25 1.5s2.25-.6 2.25-1.55c0-1.95-4.5-.85-4.5-2.9 0-.95 1-1.55 2.25-1.55s2.25.53 2.25 1.5" />
      <path d="M12 8.25v1M12 15v1" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg {...stroke}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  )
}
