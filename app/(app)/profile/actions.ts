"use server";

import { revalidatePath } from "next/cache";
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
