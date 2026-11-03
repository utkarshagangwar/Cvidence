"use server";

import { revalidatePath } from "next/cache";
import { aiErrorMessage, runAiTask } from "@/lib/ai/runner";
import { IMPROVE_BULLETS, IMPROVE_SUMMARY, improveBulletsPrompt, improveSummaryPrompt } from "@/lib/ai/tasks";
import { UntrustedInputTooLong } from "@/lib/ai/untrusted";
import { acceptBullets, acceptSummary, bulletsToImprove, parseDraft, verbsFor, type ImproveSection } from "@/lib/profile/improve";
import { toSavePayload } from "@/lib/profile/load";
import { profileDocSchema } from "@/lib/profile/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveProfileResult =
  | { status: "saved"; at: string }
  | { status: "invalid"; errors: Array<{ path: string; message: string }> }
  | { status: "error"; message: string };

export async function saveProfile(input: unknown): Promise<SaveProfileResult> {
  const parsed = profileDocSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "invalid",
      errors: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "Your session ended. Sign in again to save." };

  // One transaction, run as the user: RLS applies to every row it touches.
  const { error } = await supabase.rpc("save_profile", { doc: toSavePayload(parsed.data) });
  if (error) {
    const dup = /skills_user_name_unique/.test(error.message);
    return {
      status: "error",
      message: dup ? "Two skills have the same name. Remove one and save again." : "We couldn't save your profile. Try again in a moment.",
    };
  }

  revalidatePath("/", "layout");
  return { status: "saved", at: new Date().toISOString() };
}

export type ImproveResult =
  | { status: "summary"; summary: string }
  | { status: "bullets"; changes: Array<{ bulletId: string; text: string }>; kept: number; same: number; more: number }
  | { status: "error"; message: string };

/**
 * Rewords one low-scoring section of the editor's draft (1 credit). Nothing is
 * saved: the editor applies the result to the form and the person presses Save.
 */
export async function improveSectionAction(section: ImproveSection, draft: unknown): Promise<ImproveResult> {
  if (section !== "summary" && section !== "experience") return { status: "error", message: "That section can't be rewritten." };
  const doc = parseDraft(draft);
  if (!doc) return { status: "error", message: "Some fields are too long to send. Shorten them and try again." };

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "Your session ended. Sign in again." };

  try {
    if (section === "summary") {
      if (!doc.basics.summary && doc.experiences.length === 0 && doc.projects.length === 0 && !doc.basics.headline) {
        return { status: "error", message: "Add a headline or a role first, so there's something to write the summary from." };
      }
      const out = await runAiTask(auth.user.id, IMPROVE_SUMMARY, improveSummaryPrompt(doc));
      const summary = acceptSummary(doc, out.data.summary);
      revalidatePath("/", "layout");
      if (!summary) return { status: "error", message: "The rewrite added something that isn't in your profile, so we left your summary as it was. The credit was used; try again." };
      return { status: "summary", summary };
    }

    const { items, more } = bulletsToImprove(doc);
    if (items.length === 0) {
      return { status: "error", message: "Your bullets already read well. What's left needs facts only you have, like a second bullet for each role. No credit was used." };
    }
    const { past, present } = verbsFor();
    const out = await runAiTask(auth.user.id, IMPROVE_BULLETS, improveBulletsPrompt(items.map(({ id, text, tense, role }) => ({ id, text, tense, role })), past, present));
    const { changes, kept, same } = acceptBullets(doc, items, out.data.bullets);
    revalidatePath("/", "layout");
    return { status: "bullets", changes, kept, same, more };
  } catch (err) {
    if (err instanceof UntrustedInputTooLong) return { status: "error", message: "Your profile is too long to rewrite in one go. No credits were used." };
    return { status: "error", message: aiErrorMessage(err) };
  }
}
