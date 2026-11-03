import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// For an uptime monitor: 200 when the app and database answer, 503 otherwise.
// Says nothing else, so it's safe to leave public.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { error } = await createSupabaseAdminClient().from("job_sources").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
