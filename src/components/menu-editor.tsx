'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { saveMenuItem, setMenuItemActive } from '@/app/actions'
import type { MenuItem } from '@/lib/session'
import { MENU_PRICE_CEILING, priceContext, tender } from '@/lib/tender'
import { Button, Notice, TextField } from './ui'

/**
 * Writing your own menu.
 *
 * Price bands are shown as guidance, not enforced beyond the ceiling. The
 * economy is supposed to settle through the two of you negotiating, and a band
 * that quietly rewrote somebody's number would take that away — but a first-time
 * writer with no reference point will guess wildly, so the anchor is worth
 * showing.
 */


export function MenuEditor({
  items,
  suggestPrompt,
}: {
  items: MenuItem[]
  suggestPrompt: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(items.length === 0)

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
      {suggestPrompt && items.length === 0 ? (
        <Notice>
          You’ve got tender and nothing to spend it on — and so have they. Write
          down a few things you’re genuinely willing to do, and put your own price
          on each.
        </Notice>
      ) : null}

      {items.map((item) =>
        editing === item.id ? (
          <ItemForm
            key={item.id}
            item={item}
            onDone={() => setEditing(null)}
          />
        ) : (
          <ItemRow key={item.id} item={item} onEdit={() => setEditing(item.id)} />
        ),
      )}

      {adding ? (
        <ItemForm onDone={() => setAdding(false)} />
      ) : (
        <Button variant="quiet" onClick={() => setAdding(true)}>
          Add something
        </Button>
      )}

      {items.length > 0 && items.length < 3 ? (
        <p className="t-small text-ink-faint">
          {3 - items.filter((i) => i.active).length} more and you can start spending.
        </p>
      ) : null}
    </div>
  )
}

function ItemRow({ item, onEdit }: { item: MenuItem; onEdit: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div
      // Coral edge on white: yours, the one you get asked for. Theirs is pink on
      // the sunken surface.
      className={`rounded-[0.75rem] border border-hairline border-l-[3px] border-l-accent bg-paper-raised p-4 ${
        item.active ? '' : 'opacity-55'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="t-title break-words text-ink">{item.title}</p>
          <p className="t-small mt-1 text-ink-muted">
            <span className="tabular">{tender(item.price)}</span>
            <span className="text-ink-faint"> · {priceContext(item.price)}</span>
          </p>
          {item.lastPriceChange ? (
            <p className="t-small mt-1 text-ink-faint tabular">
              was {tender(item.lastPriceChange.from)}
            </p>
          ) : null}
          {!item.active ? (
            <p className="t-small mt-1 text-ink-faint">Unlisted — they can’t ask for this.</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="t-small text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setMenuItemActive(item.id, !item.active)
                if (result?.error) setError(result.error)
              })
            }
            className="t-small text-ink-faint underline decoration-hairline underline-offset-4 hover:text-ink-muted"
          >
            {item.active ? 'Unlist' : 'Relist'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </div>
  )
}

function ItemForm({ item, onDone }: { item?: MenuItem; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(saveMenuItem, null)
  const [price, setPrice] = useState(item ? String(item.price) : '')

  // Close only once the save actually succeeded, so a rejected price leaves the
  // form open with the reason still on screen. Deferred through a timer rather
  // than called from the effect body — and never during render, which would be a
  // parent state update mid-paint.
  useEffect(() => {
    if (!state?.ok) return
    const timer = window.setTimeout(onDone, 0)
    return () => window.clearTimeout(timer)
  }, [state?.ok, onDone])

  const numeric = Number(price)

  return (
    <form
      action={formAction}
      className="stack rounded-[0.75rem] border border-accent bg-paper-raised p-4"
      style={{ ['--stack-gap' as string]: '1rem' }}
    >
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}

      <TextField
        label="What you’re offering"
        name="title"
        defaultValue={item?.title ?? ''}
        maxLength={90}
        required
        autoFocus
        placeholder="Back rub"
        hint="Specific beats generous. They have to be able to picture it."
      />

      <TextField
        label="Your price"
        name="price"
        inputMode="numeric"
        pattern="[0-9]*"
        value={price}
        onChange={(event) => setPrice(event.target.value.replace(/\D/g, '').slice(0, 6))}
        required
        placeholder="25000"
        aria-describedby="price-hint"
        hint={
          numeric > 0
            ? `${tender(numeric)} — ${priceContext(numeric)}.`
            : `Most things land between ${tender(15_000)} and ${tender(100_000)}. Yours to decide, up to ${tender(MENU_PRICE_CEILING)}.`
        }
      />

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

      <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : item ? 'Save' : 'Add to my menu'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
