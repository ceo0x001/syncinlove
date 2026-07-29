import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/**
 * Primitives. Small on purpose — no component library, because the whole design
 * argument is restraint and a library's defaults pull in the opposite direction.
 *
 * Touch targets are 48px minimum. Inputs are 1rem minimum, below which iOS
 * Safari zooms the page on focus.
 */

/**
 * The logo lockup.
 *
 * `size="lg"` is for screens with room to breathe — the welcome and join
 * screens, where this is the first thing anybody sees. `size="sm"` is the
 * compact header mark everywhere else.
 *
 * Two artworks: the default has a near-black wordmark, the dark-theme one
 * carries it in coral so it reads against Deep Midnight. The hearts are
 * identical in both.
 *
 * Uses `<picture>` rather than next/image, deliberately. The browser resolves
 * which source to fetch from the media query before it downloads anything, so
 * the right logo is the only one requested and there is never a frame of the
 * wrong one — whereas rendering both and hiding one with CSS downloads both, and
 * choosing in JavaScript flashes on first paint. That correctness is worth more
 * here than next/image's optimisation of a 40kB PNG, and it keeps the logo on
 * exactly the same `prefers-color-scheme` signal as every colour token.
 *
 * Links home by default, because a logo that isn't clickable is a small
 * papercut on every screen. Pass `href={null}` where leaving would cost
 * something — the invite screen, where navigating away drops the token.
 */
export function Wordmark({
  size = 'sm',
  href = '/',
}: {
  size?: 'sm' | 'lg'
  href?: string | null
}) {
  // The lockup carries its own wordmark, so the compact size can't go much below
  // this before "Sync" stops being readable.
  const height = size === 'lg' ? 64 : 32
  const width = (920 / 400) * height

  const mark = (
    <picture>
      <source
        srcSet="/brand/synclogo-dark.png"
        media="(prefers-color-scheme: dark)"
        type="image/png"
      />
      {/* Plain img on purpose — see the note above. */}
      <img
        src="/brand/synclogo.png"
        alt="SyncinLove"
        width={width}
        height={height}
        // Above the fold on every entry point; a logo that pops in late is the
        // cheapest possible way to look unfinished.
        fetchPriority="high"
        decoding="sync"
        className="block w-auto"
        style={{ height }}
      />
    </picture>
  )

  if (!href) return mark

  return (
    <Link
      href={href}
      // Names the link explicitly rather than leaning on the image's alt, so it
      // announces where it goes and not just what it is.
      aria-label="SyncinLove — back to today"
      className="inline-block transition-opacity hover:opacity-70"
    >
      {mark}
    </Link>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'quiet' | 'ghost' }) {
  const base =
    'inline-flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-[0.625rem] px-5 ' +
    'text-[0.9375rem] font-medium tracking-[-0.01em] transition-all duration-150 ' +
    'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40'

  const variants = {
    // The brand gradient rather than flat coral: it's the brand, and pink at the
    // leading edge lifts white-label contrast from 2.8:1 to ~3.5:1.
    primary: 'text-accent-ink hover:brightness-[1.04] shadow-[0_1px_2px_rgba(15,23,42,0.08)]',
    quiet: 'bg-paper-sunken text-ink hover:bg-hairline',
    ghost: 'text-ink-muted hover:text-ink',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      style={variant === 'primary' ? { backgroundImage: 'var(--brand-gradient)' } : undefined}
      {...props}
    >
      {children}
    </button>
  )
}

export function TextField({
  label,
  hint,
  className = '',
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="t-label mb-2 block">{label}</span>
      <input
        className={
          'w-full rounded-[0.625rem] border border-hairline bg-paper-raised px-4 py-3.5 ' +
          'text-base text-ink placeholder:text-ink-faint ' +
          'transition-colors focus:border-accent focus:outline-none ' +
          className
        }
        {...props}
      />
      {hint ? <span className="t-small mt-2 block text-ink-muted">{hint}</span> : null}
    </label>
  )
}

export function Checkbox({
  label,
  ...props
}: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        className="mt-0.5 size-[1.125rem] shrink-0 accent-[var(--accent)]"
        {...props}
      />
      <span className="t-body text-ink-muted">{label}</span>
    </label>
  )
}

export function Notice({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'error'
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={`t-small rounded-[0.5rem] px-3.5 py-3 ${
        tone === 'error'
          ? 'bg-accent-wash text-ink'
          : 'bg-paper-sunken text-ink-muted'
      }`}
    >
      {children}
    </p>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-[0.875rem] border border-hairline bg-paper-raised p-5 ${className}`}
    >
      {children}
    </div>
  )
}

/** A hairline rule with generous breathing room. */
export function Rule({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-hairline ${className}`} />
}

export function Screen({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  return (
    <main className={`shell ${wide ? 'shell-wide' : ''} flex-1 py-10`}>{children}</main>
  )
}
