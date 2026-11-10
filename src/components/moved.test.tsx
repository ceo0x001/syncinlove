import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Moved } from './moved'

/**
 * After the move, a signed-out visitor may not have brought their account yet,
 * so the front door must not tell them it already came across, and must offer
 * the way to move.
 */
describe('Moved', () => {
  it('offers a signed-out visitor the way to move first', () => {
    render(<Moved url="https://syncin.love" signedIn={false} />)
    expect(screen.queryByText(/came with you/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in to bring my account' })).toHaveAttribute('href', '/signin')
    expect(screen.getByRole('link', { name: 'Already moved? Open the new one' })).toHaveAttribute('href', 'https://syncin.love')
  })

  it('tells someone who has moved that their account came with them', () => {
    render(<Moved url="https://syncin.love" signedIn />)
    expect(screen.getByText(/came with you/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the new Sync in Love' })).toHaveAttribute('href', 'https://syncin.love')
    expect(screen.queryByText('Sign in to bring my account')).toBeNull()
  })
})
