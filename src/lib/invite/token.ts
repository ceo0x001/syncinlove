import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Invite links.
 *
 * The link is the credential — somebody holding it can start answering before
 * they have an account — so it is treated like one:
 *
 *   nonce      32 random bytes, stored in plaintext. Useless on its own.
 *   token      HMAC-SHA256(INVITE_SECRET, nonce). What goes in the URL.
 *   token_hash sha256(token), stored. Used to look up an incoming link.
 *
 * The token itself is never written down. A database leak yields nonces and
 * hashes, and neither produces a working link without the secret. Meanwhile the
 * server can always regenerate the link from the nonce, which matters because
 * the inviter will close the tab before they get round to sending it.
 *
 * Server-only: this reads INVITE_SECRET, so it must never be imported into a
 * Client Component.
 */

export const INVITE_TTL_DAYS = 7
/** How long the inviter has to undo a link that reached the wrong person. */
export const REVOKE_WINDOW_HOURS = 24

function secret(): Buffer {
  const value = process.env.INVITE_SECRET
  if (!value || value.length < 32) {
    throw new Error(
      'INVITE_SECRET is missing or too short. Generate one with:\n' +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"\n` +
        'and put it in .env.local, then restart the dev server.',
    )
  }
  return Buffer.from(value, 'utf8')
}

export function newNonce(): string {
  return randomBytes(32).toString('base64url')
}

/** Derives the URL-safe token for a nonce. Deterministic, so links survive. */
export function tokenFromNonce(nonce: string): string {
  return createHmac('sha256', secret()).update(nonce, 'utf8').digest('base64url')
}

/** Lookup key for an incoming token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Confirms a token really was derived from this nonce, in constant time. */
export function tokenMatchesNonce(token: string, nonce: string): boolean {
  const expected = Buffer.from(tokenFromNonce(nonce), 'utf8')
  const given = Buffer.from(token, 'utf8')
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}

export interface NewInvite {
  nonce: string
  token: string
  tokenHash: string
  expiresAt: Date
}

export function createInvite(): NewInvite {
  const nonce = newNonce()
  const token = tokenFromNonce(nonce)
  return {
    nonce,
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  }
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/join/${token}`
}
