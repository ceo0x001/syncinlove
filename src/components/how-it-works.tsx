'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { haptic } from '@/lib/haptics'
import { MENU_PRICE_CEILING, tender } from '@/lib/tender'

/**
 * "How Sync Works".
 *
 * Built because real people kept asking two questions — what is this, and how do
 * I verify — and the answer to the second one was on screen the whole time. The
 * signup page led with a promise and no explanation, on the theory that the app is
 * self-evident once you are in it. It is not, and the cost of being wrong about
 * that is somebody closing the tab.
 *
 * A native <dialog> rather than a hand-rolled overlay. showModal() gives focus
 * trapping, Escape, the inert backdrop and the correct screen-reader semantics for
 * free, and every one of those is something a div with position:fixed gets subtly
 * wrong. The one thing it does not give is backdrop-click-to-close, added below.
 *
 * Verification gets its own visual treatment rather than being step two of ten.
 * It is the single thing people are stuck on: the code arrives, and the box that
 * takes it is on the next screen, so it reads as a dead end. Burying that in a
 * numbered list would be technically complete and practically useless.
 */

type Variant = 'hero' | 'quiet'

export function HowItWorks({ variant = 'hero' }: { variant?: Variant }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  const show = useCallback(() => {
    haptic('tap')
    ref.current?.showModal()
    setOpen(true)
  }, [])

  const hide = useCallback(() => {
    ref.current?.close()
  }, [])

  // Escape and the close button both fire the dialog's own close event, so the
  // open flag is synced from there rather than from each call site.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClose = () => setOpen(false)
    el.addEventListener('close', onClose)
    return () => el.removeEventListener('close', onClose)
  }, [])

  /**
   * Escape, explicitly.
   *
   * <dialog> is supposed to handle this itself, and mostly does — but it routes
   * Escape through Chrome's CloseWatcher, which will not arm without history user
   * activation. Verified in this project: the keydown reached the document, the
   * dialog's own `cancel` event never fired, and the panel stayed open.
   *
   * Whether a given real user hits that condition is not something worth guessing
   * about, because the failure mode is somebody stuck in a modal with no keyboard
   * way out. If the native path does fire first, the dialog is already closed and
   * close() is a no-op, so this costs nothing to keep.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        ref.current?.close()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // The body must not scroll behind an open sheet. <dialog> makes the page inert
  // but does not stop it scrolling, and on iOS that shows as the page drifting
  // under your finger when you reach the end of the panel.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <>
      {variant === 'hero' ? (
        /*
          Arrow below the button, not beside it.
          
          Beside was the first attempt and it does not fit. At 375px — the width of
          every iPhone from the SE to the 13 mini, and the width this app is
          designed at — the wordmark and the button consume the row entirely, so a
          horizontal arrow had to be hidden by a media query. An arrow that
          disappears on the most common screen is not an arrow.

          Underneath there is room at every width, and it points up at the corner
          instead of sideways into it.
        */
        <span className="flex flex-col items-end gap-1.5">
          <button type="button" onClick={show} className="how-trigger press">
            <QuestionIcon />
            How Sync works
          </button>
          <NudgeArrow />
        </span>
      ) : (
        <button
          type="button"
          onClick={show}
          className="t-small inline-flex items-center gap-1.5 text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
        >
          <QuestionIcon />
          How Sync works
        </button>
      )}

      <dialog
        ref={ref}
        className="how-dialog"
        aria-labelledby="how-title"
        // Clicking the backdrop closes. The dialog element's own box covers the
        // whole viewport, so a click that lands on the dialog and not on the inner
        // panel is by definition a click on the backdrop.
        onClick={(event) => {
          if (event.target === ref.current) hide()
        }}
      >
        <div className="how-panel">
          <header className="how-head">
            <div>
              <p className="t-label">A 30-second read</p>
              <h2 id="how-title" className="t-title text-ink">
                How Sync works
              </h2>
            </div>
            <button
              type="button"
              onClick={hide}
              aria-label="Close"
              className="press grid size-9 shrink-0 place-items-center rounded-full border border-hairline text-ink-muted hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                className="size-4"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div className="how-body">
            <Guide />
          </div>

          <footer className="how-foot">
            <button
              type="button"
              onClick={hide}
              className="press t-body w-full rounded-full px-5 py-3 font-medium text-[var(--accent-ink)]"
              style={{ backgroundImage: 'var(--brand-gradient)' }}
            >
              Got it
            </button>
          </footer>
        </div>
      </dialog>
    </>
  )
}

/**
 * The guide itself.
 *
 * Written in the order somebody actually experiences it, not in the order the
 * system is built. Numbers come from src/lib/tender.ts rather than being typed in
 * here — a guide that quietly disagrees with the app is worse than no guide, and
 * these values have already been rescaled once.
 */
function Guide() {
  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1.75rem' }}>
      <p className="t-body text-ink-muted">
        One question a day, for two people. You answer it about yourself, then guess
        how they answered. Neither of you sees anything until you&rsquo;ve both
        submitted.
      </p>

      <Step n={1} title="Sign up">
        Your first name and an email address. No password — there isn&rsquo;t one to
        forget. The name is just what the app calls you; a pet name is a perfectly
        good answer and you can change it later.
      </Step>

      {/*
        Lifted out of the numbered flow on purpose. This is the step people write in
        about, and the reason is that the code and the box that takes it are on two
        different screens.
      */}
      <div className="rounded-[0.875rem] border border-accent/35 bg-accent-wash p-4">
        <p className="t-label mb-1 text-ink">Verifying — the bit everyone asks about</p>
        <h3 className="t-body font-medium text-ink">
          The code arrives by email. The box for it is on the next screen.
        </h3>
        <ol
          className="stack mt-3"
          style={{ ['--stack-gap' as string]: '0.5rem' }}
        >
          <Bullet>
            Sign up, and a numeric code is emailed to you straight away — usually
            inside a minute.
          </Bullet>
          <Bullet>
            You land on your own screen. There&rsquo;s a box on it headed{' '}
            <strong className="font-medium text-ink">Confirm your email</strong>.
            Type the code in there and press confirm. That&rsquo;s all verifying is.
          </Bullet>
          <Bullet>
            Nothing is locked while you wait. You can answer today&rsquo;s question
            first and confirm afterwards.
          </Bullet>
          <Bullet>
            No code? Check spam, then use <em>Send it again</em>. The newest code is
            the only one that works.
          </Bullet>
        </ol>
        <p className="t-small mt-3 text-ink-muted">
          Do finish it. An unconfirmed account can&rsquo;t be proved to be yours, so
          if you lose your browser it&rsquo;s gone — and links opened inside WhatsApp
          get reopened in Safari all the time.
        </p>
      </div>

      <Step n={2} title="Invite your person">
        You get one link. Send it however you already talk to them. When they tap it
        they pick their own name and you&rsquo;re paired — that&rsquo;s the whole
        setup.
      </Step>

      <Step n={3} title="One question a day">
        It opens at midnight in your timezone and stays answerable for 30 hours, so a
        late night doesn&rsquo;t cost you the day. Same question for both of you.
      </Step>

      <Step n={4} title="Answer twice">
        First honestly, about you. Then again as a guess of what they said. The
        second half is where the game is.
      </Step>

      <Step n={5} title="Nobody peeks">
        Your answers stay sealed until you&rsquo;ve both submitted — not hidden by the
        app, actually unreadable. Neither of you can see the other&rsquo;s until
        it&rsquo;s fair.
      </Step>

      <Step n={6} title="The reveal">
        Both answers open together with a sync score out of 100. You each earn{' '}
        {tender(10_000)} for showing up and up to {tender(30_000)} more for how well
        you read them — {tender(40_000)} on a perfect day.
      </Step>

      <Step n={7} title="Spend it on them">
        You each write a menu: things you&rsquo;d genuinely like, priced by you, up to{' '}
        {tender(MENU_PRICE_CEILING)}. Tender only buys from your partner&rsquo;s
        menu, so earning it is aimed at them by design. They can decline anything, and
        declining refunds you.
      </Step>

      <Step n={8} title="Keep the streak">
        Answering on consecutive days pays both of you a bonus at 7, 14, 30 and 60
        days. Miss one and the run resets — it doesn&rsquo;t take anything you already
        earned.
      </Step>

      <Step n={9} title="Later on">
        After 30 days of both of you answering, the vault opens: letters you seal
        until a date you choose. And if you both agree to it, the Rich List ranks
        couples publicly on tender earned — under your names, initials or an alias.
      </Step>

      <div className="rounded-[0.875rem] border border-hairline bg-paper-sunken p-4">
        <p className="t-small text-ink-muted">
          <strong className="font-medium text-ink">It&rsquo;s free,</strong>{' '}
          it takes about thirty seconds a day, and either of you can end the pairing
          or download everything you&rsquo;ve written at any time from Settings.
        </p>
      </div>
    </div>
  )
}

function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3.5">
      <span
        aria-hidden="true"
        className="t-small mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-hairline-strong bg-paper-raised tabular font-medium text-ink-muted"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="t-body font-medium text-ink">{title}</h3>
        <p className="t-small mt-0.5 text-ink-muted">{children}</p>
      </div>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="t-small flex gap-2 text-ink-muted">
      <span aria-hidden="true" className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent" />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function QuestionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 3.9" />
      <path d="M12 17.2h.01" />
    </svg>
  )
}

/**
 * The arrow, pointing up at the button from underneath.
 *
 * Hand-drawn rather than a glyph, matching the icons elsewhere in the app. The
 * kink in the tail is what makes it read as drawn on by somebody: a clean
 * geometric arrow beside a button reads as chrome, which is the one thing it must
 * not do — chrome is what the eye has already learned to skip.
 *
 * It stops short of the button rather than touching it, and sits inset from the
 * right edge so the head lands under the button's body instead of past its corner.
 */
function NudgeArrow() {
  return (
    <svg
      viewBox="0 0 44 30"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="how-arrow mr-5 h-[1.6rem] w-11 shrink-0 text-accent"
      aria-hidden="true"
    >
      {/* Tail: starts low-left, dips, then sweeps up to the right. */}
      <path d="M3 27c6.5.6 10.4-1.4 11.2-4.6.6-2.4-1.2-4-2.8-3.2-1.8.9-1 4 2 5 4.6 1.5 12-1.4 17.4-8.2 2-2.6 3.6-5.6 4.6-8.6" />
      {/* Head, opening up-and-right so it points into the button above it. */}
      <path d="M31.6 4.2 35.6 2.4l2.2 4.2" />
    </svg>
  )
}
