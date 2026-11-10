/**
 * After the move (MOVED_TO in Vercel) this app is read-only: no Server
 * Function or form post gets through, except on these pages. Signing in and
 * Bring my account stay open so anyone who hasn't moved yet still can, and
 * the admin page stays open so the founder can send the move emails. Every
 * action there re-checks that it's an admin (loadAdmin checks the database).
 */
export const STILL_OPEN = ['/move', '/signin', '/auth', '/admin']

/** Whether a write to this page still gets through once the app is frozen. */
export function stillOpen(path: string): boolean {
  return STILL_OPEN.some((p) => path === p || path.startsWith(`${p}/`))
}
