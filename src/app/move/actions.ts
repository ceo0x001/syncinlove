'use server'

import { redirect } from 'next/navigation'
import { sendMyAccount } from '@/lib/move'

/** The one tap. Whatever happens, the page says where they stand now. */
export async function bringMyAccount(): Promise<void> {
  try {
    await sendMyAccount()
  } catch {
    redirect('/move?failed=1')
  }
  redirect('/move')
}
