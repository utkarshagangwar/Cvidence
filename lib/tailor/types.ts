import { z } from "zod";

/** One editable line of a tailored document. `src` lists the profile tags it came from. */
export interface Unit {
  id: string;
  text: string;
  src: string[];
  edited?: boolean;
}

export interface TailoredResume {
  summary: Unit;
  roles: Array<{ experienceId: string; tag: string; bullets: Unit[] }>;
  projects: Array<{ projectId: string; tag: string; bullets: Unit[] }>;
  /** Skill ids from the profile, in the order to show them. */
  skillIds: string[];
}

export interface Flag {
  unitId: string;
  token: string;
  kind: "number" | "name" | "credential";
}

// What the tailor model is allowed to return. Ids are the short ones we sent it.
// Sources come from the role or project id, never from the model, so any
// extra keys it adds are stripped rather than validated.
// A bare string is accepted too: some models drop the object wrapper.
const modelBullet = z.preprocess(
  (v) => (typeof v === "string" ? { text: v } : v),
  z.object({ text: z.string().trim().min(1).max(600) }),
);

export const tailorModelSchema = z.object({
  summary: z.string().trim().max(1200).default(""),
  roles: z.array(z.object({ id: z.string().regex(/^R\d{1,2}$/), bullets: z.array(modelBullet).max(10) })).max(30).default([]),
  projects: z.array(z.object({ id: z.string().regex(/^P\d{1,2}$/), bullets: z.array(modelBullet).max(6) })).max(30).default([]),
  skills: z.array(z.string().trim().max(100)).max(80).default([]),
});
export type TailorModelOutput = z.infer<typeof tailorModelSchema>;

export const singleBulletSchema = z.object({ text: z.string().trim().min(1).max(600) });
