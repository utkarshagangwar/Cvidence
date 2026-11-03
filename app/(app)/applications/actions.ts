"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aiErrorMessage } from "@/lib/ai/runner";
import { AppError, createApplication, editUnit, rematch, restoreVersion, rewriteUnit, tailorResume } from "@/lib/applications/service";
import { addNote, deleteNote, editLetterUnit, generateLetter, isStatus, refineDocument, setStatus } from "@/lib/applications/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionState = { status: "idle" } | { status: "ok" } | { status: "error"; message: string };

async function session() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new AppError("Your session ended. Sign in again.");
  return { supabase, user: data.user };
}

const message = (err: unknown) => (err instanceof AppError ? err.message : aiErrorMessage(err));
const uuid = z.uuid();

export async function createApplicationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const { supabase, user } = await session();
    id = await createApplication(supabase, user, String(form.get("jd") ?? ""));
  } catch (err) {
    return { status: "error", message: message(err) };
  }
  revalidatePath("/applications");
  redirect(`/applications/${id}`);
}

async function run(applicationId: string, fn: (s: Awaited<ReturnType<typeof session>>) => Promise<unknown>): Promise<ActionState> {
  if (!uuid.safeParse(applicationId).success) return { status: "error", message: "That application wasn't found." };
  try {
    await fn(await session());
  } catch (err) {
    return { status: "error", message: message(err) };
  }
  revalidatePath(`/applications/${applicationId}`);
  return { status: "ok" };
}

export async function tailorAction(applicationId: string): Promise<ActionState> {
  return run(applicationId, ({ supabase, user }) => tailorResume(supabase, user, applicationId));
}

export async function rematchAction(applicationId: string): Promise<ActionState> {
  return run(applicationId, ({ supabase, user }) => rematch(supabase, user, applicationId));
}

export async function editUnitAction(applicationId: string, unitId: string, text: string): Promise<ActionState> {
  if (!/^(summary|[RP]\d{1,2}\.\d{1,2})$/.test(unitId)) return { status: "error", message: "That line wasn't found." };
  return run(applicationId, ({ supabase, user }) => editUnit(supabase, user, applicationId, unitId, String(text)));
}

export async function rewriteUnitAction(applicationId: string, unitId: string, instruction: string): Promise<ActionState> {
  if (!/^(summary|[RP]\d{1,2}\.\d{1,2})$/.test(unitId)) return { status: "error", message: "That line wasn't found." };
  return run(applicationId, ({ supabase, user }) => rewriteUnit(supabase, user, applicationId, unitId, String(instruction).slice(0, 300)));
}

const docKind = z.enum(["resume", "cover", "email"]);
const letterKind = z.enum(["cover", "email"]);
const LETTER_UNIT = /^(subject|greeting|p\d{1,2})$/;

export async function restoreVersionAction(applicationId: string, version: number, kind: string = "resume"): Promise<ActionState> {
  const k = docKind.safeParse(kind);
  if (!k.success || !Number.isInteger(version) || version < 1) return { status: "error", message: "That version wasn't found." };
  return run(applicationId, ({ supabase, user }) => restoreVersion(supabase, user, applicationId, version, k.data));
}

export async function generateLetterAction(applicationId: string, kind: string): Promise<ActionState> {
  const k = letterKind.safeParse(kind);
  if (!k.success) return { status: "error", message: "Unknown document." };
  return run(applicationId, ({ supabase, user }) => generateLetter(supabase, user, applicationId, k.data));
}

export async function editLetterUnitAction(applicationId: string, kind: string, unitId: string, text: string): Promise<ActionState> {
  const k = letterKind.safeParse(kind);
  if (!k.success || !LETTER_UNIT.test(unitId)) return { status: "error", message: "That paragraph wasn't found." };
  return run(applicationId, ({ supabase, user }) => editLetterUnit(supabase, user, applicationId, k.data, unitId, String(text)));
}

export async function refineAction(applicationId: string, kind: string, request: string): Promise<ActionState> {
  const k = docKind.safeParse(kind);
  if (!k.success) return { status: "error", message: "Unknown document." };
  return run(applicationId, ({ supabase, user }) => refineDocument(supabase, user, applicationId, k.data, String(request).slice(0, 600)));
}

export async function setStatusAction(applicationId: string, status: string): Promise<ActionState> {
  if (!isStatus(status)) return { status: "error", message: "Unknown status." };
  const res = await run(applicationId, ({ supabase }) => setStatus(supabase, applicationId, status));
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return res;
}

export async function addNoteAction(applicationId: string, body: string): Promise<ActionState> {
  return run(applicationId, ({ supabase, user }) => addNote(supabase, user, applicationId, String(body)));
}

export async function deleteNoteAction(applicationId: string, noteId: string): Promise<ActionState> {
  if (!uuid.safeParse(noteId).success) return { status: "error", message: "That note wasn't found." };
  return run(applicationId, ({ supabase }) => deleteNote(supabase, noteId));
}

export async function markReviewedAction(applicationId: string): Promise<ActionState> {
  const res = await run(applicationId, async ({ supabase }) => {
    const { error } = await supabase.from("applications").update({ awaiting_review: false }).eq("id", applicationId);
    if (error) throw new AppError("Couldn't update the application. Try again.");
  });
  revalidatePath("/dashboard");
  return res;
}
