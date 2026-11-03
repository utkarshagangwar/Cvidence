import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { runAiTask } from "@/lib/ai/runner";
import { EXTRACT_JD, extractPrompt, MATCH, matchPrompt, REWRITE_BULLET, rewriteBulletPrompt, TAILOR_RESUME, tailorPrompt } from "@/lib/ai/tasks";
import { MAX_UNTRUSTED_CHARS } from "@/lib/ai/untrusted";
import { classifyMatch } from "@/lib/match/classify";
import { extractedJdSchema, type ExtractedJd, type MatchResult } from "@/lib/match/types";
import { loadProfile } from "@/lib/profile/load";
import { factGuard } from "@/lib/tailor/fact-guard";
import { buildFrame, type ResumeUnits } from "@/lib/tailor/frame";
import { allUnits, replaceUnit, sanitizeTailored } from "@/lib/tailor/sanitize";
import type { Flag } from "@/lib/tailor/types";

// Every query here runs as the signed-in user (RLS). Only the credit ledger
// uses the service role, inside runAiTask.

export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export const MIN_JD_CHARS = 50;

export interface ApplicationRow {
  id: string;
  status: string;
  title: string;
  company: string;
  location: string;
  jd_text: string;
  extracted: ExtractedJd | null;
  match: MatchResult | null;
  prompt_versions: Record<string, string>;
  awaiting_review: boolean;
  agent_score: number | null;
  created_at: string;
  updated_at: string;
}

export async function getApplication(supabase: SupabaseClient, id: string): Promise<ApplicationRow | null> {
  const { data, error } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (error) throw new AppError("Could not load that application.");
  return (data as ApplicationRow | null) ?? null;
}

/** Paste JD (or a found posting) → extract (1 credit) → match (1 credit). Returns the new application id. */
/**
 * `ownerId` is only for the daily agent, which runs with the service role:
 * it makes every profile read filter on that user explicitly.
 */
export async function createApplication(supabase: SupabaseClient, user: User, jdText: string, postingId?: string, ownerId?: string): Promise<string> {
  const jd = jdText.replace(/\r\n?/g, "\n").trim();
  if (jd.length < MIN_JD_CHARS) throw new AppError("Paste the full job description (at least a few lines).");
  if (jd.length > MAX_UNTRUSTED_CHARS) throw new AppError("That's longer than 50,000 characters. Paste just the job description.");

  const extracted = await runAiTask(user.id, EXTRACT_JD, extractPrompt(jd));

  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      title: extracted.data.title.slice(0, 300),
      company: extracted.data.company.slice(0, 300),
      location: extracted.data.location.slice(0, 300),
      jd_text: jd,
      extracted: extracted.data,
      prompt_versions: { extract: extracted.promptVersion },
      ...(postingId ? { posting_id: postingId } : {}),
    })
    .select("id")
    .single();
  if (error || !data) throw new AppError("We read the job but couldn't save it. Try again.");

  await rematch(supabase, user, data.id as string, ownerId);
  return data.id as string;
}

/** (Re)compute the match for an application against the current profile. */
export async function rematch(supabase: SupabaseClient, user: User, applicationId: string, ownerId?: string): Promise<MatchResult> {
  const app = await getApplication(supabase, applicationId);
  if (!app?.extracted) throw new AppError("That application wasn't found.");
  const jd = extractedJdSchema.parse(app.extracted);
  const profile = await loadProfile(supabase, ownerId);

  const needsModel = profile.skills.length > 0 && jd.requirements.some((r) => r.kind === "skill" || r.kind === "other");
  const mapping = needsModel ? (await runAiTask(user.id, MATCH, matchPrompt(jd, profile))) : null;
  const match = classifyMatch(jd, mapping?.data ?? { mappings: [] }, profile);

  const { error } = await supabase
    .from("applications")
    .update({ match, prompt_versions: { ...app.prompt_versions, ...(mapping ? { match: mapping.promptVersion } : {}) } })
    .eq("id", applicationId);
  if (error) throw new AppError("Couldn't save the match. Try again.");
  return match;
}

export type DocKind = "resume" | "cover" | "email";
export type VersionCause = "generated" | "edited" | "regenerated" | "refined" | "restored";

export interface DocumentRow<U = ResumeUnits> {
  id: string;
  application_id: string;
  kind: DocKind;
  units: U;
  flags: Flag[];
  written_with: Record<string, string>;
  current_version: number;
}

export async function getDocument<U>(supabase: SupabaseClient, applicationId: string, kind: DocKind) {
  const { data, error } = await supabase.from("documents").select("*").eq("application_id", applicationId).eq("kind", kind).maybeSingle();
  if (error) throw new AppError("Could not load the document.");
  return (data as DocumentRow<U> | null) ?? null;
}

export const getResumeDocument = (supabase: SupabaseClient, applicationId: string) => getDocument<ResumeUnits>(supabase, applicationId, "resume");

export async function listVersions(supabase: SupabaseClient, documentId: string) {
  const { data } = await supabase
    .from("document_versions")
    .select("version, cause, created_at")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(30);
  return (data ?? []) as Array<{ version: number; cause: string; created_at: string }>;
}

/** Saves a new version of one document. Returns the new version number. */
export async function writeVersion<U>(
  supabase: SupabaseClient,
  user: User,
  applicationId: string,
  kind: DocKind,
  existing: DocumentRow<U> | null,
  units: U,
  flags: Flag[],
  cause: VersionCause,
  writtenWith?: Record<string, string>,
): Promise<number> {
  const version = existing ? existing.current_version + 1 : 1;
  let documentId = existing?.id;

  if (!existing) {
    const { data, error } = await supabase
      .from("documents")
      .insert({ application_id: applicationId, user_id: user.id, kind, units, flags, written_with: writtenWith ?? {}, current_version: 1 })
      .select("id")
      .single();
    if (error || !data) throw new AppError("Couldn't save the document. Try again.");
    documentId = data.id as string;
  } else {
    // Guard on current_version so two tabs can't overwrite each other.
    const { data, error } = await supabase
      .from("documents")
      .update({ units, flags, current_version: version, ...(writtenWith ? { written_with: writtenWith } : {}) })
      .eq("id", existing.id)
      .eq("current_version", existing.current_version)
      .select("id");
    if (error) throw new AppError("Couldn't save the change. Try again.");
    if (!data || data.length === 0) throw new AppError("This document changed in another tab. Reload to see the latest version.");
  }

  const { error: vErr } = await supabase
    .from("document_versions")
    .insert({ document_id: documentId, user_id: user.id, version, cause, units, flags });
  if (vErr) throw new AppError("Saved, but the version history didn't update. Reload the page.");
  return version;
}

/** Tailor (3 credits): model writes, code sanitises and fact-checks, a new version is saved. */
export async function tailorResume(supabase: SupabaseClient, user: User, applicationId: string, ownerId?: string) {
  const app = await getApplication(supabase, applicationId);
  if (!app?.extracted || !app.match) throw new AppError("Match this job against your profile first.");
  const profile = await loadProfile(supabase, ownerId);
  if (profile.experiences.length === 0 && profile.projects.length === 0) {
    throw new AppError("Add at least one role or project to your profile first.");
  }

  const jd = extractedJdSchema.parse(app.extracted);
  const gaps = app.match.items.filter((i) => i.state === "gap").map((i) => i.text);
  const out = await runAiTask(user.id, TAILOR_RESUME, tailorPrompt(jd, app.jd_text, profile, gaps));

  const resume = sanitizeTailored(out.data, profile);
  const units: ResumeUnits = { resume, frame: buildFrame(profile) };
  const flags = factGuard(allUnits(resume), profile, app.jd_text);

  const existing = await getResumeDocument(supabase, applicationId);
  await writeVersion(supabase, user, applicationId, "resume", existing, units, flags, existing ? "regenerated" : "generated", {
    provider: out.provider,
    model: out.model,
    promptVersion: out.promptVersion,
  });
  await supabase.from("applications").update({ prompt_versions: { ...app.prompt_versions, tailor: out.promptVersion } }).eq("id", applicationId);
}

/** Manual edit of one line (free). The fact guard re-checks the whole resume. */
export async function editUnit(supabase: SupabaseClient, user: User, applicationId: string, unitId: string, text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new AppError("A line can't be empty. Remove it in your profile instead.");
  if (clean.length > 600) throw new AppError("Keep a line under 600 characters.");
  const app = await getApplication(supabase, applicationId);
  const doc = await getResumeDocument(supabase, applicationId);
  if (!app || !doc) throw new AppError("That resume wasn't found.");
  if (!allUnits(doc.units.resume).some((u) => u.id === unitId)) throw new AppError("That line no longer exists. Reload the page.");

  const profile = await loadProfile(supabase);
  const resume = replaceUnit(doc.units.resume, unitId, clean);
  const flags = factGuard(allUnits(resume), profile, app.jd_text);
  await writeVersion(supabase, user, applicationId, "resume", doc, { ...doc.units, resume }, flags, "edited");
}

/** Rewrite one line with AI (1 credit), from that role's or project's own facts only. */
export async function rewriteUnit(supabase: SupabaseClient, user: User, applicationId: string, unitId: string, instruction: string) {
  const app = await getApplication(supabase, applicationId);
  const doc = await getResumeDocument(supabase, applicationId);
  if (!app?.extracted || !doc) throw new AppError("That resume wasn't found.");
  const unit = allUnits(doc.units.resume).find((u) => u.id === unitId);
  if (!unit) throw new AppError("That line no longer exists. Reload the page.");

  const profile = await loadProfile(supabase);
  const tag = unit.id.split(".")[0];
  const role = doc.units.resume.roles.find((r) => r.tag === tag);
  const project = doc.units.resume.projects.find((p) => p.tag === tag);
  const exp = role && profile.experiences.find((e) => e.id === role.experienceId);
  const proj = project && profile.projects.find((p) => p.id === project.projectId);
  const facts =
    unit.id === "summary"
      ? [profile.basics.summary, ...profile.experiences.map((e) => `${e.title} at ${e.company}`)]
      : exp
        ? exp.bullets.map((b) => b.text)
        : proj
          ? [proj.description, ...proj.bullets.map((b) => b.text)]
          : [];
  if (facts.filter(Boolean).length === 0) throw new AppError("There are no profile facts behind this line to rewrite from.");

  const jd = extractedJdSchema.parse(app.extracted);
  const out = await runAiTask(user.id, REWRITE_BULLET, rewriteBulletPrompt(unit.text, facts.filter(Boolean), jd.title, instruction || "Make it more relevant to the role.", exp && !exp.endDate ? "present" : "past"));
  const resume = replaceUnit(doc.units.resume, unitId, out.data.text.replace(/\s+/g, " ").trim().slice(0, 600));
  const flags = factGuard(allUnits(resume), profile, app.jd_text);
  await writeVersion(supabase, user, applicationId, "resume", doc, { ...doc.units, resume }, flags, "regenerated");
}

/** Undo: restore an earlier version as a NEW version (history is never rewritten). */
export async function restoreVersion(supabase: SupabaseClient, user: User, applicationId: string, version: number, kind: DocKind = "resume") {
  const doc = await getDocument<unknown>(supabase, applicationId, kind);
  if (!doc) throw new AppError("That document wasn't found.");
  const { data, error } = await supabase
    .from("document_versions")
    .select("units, flags")
    .eq("document_id", doc.id)
    .eq("version", version)
    .maybeSingle();
  if (error || !data) throw new AppError("That version wasn't found.");
  await writeVersion(supabase, user, applicationId, kind, doc, data.units, data.flags as Flag[], "restored");
}
