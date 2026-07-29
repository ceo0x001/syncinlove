'use client'

import { useEffect, useState } from 'react'
import { Button, Notice } from './ui'

/**
 * Sharing the card.
 *
 * On a phone this hands the PNG to the native share sheet, which is the whole
 * point — the card exists to end up in a group chat. Where that isn't available
 * it falls back to a download.
 *
 * The card is built BEFORE the tap, and that is not an optimisation.
 * `navigator.share()` requires transient user activation: it has to be called
 * within a moment of the click that triggered it. Fetching the PNG first — a
 * server-side render of a 1080x1350 image with three fonts embedded — burns
 * through that window, so share() then rejects with NotAllowedError, whose
 * stock message claims the user denied permission. Nobody denied anything. So
 * the blob is waiting by the time anyone taps, and share() is called
 * synchronously from the handler with nothing awaited in front of it.
 *
 * The initials toggle is offered up front rather than buried in settings. Putting
 * two real first names on an image that gets posted publicly is a decision, and
 * it belongs to the person making it — not least because it discloses that two
 * named people are a couple.
 */
export function ShareCardButton({
  dayIndex,
  syncScore,
  myFirstName,
  theirFirstName,
}: {
  dayIndex: number
  syncScore: number
  myFirstName: string
  theirFirstName: string
}) {
  const [initials, setInitials] = useState(false)
  const [card, setCard] = useState<{ key: string; blob: Blob } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const url = `/api/card/${dayIndex}${initials ? '?initials=1' : ''}`
  const ready = card?.key === url ? card.blob : null

  // Build it in the background, and rebuild when the names/initials choice
  // changes, so whichever variant is on screen is the one already in hand.
  useEffect(() => {
    const controller = new AbortController()

    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (controller.signal.aborted || !blob) return
        setCard({ key: url, blob })
      })
      // A failure here is not worth surfacing: the tap re-fetches and reports
      // properly if it is still broken then.
      .catch(() => {})

    return () => controller.abort()
  }, [url])

  function fileFrom(blob: Blob): File {
    return new File([blob], `sync-${syncScore}.png`, { type: 'image/png' })
  }

  function save(blob: Blob) {
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `sync-${syncScore}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(href)
  }

  /**
   * Returns false when there is no file-capable share sheet to hand it to.
   *
   * Deliberately not async — awaiting anything before share() is what broke it.
   * The rejection is handled on the promise instead.
   */
  function offerShareSheet(blob: Blob): boolean {
    const file = fileFrom(blob)
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean
    }

    if (!nav.share || !nav.canShare?.({ files: [file] })) return false

    nav
      .share({ files: [file], text: `${syncScore}% in sync today.` })
      .catch((cause: Error) => {
        // Cancelling the sheet is a decision, not a failure.
        if (cause?.name === 'AbortError') return
        // Anything else — a lost activation window, a platform that says no —
        // still ends with the card on their device rather than an error.
        save(blob)
      })

    return true
  }

  function onShare() {
    setError(null)

    if (ready) {
      if (!offerShareSheet(ready)) save(ready)
      return
    }

    // Tapped before the background build finished. Fetch now and still try the
    // sheet: it may refuse for want of activation, and offerShareSheet falls
    // back to saving if it does.
    setBusy(true)
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Card unavailable (${response.status})`)
        return response.blob()
      })
      .then((blob) => {
        setCard({ key: url, blob })
        if (!offerShareSheet(blob)) save(blob)
      })
      .catch((cause: Error) => {
        setError(
          cause?.message ?? 'Could not build the card. Try again in a moment?',
        )
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
      <Button onClick={onShare} disabled={busy}>
        {busy ? 'Making the card…' : 'Share today’s card'}
      </Button>

      <button
        type="button"
        onClick={() => setInitials((on) => !on)}
        className="t-small mx-auto block text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
      >
        {initials
          ? `Using initials — ${initial(myFirstName)} & ${initial(theirFirstName)}`
          : `Using names — ${myFirstName} & ${theirFirstName}`}
      </button>

      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  )
}

function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
