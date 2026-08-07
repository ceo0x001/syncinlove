import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaceForm } from './settings-forms'

/**
 * The bug this file exists for.
 *
 * The highlight was bound to the SAVED pace, so clicking a different option moved the
 * radio dot while the coral border stayed where it was. A control showing two answers
 * at once, correcting itself only after a save.
 *
 * It is also the clearest case for this project existing at all. The bug was invisible
 * in source — `pace === option.id` is a perfectly sensible line — and I then verified
 * the FIX by hand twice and got it wrong both times, because reading a computed border
 * colour immediately after a click races the 150ms CSS transition. A rendered
 * assertion on which element carries the class races nothing.
 */

vi.mock('@/app/actions', () => ({
  setPace: async () => ({ ok: true }),
}))

// The selected card is the one whose radio is checked; the highlight is CSS driven by
// :has(), so the assertion is on the DOM relationship rather than on a colour.
const selected = () =>
  screen.getAllByRole('radio').find((r) => (r as HTMLInputElement).checked)?.closest('label')

describe('PaceForm', () => {
  it('starts on the pace the pairing already has', () => {
    render(<PaceForm pace="standard" />)
    expect(selected()).toHaveTextContent('Standard')
  })

  it('moves the selection to whatever you click, before any save', async () => {
    const user = userEvent.setup()
    render(<PaceForm pace="standard" />)

    await user.click(screen.getByRole('radio', { name: /Bold/ }))

    expect(selected()).toHaveTextContent('Bold')
    expect(selected()).not.toHaveTextContent('Standard')
  })

  /*
    The assertion that actually catches the original bug, and it took a second pass to
    find. The test above passes against the broken code: the radio always moved
    correctly — it was the coral border that stayed behind, and that was a className
    computed from the saved prop.

    jsdom applies no stylesheet, so the border itself cannot be observed. What can be
    observed is that the three cards are styled IDENTICALLY: the selected one is
    distinguished by CSS reading the radio (`.pace-option:has(input:checked)`), not by a
    class derived from the saved value. The broken version gave Standard
    `border-accent bg-accent-wash` and the others something else, so this fails on it.

    Worth stating plainly because it is the trap this whole project is meant to avoid:
    a test can assert something true about a component and still not test the thing that
    broke.
  */
  it('distinguishes the selected card with CSS, not with a class from the saved value', () => {
    render(<PaceForm pace="standard" />)
    const cards = screen.getAllByRole('radio').map((r) => r.closest('label')!)

    const classes = new Set(cards.map((c) => c.className))
    expect(classes.size, 'all three cards must be styled the same').toBe(1)
    expect(cards[0].className).toContain('pace-option')
  })

  it('keeps exactly one option selected however many times you change your mind', async () => {
    const user = userEvent.setup()
    render(<PaceForm pace="standard" />)

    await user.click(screen.getByRole('radio', { name: /Bold/ }))
    await user.click(screen.getByRole('radio', { name: /Gentle/ }))
    await user.click(screen.getByRole('radio', { name: /Bold/ }))

    const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)
    expect(checked).toHaveLength(1)
    expect(selected()).toHaveTextContent('Bold')
  })

  it('gives every option the same name, so they are one group and not three', () => {
    // Three radios with different names would let a couple select all three at once,
    // and the form would submit whichever the browser felt like.
    render(<PaceForm pace="gentle" />)
    const names = new Set(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).name))
    expect(names).toEqual(new Set(['pace']))
  })

  it('leads with what does not change, because that is the actual answer', () => {
    // The complaint was "we wait too long for the interesting subjects". Every pace now
    // covers all eight inside the first fortnight, so the copy says so before it
    // describes the difference — otherwise the control reads as gating content.
    render(<PaceForm pace="standard" />)
    expect(screen.getByText(/all eight subjects/)).toBeInTheDocument()
    expect(screen.getByText(/only affects questions you haven’t been asked yet/)).toBeInTheDocument()
  })
})
