import "server-only";
// Cover letter, outreach email, refine chat, status and notes. Same rules as
// the resume: runs as the signed-in user (RLS), the model writes, code decides
// what's kept, every change is a new version.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { runAiTask } from "@/lib/ai/runner";
import { COVER_LETTER, coverPrompt, emailPrompt, OUTREACH_EMAIL, REFINE, refinePrompt } from "@/lib/ai/tasks";
import { letterUnits, replaceLetterUnit, sanitizeLetter } from "@/lib/letters/sanitize";
import type { LetterDoc, LetterKind } from "@/lib/letters/types";
import { extractedJdSchema } from "@/lib/match/types";
import { loadProfile } from "@/lib/profile/load";
import { factGuard } from "@/lib/tailor/fact-guard";
import type { ResumeUnits } from "@/lib/tailor/frame";
import { allUnits, replaceUnit } from "@/lib/tailor/sanitize";
import { AppError, getApplication, getDocument, writeVersion, type DocKind } from "./service";

async function context(supabase: SupabaseClient, applicationId: string) {
  const app = await getApplication(supabase, applicationId);
  if (!app?.extracted || !app.match) throw new AppError("Match this job against your profile first.");
  const profile = await loadProfile(supabase);
  if (profile.experiences.length === 0 && profile.projects.length === 0) throw new AppError("Add at least one role or project to your profile first.");
  const jd = extractedJdSchema.parse(app.extracted);
  const covered = app.match.items.filter((i) => i.state === "covered").map((i) => i.text);
  const gaps = app.match.items.filter((i) => i.state === "gap").map((i) => i.text);
  return { app, profile, jd, covered, gaps };
}

/** Cover letter (2 credits) or outreach email (1 credit). */
export async function generateLetter(supabase: SupabaseClient, user: User, applicationId: string, kind: LetterKind) {
  const { app, profile, jd, covered, gaps } = await context(supabase, applicationId);
  const out =
    kind === "cover"
      ? await runAiTask(user.id, COVER_LETTER, coverPrompt(jd, app.jd_text, profile, covered, gaps))
      : await runAiTask(user.id, OUTREACH_EMAIL, emailPrompt(jd, app.jd_text, profile, covered, gaps));
  const letter = sanitizeLetter(kind, out.data, profile, jd.applyEmail);
  if (letter.paragraphs.length === 0) throw new AppError("The draft came back empty. Your credits were used; try again.");
  const flags = factGuard(letterUnits(letter), profile, app.jd_text);
  const existing = await getDocument<LetterDoc>(supabase, applicationId, kind);
  await writeVersion(supabase, user, applicationId, kind, existing, letter, flags, existing ? "regenerated" : "generated", {
    provider: out.provider,
    model: out.model,
    promptVersion: out.promptVersion,
  });
  await supabase.from("applications").update({ prompt_versions: { ...app.prompt_versions, [kind]: out.promptVersion } }).eq("id", applicationId);
}

/** Manual edit of one paragraph, greeting or subject (free). */
export async function editLetterUnit(supabase: SupabaseClient, user: User, applicationId: string, kind: LetterKind, unitId: string, text: string) {
  const clean = text.replace(/[ \t]+/g, " ").trim();
  if (!clean) throw new AppError("A paragraph can't be empty.");
  if (clean.length > 1200) throw new AppError("Keep a paragraph under 1,200 characters.");
  const app = await getApplication(supabase, applicationId);
  const doc = await getDocument<LetterDoc>(supabase, applicationId, kind);
  if (!app || !doc) throw new AppError("That draft wasn't found.");
  if (!letterUnits(doc.units).some((u) => u.id === unitId)) throw new AppError("That paragraph no longer exists. Reload the page.");
  const profile = await loadProfile(supabase);
  const letter = replaceLetterUnit(doc.units, unitId, clean);
  await writeVersion(supabase, user, applicationId, kind, doc, letter, factGuard(letterUnits(letter), profile, app.jd_text), "edited");
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  version: number | null;
  created_at: string;
}

export async function listChat(supabase: SupabaseClient, applicationId: string, kind: DocKind): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("chat_messages")
    .select("id, role, body, version, created_at")
    .eq("application_id", applicationId)
    .eq("kind", kind)
    .order("created_at", { ascending: true })
    .limit(60);
  return (data ?? []) as ChatMessage[];
}

/** Refine chat (1 credit per message): the model may only rewrite existing lines. */
export async function refineDocument(supabase: SupabaseClient, user: User, applicationId: string, kind: DocKind, request: string) {
  const ask = request.replace(/\s+/g, " ").trim();
  if (ask.length < 3) throw new AppError("Say what you'd like changed.");
  if (ask.length > 500) throw new AppError("Keep a request under 500 characters.");
  const { app, profile, jd, gaps } = await context(supabase, applicationId);

  const doc = await getDocument<ResumeUnits | LetterDoc>(supabase, applicationId, kind);
  if (!doc) throw new AppError("Write the draft first, then ask for changes.");
  const units = kind === "resume" ? allUnits((doc.units as ResumeUnits).resume) : letterUnits(doc.units as LetterDoc);

  const out = await runAiTask(user.id, REFINE, refinePrompt(kind, units.map((u) => ({ id: u.id, text: u.text })), ask, profile, jd.title, gaps));
  // Saved only once the model answered, so a failed request leaves no orphan message.
  await supabase.from("chat_messages").insert({ application_id: applicationId, user_id: user.id, kind, role: "user", body: ask, version: doc.current_version });
  const known = new Set(units.map((u) => u.id));
  const changes = out.data.changes.filter((c) => known.has(c.id));

  let version: number | null = null;
  if (changes.length > 0) {
    let next: ResumeUnits | LetterDoc = doc.units;
    for (const c of changes) {
      const text = c.text.replace(/[ \t]+/g, " ").trim().slice(0, kind === "resume" ? 600 : 1200);
      next = kind === "resume" ? { ...(next as ResumeUnits), resume: replaceUnit((next as ResumeUnits).resume, c.id, text) } : replaceLetterUnit(next as LetterDoc, c.id, text);
    }
    const nextUnits = kind === "resume" ? allUnits((next as ResumeUnits).resume) : letterUnits(next as LetterDoc);
    version = await writeVersion(supabase, user, applicationId, kind, doc, next, factGuard(nextUnits, profile, app.jd_text), "refined");
  }
  const reply = changes.length > 0 ? out.data.reply : `${out.data.reply}${/nothing|no change/i.test(out.data.reply) ? "" : " (No lines were changed.)"}`;
  await supabase.from("chat_messages").insert({ application_id: applicationId, user_id: user.id, kind, role: "assistant", body: reply.slice(0, 2000), version });
}

const STATUSES = ["draft", "applied", "interview", "offer", "closed"] as const;
export type AppStatus = (typeof STATUSES)[number];
export const isStatus = (s: string): s is AppStatus => (STATUSES as readonly string[]).includes(s);

export async function setStatus(supabase: SupabaseClient, applicationId: string, status: AppStatus) {
  const { error } = await supabase.rpc("set_application_status", { p_application_id: applicationId, p_status: status });
  if (error) throw new AppError(error.message.includes("NOT_FOUND") ? "That application wasn't found." : "Couldn't change the status. Try again.");
}

export interface Note {
  id: string;
  body: string;
  created_at: string;
}

export async function listNotes(supabase: SupabaseClient, applicationId: string): Promise<Note[]> {
  const { data } = await supabase.from("notes").select("id, body, created_at").eq("application_id", applicationId).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as Note[];
}

export async function addNote(supabase: SupabaseClient, user: User, applicationId: string, body: string) {
  const text = body.trim();
  if (!text) throw new AppError("Write something first.");
  if (text.length > 5000) throw new AppError("Keep a note under 5,000 characters.");
  const { error } = await supabase.from("notes").insert({ application_id: applicationId, user_id: user.id, body: text });
  if (error) throw new AppError("Couldn't save the note. Try again.");
}

export async function deleteNote(supabase: SupabaseClient, noteId: string) {
  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) throw new AppError("Couldn't delete the note. Try again.");
}
