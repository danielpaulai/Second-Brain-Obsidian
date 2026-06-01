import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client. Reads + writes the auth cookies via Next's
 * cookies() API. Use in route handlers + server components.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* in route handlers writes may be blocked — fine for read-only flows */
          }
        },
      },
    }
  );
}

/** Get the current authenticated user (or null). */
export async function getCurrentUser() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

/**
 * Determine the viewer role from the authenticated session.
 *   - No env / no session → "owner" (single-user local dev mode)
 *   - Email matches OWNER_EMAIL → "owner"
 *   - Otherwise → "team"
 */
export async function getViewerRoleFromAuth(): Promise<"owner" | "team" | "public"> {
  // If Supabase isn't configured, treat everyone as owner (single-user dev)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return "owner";
  }
  const user = await getCurrentUser();
  if (!user) return "public";
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const userEmail = user.email?.toLowerCase();
  if (ownerEmail && userEmail === ownerEmail) return "owner";
  // Check app_metadata.role for explicit override
  const meta = (user.app_metadata as any) || {};
  if (meta.role === "owner") return "owner";
  if (meta.role === "team") return "team";
  if (meta.role === "public") return "public";
  return "team";
}
