import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// "Export my data": every row that belongs to the signed-in user, read through
// RLS (so it can only ever be their own), as one JSON download.
export const dynamic = "force-dynamic";

const TABLES = [
  "profiles",
  "experiences",
  "projects",
  "education",
  "certifications",
  "skills",
  "experience_skills",
  "project_skills",
  "applications",
  "documents",
  "document_versions",
  "status_events",
  "notes",
  "chat_messages",
  "user_postings",
  "agent_settings",
  "agent_runs",
  "usage_ledger",
] as const;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: allowed } = await createSupabaseAdminClient().rpc("hit_rate_limit", { p_key: `export:${auth.user.id}`, p_max: 5, p_window_seconds: 3600 });
  if (allowed !== true) return NextResponse.json({ error: "You can export 5 times an hour. Try again later." }, { status: 429 });

  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: { id: auth.user.id, email: auth.user.email, created_at: auth.user.created_at },
  };
  for (const t of TABLES) {
    const { data, error } = await supabase.from(t).select("*").limit(10000);
    out[t] = error ? { error: "Couldn't read this part. Try again." } : data;
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="cvidence-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
