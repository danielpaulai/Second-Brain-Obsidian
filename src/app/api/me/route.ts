import { NextResponse } from "next/server";
import { getCurrentUser, getViewerRoleFromAuth } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Returns the authenticated user + their viewer role.
 * Client components hit this on mount to decide what to show.
 */
export async function GET() {
  const user = await getCurrentUser();
  const role = await getViewerRoleFromAuth();
  return NextResponse.json({
    ok: true,
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name ?? null,
          avatar: user.user_metadata?.avatar_url ?? null,
        }
      : null,
    role,
  });
}
