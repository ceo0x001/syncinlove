'use client'

import { useState } from 'react'
import { Button, Notice } from './ui'

/**
 * Sharing the card.
 *
 * On a phone this hands the PNG to the native share sheet, which is the whole
 * point — the card exists to end up in a group chat. Where that isn't available
 * it falls back to a download, and if even that is blocked it opens the image so
 * the user can long-press it.
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const url = `/api/card/${dayIndex}${initials ? '?initials=1' : ''}`

  async function share() {
    setBusy(true)
    setError(null)

    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Card unavailable (${response.status})`)

      const blob = await response.blob()
      const file = new File([blob], `sync-${syncScore}.png`, { type: 'image/png' })

      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean
      }

      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({
          files: [file],
          text: `${syncScore}% in sync today.`,
        })
        return
      }

      // No share sheet — save it instead.
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch (cause) {
      // A cancelled share sheet throws AbortError. That's the user changing their
      // mind, not a failure, so it shouldn't produce an error message.
      if ((cause as Error)?.name === 'AbortError') return
      setError(
        (cause as Error)?.message ??
          'Could not build the card. Try again in a moment?',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
      <Button onClick={share} disabled={busy}>
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
