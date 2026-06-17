import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-only Supabase client.
 *
 * Uses the SERVICE ROLE key, which bypasses Row-Level Security. This is safe
 * ONLY because this module is imported exclusively by trusted Server Actions
 * that enforce their own auth via `requireRole`. The service-role key must
 * never be exposed to the browser — keep it out of any `NEXT_PUBLIC_` var.
 *
 * RLS is enabled (deny-by-default) on every table, so the public anon key can
 * no longer read/write the database directly from the client.
 */
export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase server env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    )
  }

  return createServerClient(supabaseUrl, serviceRoleKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have a proxy refreshing sessions.
        }
      },
    },
  })
}
