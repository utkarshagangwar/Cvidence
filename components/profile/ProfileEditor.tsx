"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveProfile } from "@/app/(app)/profile/actions";
import { IconButton, TextArea, TextField } from "@/components/ui/Field";
import { IconDown, IconPlus, IconTrash, IconUp, IconUpload, IconX } from "@/components/ui/icons";
import { UndoToast } from "@/components/ui/UndoToast";
import { scoreProfile } from "@/lib/ats/score";
import { LEGACY_STORAGE_KEY, legacyToProfile } from "@/lib/profile/legacy-import";
import { newId, sourceTags, type ProfileDoc } from "@/lib/profile/schema";

type Save = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string; details?: string[] };
type Draft = { source: "file" | "legacy"; name: string } | null;
type Removed = { label: string; restore: () => void } | null;

function move<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function ProfileEditor({ initial }: { initial: ProfileDoc }) {
  const [doc, setDoc] = useState<ProfileDoc>(initial);
  const [saved, setSaved] = useState<ProfileDoc>(initial);
  const [save, setSave] = useState<Save>({ kind: "idle" });
  const [draft, setDraft] = useState<Draft>(null);
  const [removed, setRemoved] = useState<Removed>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [hasLegacy, setHasLegacy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const removedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);
  const ats = useMemo(() => scoreProfile(doc), [doc]);
  const tags = useMemo(() => sourceTags(doc), [doc]);

  useEffect(() => {
    try {
      setHasLegacy(!!window.localStorage.getItem(LEGACY_STORAGE_KEY));
    } catch {
      setHasLegacy(false);
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (fn: (d: ProfileDoc) => ProfileDoc) => {
    setDoc((d) => fn(d));
    if (save.kind !== "saving") setSave({ kind: "idle" });
  };

  const removeWithUndo = (label: string, before: ProfileDoc, after: ProfileDoc) => {
    setDoc(after);
    if (removedTimer.current) clearTimeout(removedTimer.current);
    setRemoved({ label, restore: () => setDoc(before) });
    removedTimer.current = setTimeout(() => setRemoved(null), 6000);
  };

  async function onSave() {
    setSave({ kind: "saving" });
    const res = await saveProfile(doc);
    if (res.status === "saved") {
      setSaved(doc);
      setDraft(null);
      setSave({ kind: "saved" });
    } else if (res.status === "invalid") {
      setSave({ kind: "error", message: "Some fields need fixing before this can be saved.", details: res.errors.map((e) => e.message) });
    } else {
      setSave({ kind: "error", message: res.message });
    }
  }

  async function onFile(file: File) {
    setImportError(null);
    if (file.size > 5 * 1024 * 1024) {
      setImportError("Files must be under 5 MB.");
      return;
    }
    setImporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/import", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { profile?: ProfileDoc; error?: string };
      if (!res.ok || !json.profile) throw new Error(json.error ?? "Import failed. Try again.");
      setDoc(json.profile);
      setDraft({ source: "file", name: file.name });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed. Try again.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onLegacy() {
    try {
      const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;
      setDoc(legacyToProfile(JSON.parse(raw), doc.basics.email));
      setDraft({ source: "legacy", name: "the old resume builder" });
    } catch {
      setImportError("We couldn't read what the old builder saved in this browser.");
    }
  }

  const b = doc.basics;
  const setBasics = (patch: Partial<ProfileDoc["basics"]>) => update((d) => ({ ...d, basics: { ...d.basics, ...patch } }));

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Import */}
        <section className="card flex flex-col gap-4 p-6" aria-label="Import">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-[18px]">Start from what you have</h2>
            <p className="m-0 text-[13px] text-muted">
              Import fills the form below as a draft. Nothing is saved until you check it and press Save.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
              className="sr-only"
              id="resume-file"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              disabled={importing}
            />
            <label htmlFor="resume-file" className={`btn btn-secondary press ${importing ? "pointer-events-none opacity-60" : ""}`}>
              <IconUpload />
              {importing ? "Reading your resume…" : "Import a resume file"}
            </label>
            {hasLegacy && (
              <button type="button" className="btn btn-secondary press" onClick={onLegacy} disabled={importing}>
                Bring over from the old builder
              </button>
            )}
            <span className="text-[12px] text-subtle">PDF, DOCX or Markdown, under 5 MB. Uses 2 AI credits.</span>
          </div>
          {importing && (
            <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-teal-tint px-3 py-2.5 text-[13px] text-teal-ink" role="status">
              <span className="loader-dot" aria-hidden="true" />
              Reading the file and sorting it into sections. This takes up to a minute.
            </div>
          )}
          {importError && <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-gap-bg px-3 py-2.5 text-[13px] text-gap-text">{importError}</p>}
          {draft && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-partial-bg px-3 py-2.5 text-[13px] text-partial-text" role="status">
              <span>Draft from {draft.name}. Check every section, then press Save.</span>
              <button type="button" className="btn h-8 px-3 text-[13px] text-partial-text underline" onClick={() => { setDoc(saved); setDraft(null); }}>
                Discard draft
              </button>
            </div>
          )}
        </section>

        {/* Basics */}
        <section className="card flex flex-col gap-5 p-6" aria-labelledby="basics-h">
          <div className="flex flex-col gap-1">
            <h2 id="basics-h" className="m-0 text-[18px]">Basics</h2>
            <p className="m-0 text-[13px] text-muted">These appear at the top of every resume.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Full name" value={b.name} onChange={(v) => setBasics({ name: v })} autoComplete="name" maxLength={200} />
            <TextField label="Headline" value={b.headline} onChange={(v) => setBasics({ headline: v })} placeholder="e.g. QA Automation Engineer" maxLength={300} />
            <TextField label="City" value={b.city} onChange={(v) => setBasics({ city: v })} placeholder="e.g. Bengaluru" maxLength={200} />
            <TextField label="Phone" value={b.phone} onChange={(v) => setBasics({ phone: v })} placeholder="e.g. +91 98765 43210" inputMode="tel" maxLength={50} />
            <TextField label="Email" value={b.email} onChange={() => undefined} readOnly className="[&_input]:bg-well [&_input]:text-ink-2" help="From your sign-in." />
            <TextField
              label="LinkedIn or portfolio URL"
              value={b.links[0]?.url ?? ""}
              onChange={(v) => setBasics({ links: v ? [{ label: /linkedin/i.test(v) ? "LinkedIn" : "Portfolio", url: v }, ...b.links.slice(1)] : b.links.slice(1) })}
              placeholder="e.g. linkedin.com/in/your-name"
              inputMode="url"
              maxLength={500}
            />
          </div>
          <TextArea
            label="Summary"
            value={b.summary}
            onChange={(v) => setBasics({ summary: v })}
            rows={4}
            maxLength={5000}
            help="Two or three sentences in your own words. Cvidence rewrites it per job but never adds facts."
          />
        </section>

        {/* Experience */}
        <section className="card flex flex-col gap-5 p-6" aria-labelledby="exp-h">
          <SectionHead id="exp-h" title="Experience" hint="Each role gets a tag (R1, R2) that tailored resumes point back to." />
          {doc.experiences.length === 0 && <Empty text="No roles yet. Add your current or most recent job first." />}
          {doc.experiences.map((e, i) => (
            <Entry
              key={e.id}
              tag={tags.get(e.id)}
              title={[e.title, e.company].filter(Boolean).join(" · ") || "New role"}
              onUp={() => update((d) => ({ ...d, experiences: move(d.experiences, i, -1) }))}
              onDown={() => update((d) => ({ ...d, experiences: move(d.experiences, i, 1) }))}
              first={i === 0}
              last={i === doc.experiences.length - 1}
              onRemove={() => removeWithUndo(e.title || "role", doc, { ...doc, experiences: doc.experiences.filter((x) => x.id !== e.id) })}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Job title" value={e.title} onChange={(v) => update((d) => patchList(d, "experiences", e.id, { title: v }))} maxLength={200} />
                <TextField label="Company" value={e.company} onChange={(v) => update((d) => patchList(d, "experiences", e.id, { company: v }))} maxLength={200} />
                <TextField label="Location" value={e.location} onChange={(v) => update((d) => patchList(d, "experiences", e.id, { location: v }))} maxLength={200} />
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Start" type="month" value={e.startDate} onChange={(v) => update((d) => patchList(d, "experiences", e.id, { startDate: v }))} />
                  <TextField label="End" type="month" value={e.endDate} onChange={(v) => update((d) => patchList(d, "experiences", e.id, { endDate: v }))} help={e.endDate ? undefined : "Empty = current role"} />
                </div>
              </div>
              <Bullets
                bullets={e.bullets}
                onChange={(bullets) => update((d) => patchList(d, "experiences", e.id, { bullets }))}
              />
              <SkillLinks doc={doc} selected={e.skillIds} onChange={(skillIds) => update((d) => patchList(d, "experiences", e.id, { skillIds }))} />
            </Entry>
          ))}
          <AddButton
            label="Add a role"
            onClick={() => update((d) => ({ ...d, experiences: [...d.experiences, { id: newId(), company: "", title: "", location: "", startDate: "", endDate: "", bullets: [], skillIds: [] }] }))}
          />
        </section>

        {/* Projects */}
        <section className="card flex flex-col gap-5 p-6" aria-labelledby="proj-h">
          <SectionHead id="proj-h" title="Projects" hint="Side projects, coursework or open source. Tagged P1, P2." />
          {doc.projects.length === 0 && <Empty text="No projects yet. They help a lot when your experience is short." />}
          {doc.projects.map((p, i) => (
            <Entry
              key={p.id}
              tag={tags.get(p.id)}
              title={p.name || "New project"}
              onUp={() => update((d) => ({ ...d, projects: move(d.projects, i, -1) }))}
              onDown={() => update((d) => ({ ...d, projects: move(d.projects, i, 1) }))}
              first={i === 0}
              last={i === doc.projects.length - 1}
              onRemove={() => removeWithUndo(p.name || "project", doc, { ...doc, projects: doc.projects.filter((x) => x.id !== p.id) })}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Project name" value={p.name} onChange={(v) => update((d) => patchList(d, "projects", p.id, { name: v }))} maxLength={200} />
                <TextField label="Link" value={p.url} onChange={(v) => update((d) => patchList(d, "projects", p.id, { url: v }))} inputMode="url" maxLength={500} placeholder="e.g. github.com/you/project" />
              </div>
              <TextArea label="What it is" value={p.description} onChange={(v) => update((d) => patchList(d, "projects", p.id, { description: v }))} rows={2} maxLength={2000} />
              <Bullets bullets={p.bullets} onChange={(bullets) => update((d) => patchList(d, "projects", p.id, { bullets }))} />
              <SkillLinks doc={doc} selected={p.skillIds} onChange={(skillIds) => update((d) => patchList(d, "projects", p.id, { skillIds }))} />
            </Entry>
          ))}
          <AddButton
            label="Add a project"
            onClick={() => update((d) => ({ ...d, projects: [...d.projects, { id: newId(), name: "", url: "", description: "", startDate: "", endDate: "", bullets: [], skillIds: [] }] }))}
          />
        </section>

        {/* Skills */}
        <SkillsSection doc={doc} update={update} onRemove={removeWithUndo} />

        {/* Education */}
        <section className="card flex flex-col gap-5 p-6" aria-labelledby="edu-h">
          <SectionHead id="edu-h" title="Education" />
          {doc.education.length === 0 && <Empty text="Add your degree or diploma." />}
          {doc.education.map((e, i) => (
            <Entry
              key={e.id}
              title={[e.degree, e.institution].filter(Boolean).join(" · ") || "New entry"}
              onUp={() => update((d) => ({ ...d, education: move(d.education, i, -1) }))}
              onDown={() => update((d) => ({ ...d, education: move(d.education, i, 1) }))}
              first={i === 0}
              last={i === doc.education.length - 1}
              onRemove={() => removeWithUndo(e.institution || "entry", doc, { ...doc, education: doc.education.filter((x) => x.id !== e.id) })}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="School or university" value={e.institution} onChange={(v) => update((d) => patchList(d, "education", e.id, { institution: v }))} maxLength={200} />
                <TextField label="Degree" value={e.degree} onChange={(v) => update((d) => patchList(d, "education", e.id, { degree: v }))} placeholder="e.g. B.E." maxLength={200} />
                <TextField label="Field" value={e.field} onChange={(v) => update((d) => patchList(d, "education", e.id, { field: v }))} placeholder="e.g. Computer Science" maxLength={200} />
                <TextField label="Grade" value={e.grade} onChange={(v) => update((d) => patchList(d, "education", e.id, { grade: v }))} placeholder="e.g. 8.4 CGPA" maxLength={50} />
                <TextField label="Start" type="month" value={e.startDate} onChange={(v) => update((d) => patchList(d, "education", e.id, { startDate: v }))} />
                <TextField label="End" type="month" value={e.endDate} onChange={(v) => update((d) => patchList(d, "education", e.id, { endDate: v }))} />
              </div>
            </Entry>
          ))}
          <AddButton
            label="Add education"
            onClick={() => update((d) => ({ ...d, education: [...d.education, { id: newId(), institution: "", degree: "", field: "", grade: "", startDate: "", endDate: "" }] }))}
          />
        </section>

        {/* Certifications */}
        <section className="card flex flex-col gap-5 p-6" aria-labelledby="cert-h">
          <SectionHead id="cert-h" title="Certifications" />
          {doc.certifications.length === 0 && <Empty text="None yet. Add any that are current." />}
          {doc.certifications.map((c, i) => (
            <Entry
              key={c.id}
              title={c.name || "New certification"}
              onUp={() => update((d) => ({ ...d, certifications: move(d.certifications, i, -1) }))}
              onDown={() => update((d) => ({ ...d, certifications: move(d.certifications, i, 1) }))}
              first={i === 0}
              last={i === doc.certifications.length - 1}
              onRemove={() => removeWithUndo(c.name || "certification", doc, { ...doc, certifications: doc.certifications.filter((x) => x.id !== c.id) })}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TextField label="Name" value={c.name} onChange={(v) => update((d) => patchList(d, "certifications", c.id, { name: v }))} maxLength={200} />
                <TextField label="Issuer" value={c.issuer} onChange={(v) => update((d) => patchList(d, "certifications", c.id, { issuer: v }))} maxLength={200} />
                <TextField label="Issued" type="month" value={c.issuedOn} onChange={(v) => update((d) => patchList(d, "certifications", c.id, { issuedOn: v }))} />
              </div>
            </Entry>
          ))}
          <AddButton
            label="Add a certification"
            onClick={() => update((d) => ({ ...d, certifications: [...d.certifications, { id: newId(), name: "", issuer: "", issuedOn: "", url: "" }] }))}
          />
        </section>

        {/* Languages */}
        <section className="card flex flex-col gap-4 p-6" aria-labelledby="lang-h">
          <SectionHead id="lang-h" title="Languages" hint="Used when a job asks for a spoken language." />
          {doc.languages.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
              <TextField label="Language" value={l.name} onChange={(v) => update((d) => ({ ...d, languages: d.languages.map((x, j) => (j === i ? { ...x, name: v } : x)) }))} maxLength={60} />
              <TextField label="Level" value={l.level} onChange={(v) => update((d) => ({ ...d, languages: d.languages.map((x, j) => (j === i ? { ...x, level: v } : x)) }))} placeholder="e.g. Fluent" maxLength={60} />
              <IconButton label={`Remove ${l.name || "language"}`} tone="danger" onClick={() => removeWithUndo(l.name || "language", doc, { ...doc, languages: doc.languages.filter((_, j) => j !== i) })}>
                <IconTrash />
              </IconButton>
            </div>
          ))}
          <AddButton label="Add a language" onClick={() => update((d) => ({ ...d, languages: [...d.languages, { name: "", level: "" }] }))} />
        </section>
      </div>

      {/* Side rail: ATS score and save */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-8" aria-label="Profile status">
        <section className="card flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[17px]">ATS readiness</h2>
            <span className="num text-[22px] text-ink">{ats.score}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-track" aria-hidden="true">
            <div className="h-1.5 bg-teal transition-[width] duration-300" style={{ width: `${ats.score}%` }} />
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {ats.sections.map((s) => {
              const todo = s.checks.filter((c) => !c.passed);
              return (
                <li key={s.key} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[13px]">
                    <span className="font-medium">{s.name}</span>
                    <span className={`num ${s.score === 100 ? "text-covered-text" : s.score >= 50 ? "text-partial-text" : "text-gap-text"}`}>{s.score}</span>
                  </div>
                  {todo.slice(0, 2).map((c) => (
                    <span key={c.message} className="text-[12px] text-muted">{c.message}</span>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="card flex flex-col gap-3 p-5">
          <button type="button" className="btn btn-primary press w-full" onClick={onSave} disabled={save.kind === "saving" || (!dirty && !draft)}>
            {save.kind === "saving" ? "Saving…" : draft ? "Save imported profile" : "Save profile"}
          </button>
          <div role="status" aria-live="polite" className="min-h-5 text-[13px]">
            {save.kind === "saved" && <span className="text-covered-text">Saved</span>}
            {save.kind === "idle" && dirty && <span className="text-muted">Unsaved changes</span>}
            {save.kind === "idle" && !dirty && <span className="text-subtle">Everything is saved</span>}
            {save.kind === "error" && (
              <span className="flex flex-col gap-1 text-gap-text">
                {save.message}
                {save.details?.slice(0, 4).map((d) => <span key={d} className="text-[12px]">{d}</span>)}
              </span>
            )}
          </div>
        </div>
      </aside>

      {removed && (
        <UndoToast
          message={`Removed ${removed.label}`}
          onUndo={() => {
            removed.restore();
            setRemoved(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type ListKey = "experiences" | "projects" | "education" | "certifications";
function patchList<K extends ListKey>(d: ProfileDoc, key: K, id: string, patch: Partial<ProfileDoc[K][number]>): ProfileDoc {
  return { ...d, [key]: (d[key] as Array<{ id: string }>).map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

function SectionHead({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="m-0 text-[18px]">{title}</h2>
      {hint && <p className="m-0 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="m-0 rounded-[var(--radius-control)] border border-dashed border-line-strong px-4 py-3 text-[13px] text-muted">{text}</p>;
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary press self-start" onClick={onClick}>
      <IconPlus />
      {label}
    </button>
  );
}

function Entry({
  tag,
  title,
  children,
  onUp,
  onDown,
  onRemove,
  first,
  last,
}: {
  tag?: string;
  title: string;
  children: React.ReactNode;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line-soft bg-sheet p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {tag && <span className="num shrink-0 rounded-[3px] bg-teal-tint px-1.5 text-[11px] text-teal">{tag}</span>}
          <span className="truncate font-semibold">{title}</span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <IconButton label={`Move ${title} up`} onClick={onUp} disabled={first}><IconUp /></IconButton>
          <IconButton label={`Move ${title} down`} onClick={onDown} disabled={last}><IconDown /></IconButton>
          <IconButton label={`Remove ${title}`} onClick={onRemove} tone="danger"><IconTrash /></IconButton>
        </div>
      </div>
      {children}
    </div>
  );
}

function Bullets({ bullets, onChange }: { bullets: Array<{ id: string; text: string }>; onChange: (b: Array<{ id: string; text: string }>) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">What you did (one fact per line)</legend>
      {bullets.map((b, i) => (
        <div key={b.id} className="flex items-start gap-2">
          <textarea
            aria-label={`Bullet ${i + 1}`}
            rows={2}
            maxLength={500}
            className="field h-auto flex-1 py-2 leading-normal"
            value={b.text}
            onChange={(e) => onChange(bullets.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)))}
          />
          <IconButton label={`Remove bullet ${i + 1}`} tone="danger" onClick={() => onChange(bullets.filter((x) => x.id !== b.id))}>
            <IconX />
          </IconButton>
        </div>
      ))}
      <button type="button" className="btn h-9 self-start px-2 text-[13px] text-teal hover:text-teal-hover" onClick={() => onChange([...bullets, { id: newId(), text: "" }])}>
        <IconPlus /> Add a bullet
      </button>
    </fieldset>
  );
}

function SkillLinks({ doc, selected, onChange }: { doc: ProfileDoc; selected: string[]; onChange: (ids: string[]) => void }) {
  if (doc.skills.length === 0) {
    return <p className="m-0 text-[12px] text-subtle">Add skills below, then link the ones you used here. Linked skills count as covered when you match a job.</p>;
  }
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Skills used here</legend>
      <div className="flex flex-wrap gap-1.5">
        {doc.skills.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
              className={
                "press h-8 rounded-[var(--radius-tag)] border px-2.5 text-[13px] " +
                (on ? "border-teal bg-teal-tint text-teal" : "border-line bg-surface text-ink-2 hover:border-line-strong")
              }
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function SkillsSection({
  doc,
  update,
  onRemove,
}: {
  doc: ProfileDoc;
  update: (fn: (d: ProfileDoc) => ProfileDoc) => void;
  onRemove: (label: string, before: ProfileDoc, after: ProfileDoc) => void;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("Technical");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (doc.skills.some((s) => s.name.toLowerCase() === n.toLowerCase())) {
      setError(`"${n}" is already in your skills.`);
      return;
    }
    update((d) => ({ ...d, skills: [...d.skills, { id: newId(), name: n.slice(0, 100), group }] }));
    setName("");
    setError(null);
  };

  const groups = [...new Set(doc.skills.map((s) => s.group || "Other"))];

  return (
    <section className="card flex flex-col gap-5 p-6" aria-labelledby="skills-h">
      <SectionHead id="skills-h" title="Skills" hint="Tailored resumes can only list skills from here." />
      {doc.skills.length === 0 && <Empty text="No skills yet. Add the tools and techniques you've used." />}
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-muted">{g}</span>
          <div className="flex flex-wrap gap-1.5">
            {doc.skills
              .filter((s) => (s.group || "Other") === g)
              .map((s) => (
                <span key={s.id} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-tag)] border border-line bg-surface pl-2.5 pr-1 text-[13px]">
                  {s.name}
                  <button
                    type="button"
                    aria-label={`Remove ${s.name}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] text-muted hover:bg-gap-bg hover:text-gap-text"
                    onClick={() =>
                      onRemove(s.name, doc, {
                        ...doc,
                        skills: doc.skills.filter((x) => x.id !== s.id),
                        experiences: doc.experiences.map((e) => ({ ...e, skillIds: e.skillIds.filter((x) => x !== s.id) })),
                        projects: doc.projects.map((p) => ({ ...p, skillIds: p.skillIds.filter((x) => x !== s.id) })),
                      })
                    }
                  >
                    <IconX />
                  </button>
                </span>
              ))}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
        <TextField
          label="Skill"
          value={name}
          onChange={(v) => {
            setName(v);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. Playwright"
          maxLength={100}
          error={error ?? undefined}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="skill-group" className="text-[13px] font-medium text-ink-2">Group</label>
          <select id="skill-group" className="field" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option>Technical</option>
            <option>Tools</option>
            <option>Soft skills</option>
            <option>Other</option>
          </select>
        </div>
        <button type="button" className="btn btn-secondary press" onClick={add}>
          <IconPlus /> Add
        </button>
      </div>
    </section>
  );
}
