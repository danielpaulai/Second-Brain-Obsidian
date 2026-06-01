import { createClient } from "@supabase/supabase-js";

/**
 * Server-only admin client. Bypasses RLS — handle with care.
 * Use ONLY in route handlers / server actions for privileged operations like:
 *   - assigning user roles
 *   - inserting audit-log rows that the user themselves can't touch
 *
 * NEVER import this from a Client Component.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase admin not configured: missing URL or SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
