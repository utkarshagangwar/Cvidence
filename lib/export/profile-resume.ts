// The master profile as a full resume (every role, project and skill, in
// profile order), in the same shape tailored resumes use, so the sheet, print
// page and DOCX/Markdown exports all work on it unchanged.

import { sourceTags, type ProfileDoc } from "@/lib/profile/schema";
import { buildFrame, type ResumeDocumentData } from "@/lib/tailor/frame";
import type { Unit } from "@/lib/tailor/types";

const has = (s: string) => s.trim().length > 0;

export function profileToResume(doc: ProfileDoc): ResumeDocumentData {
  const tags = sourceTags(doc);
  const unit = (id: string, text: string, tag?: string): Unit => ({ id, text: text.trim(), src: tag ? [tag] : [] });
  const frame = buildFrame(doc);
  frame.languages = doc.languages.filter((l) => has(l.name)).map((l) => ({ name: l.name.trim(), level: l.level.trim() }));
  return {
    frame,
    flags: [],
    resume: {
      summary: unit("summary", doc.basics.summary),
      roles: doc.experiences.map((e) => {
        const tag = tags.get(e.id)!;
        return { experienceId: e.id, tag, bullets: e.bullets.filter((b) => has(b.text)).map((b, i) => unit(`${tag}.${i + 1}`, b.text, tag)) };
      }),
      projects: doc.projects.map((p) => {
        const tag = tags.get(p.id)!;
        const lines = [p.description, ...p.bullets.map((b) => b.text)].filter(has);
        return { projectId: p.id, tag, bullets: lines.map((t, i) => unit(`${tag}.${i + 1}`, t, tag)) };
      }),
      skillIds: doc.skills.map((s) => s.id),
    },
  };
}

/** "Riya Sharma" -> "Riya_Sharma_resume"; safe on every OS. */
export function resumeFileBase(name: string): string {
  const base = name.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "_");
  return base ? `${base}_resume` : "resume";
}
