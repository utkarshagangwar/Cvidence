"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aiErrorMessage } from "@/lib/ai/runner";
import { AppError } from "@/lib/applications/service";
import { MAX_SCORE_PER_CLICK, scorePostings, setDismissed, setSaved, startApplicationFromPosting } from "@/lib/jobs/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type JobActionState = { status: "ok"; scored?: number } | { status: "error"; message: string };

const uuid = z.uuid();
const uuids = z.array(z.uuid()).min(1).max(MAX_SCORE_PER_CLICK);

async function session() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new AppError("Your session ended. Sign in again.");
  return { supabase, user: data.user };
}

const message = (err: unknown) => (err instanceof AppError ? err.message : aiErrorMessage(err));

export async function saveJobAction(postingId: string, saved: boolean): Promise<JobActionState> {
  if (!uuid.safeParse(postingId).success) return { status: "error", message: "That job wasn't found." };
  try {
    const { supabase, user } = await session();
    await setSaved(supabase, user, postingId, Boolean(saved));
  } catch (err) {
    return { status: "error", message: message(err) };
  }
  revalidatePath("/jobs");
  return { status: "ok" };
}

export async function dismissJobAction(postingId: string, dismissed: boolean): Promise<JobActionState> {
  if (!uuid.safeParse(postingId).success) return { status: "error", message: "That job wasn't found." };
  try {
    const { supabase, user } = await session();
    await setDismissed(supabase, user, postingId, Boolean(dismissed));
  } catch (err) {
    return { status: "error", message: message(err) };
  }
  revalidatePath("/jobs");
  return { status: "ok" };
}

export async function scoreJobsAction(postingIds: string[]): Promise<JobActionState> {
  const ids = uuids.safeParse(postingIds);
  if (!ids.success) return { status: "error", message: "Nothing to score." };
  let scored = 0;
  try {
    const { supabase, user } = await session();
    scored = await scorePostings(supabase, user, ids.data);
  } catch (err) {
    return { status: "error", message: message(err) };
  }
  revalidatePath("/jobs");
  return { status: "ok", scored };
}

export async function startApplicationAction(postingId: string): Promise<JobActionState> {
  if (!uuid.safeParse(postingId).success) return { status: "error", message: "That job wasn't found." };
  let id: string;
  try {
    const { supabase, user } = await session();
    id = await startApplicationFromPosting(supabase, user, postingId);
  } catch (err) {
    return { status: "error", message: message(err) };
  }
  revalidatePath("/applications");
  redirect(`/applications/${id}`);
}
