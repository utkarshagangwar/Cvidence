import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { emailConfigured, sendEmail } from "@/lib/email/resend";
import { runWorker } from "@/lib/jobs/ingest";
import { istDay } from "@/lib/quota/credits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Called by pg_cron (through pg_net) with `Authorization: Bearer <WORKER_SECRET>`.
//   POST /api/worker/ingest?enqueue=1   queue every enabled source, then drain
//   POST /api/worker/ingest?agent=1     queue today's agent runs, then drain
//   POST /api/worker/ingest             drain whatever is queued (fetches and agent steps)
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DEADLINE_MS = 240_000; // stop picking up new sources well before Vercel's 300 s limit

async function sendUsageReport(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const yesterday = istDay(new Date(Date.now() - 86_400_000));
  const { data, error } = await admin.rpc("daily_usage_report", { p_day: yesterday });
  if (error) throw new Error("report failed");
  // Aggregates only: no names, emails or text.
  console.info(JSON.stringify({ event: "usage.report", report: data }));
  const to = process.env.OPERATOR_EMAIL;
  if (to && emailConfigured()) {
    const text = `Cvidence usage for ${yesterday} (IST)\n\n${JSON.stringify(data, null, 2)}`;
    await sendEmail({ to, subject: `Cvidence usage ${yesterday}`, text, html: `<pre style="font:13px monospace">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>` });
  }
}

function authorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorised(req.headers.get("authorization"), serverEnv().WORKER_SECRET)) {
    // Same answer whether the secret is wrong or not configured.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const admin = createSupabaseAdminClient();
  try {
    let queued = 0;
    const params = new URL(req.url).searchParams;
    if (params.get("enqueue") === "1") {
      const { data, error } = await admin.rpc("enqueue_ingest");
      if (error) throw new Error("enqueue failed");
      queued += Number(data ?? 0);
    }
    // Once a day: one agent run per user who switched the agent on.
    if (params.get("agent") === "1") {
      const { data, error } = await admin.rpc("enqueue_agent_runs");
      if (error) throw new Error("agent enqueue failed");
      queued += Number(data ?? 0);
    }
    // Once a day: yesterday's usage summary to the operator.
    if (params.get("report") === "1") {
      await sendUsageReport(admin);
      return NextResponse.json({ report: "sent" });
    }
    const result = await runWorker(admin, { deadlineMs: DEADLINE_MS });
    console.info(JSON.stringify({ event: "ingest.run", queued, ...result }));
    return NextResponse.json({ queued, ...result });
  } catch {
    console.error(JSON.stringify({ event: "ingest.error" }));
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
