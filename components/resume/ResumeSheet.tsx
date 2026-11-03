import type { ResumeDocumentData } from "@/lib/tailor/frame";
import type { Flag, Unit } from "@/lib/tailor/types";

// The resume as a page: used on screen (with source tags and flags) and for
// print/PDF (plain). Single column, real text, standard headings, so ATS
// parsers read it in order.

export interface ResumeSheetProps {
  data: ResumeDocumentData;
  showTags?: boolean;
  /** Optional wrapper for each editable line (on-screen editing). */
  renderUnit?: (unit: Unit, flags: Flag[], body: React.ReactNode) => React.ReactNode;
}

function UnitText({ unit, flags, showTags }: { unit: Unit; flags: Flag[]; showTags: boolean }) {
  return (
    <>
      <span className={flags.length && showTags ? "check-underline" : undefined}>{unit.text}</span>
      {showTags &&
        unit.src.map((s) => (
          <span key={s} className="num ml-1.5 inline-block rounded-[3px] bg-teal-tint px-1.5 align-[1px] text-[11px] leading-[18px] text-teal print:hidden">
            {s}
          </span>
        ))}
      {showTags && flags.length > 0 && (
        <span className="ml-1.5 inline-block rounded-[3px] bg-partial-bg px-1.5 align-[1px] font-sans text-[11px] font-semibold leading-[18px] text-partial-text print:hidden">
          Check: {flags.map((f) => `“${f.token}”`).join(", ")} {flags.length === 1 ? "isn’t" : "aren’t"} in your profile
        </span>
      )}
    </>
  );
}

export function ResumeSheet({ data, showTags = false, renderUnit }: ResumeSheetProps) {
  const { resume, frame, flags } = data;
  const b = frame.basics;
  const flagsFor = (id: string) => flags.filter((f) => f.unitId === id);
  const line = (u: Unit) => {
    const f = flagsFor(u.id);
    const body = <UnitText unit={u} flags={f} showTags={showTags} />;
    return renderUnit ? renderUnit(u, f, body) : body;
  };
  const contact = [b.city, b.phone, b.email, ...b.links.map((l) => l.url)].filter(Boolean);
  const heading = "border-b border-line-soft pb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted print:text-black";

  return (
    <article className="resume-sheet flex flex-col gap-4 rounded-[4px] border border-line bg-sheet px-6 py-8 font-display text-ink sm:px-11 sm:py-10 print:border-0 print:p-0">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">{b.name || "Your name"}</h1>
        <p className="m-0 font-sans text-[13px] text-muted print:text-black">{[b.headline, ...contact].filter(Boolean).join(" · ")}</p>
      </header>

      {resume.summary.text && <p className="m-0 text-[15px] leading-[1.55]">{line(resume.summary)}</p>}

      {resume.roles.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className={heading}>Experience</h2>
          {resume.roles.map((r) => {
            const meta = frame.roles[r.experienceId];
            if (!meta) return null;
            return (
              <div key={r.experienceId} className="flex flex-col gap-1.5 break-inside-avoid">
                <div className="flex flex-wrap justify-between gap-x-3 text-[15px]">
                  <b>{meta.title} · {meta.company}</b>
                  <span className="font-sans text-[13px] text-muted print:text-black">{[meta.location, meta.dates].filter(Boolean).join(" · ")}</span>
                </div>
                <ul className="m-0 flex flex-col gap-1.5 pl-[18px] text-[14.5px] leading-[1.5]">
                  {r.bullets.map((u) => (
                    <li key={u.id}>{line(u)}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {resume.projects.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={heading}>Projects</h2>
          {resume.projects.map((p) => {
            const meta = frame.projects[p.projectId];
            if (!meta) return null;
            return (
              <div key={p.projectId} className="flex flex-col gap-1 break-inside-avoid text-[14.5px]">
                <b>{meta.name}</b>
                <ul className="m-0 flex flex-col gap-1 pl-[18px] leading-[1.5]">
                  {p.bullets.map((u) => (
                    <li key={u.id}>{line(u)}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {resume.skillIds.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={heading}>Skills</h2>
          <p className="m-0 text-[14.5px]">{resume.skillIds.map((id) => frame.skills[id]).filter(Boolean).join(" · ")}</p>
        </section>
      )}

      {frame.education.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={heading}>Education</h2>
          {frame.education.map((e, i) => (
            <div key={i} className="flex flex-wrap justify-between gap-x-3 text-[14.5px]">
              <span>
                <b>{[e.degree, e.field].filter(Boolean).join(", ")}</b>
                {e.degree || e.field ? " · " : ""}
                {e.institution}
                {e.grade ? ` · ${e.grade}` : ""}
              </span>
              <span className="font-sans text-[13px] text-muted print:text-black">{e.dates}</span>
            </div>
          ))}
        </section>
      )}

      {frame.certifications.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={heading}>Certifications</h2>
          {frame.certifications.map((c, i) => (
            <div key={i} className="text-[14.5px]">
              <b>{c.name}</b>
              {c.issuer ? ` · ${c.issuer}` : ""}
              {c.dates ? ` · ${c.dates}` : ""}
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
