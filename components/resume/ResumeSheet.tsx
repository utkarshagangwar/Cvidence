import { contactParts, gradeLabel, skillLines } from "@/lib/export/format";
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
  const contact = contactParts(data);
  const skills = skillLines(data);
  const heading = "m-0 break-after-avoid border-b border-line-soft pb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted print:border-black/40 print:text-black";
  const meta = "font-sans text-[13px] text-muted print:text-black/75";
  const list = "m-0 flex list-disc flex-col gap-1 pl-[18px] text-[14.5px] leading-[1.5] marker:text-subtle print:marker:text-black";
  // One entry header: what (bold) and when (right, never wraps), then where.
  const entryHead = (title: React.ReactNode, when: string, where: string) => (
    <div className="flex flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 text-[15px]">
        <b className="min-w-0">{title}</b>
        {when && <span className={`${meta} whitespace-nowrap`}>{when}</span>}
      </div>
      {where && <span className={meta}>{where}</span>}
    </div>
  );

  return (
    <article className="resume-sheet flex flex-col gap-4 rounded-[4px] border border-line bg-sheet px-6 py-8 font-display text-ink sm:px-11 sm:py-10 print:border-0 print:p-0">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">{b.name || "Your name"}</h1>
        {b.headline && <p className="m-0 font-sans text-[14px] font-medium text-ink-2 print:text-black">{b.headline}</p>}
        {contact.length > 0 && <p className={`m-0 break-words ${meta}`}>{contact.join("  |  ")}</p>}
      </header>

      {resume.summary.text && (
        <section className="flex flex-col gap-2">
          <h2 className={heading}>Summary</h2>
          <p className="m-0 text-[14.5px] leading-[1.55]">{line(resume.summary)}</p>
        </section>
      )}

      {resume.roles.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={heading}>Experience</h2>
          {resume.roles.map((r) => {
            const m = frame.roles[r.experienceId];
            if (!m) return null;
            return (
              <div key={r.experienceId} className="flex flex-col gap-1.5 break-inside-avoid">
                {entryHead(m.title, m.dates, [m.company, m.location].filter(Boolean).join(" · "))}
                {r.bullets.length > 0 && (
                  <ul className={list}>
                    {r.bullets.map((u) => (
                      <li key={u.id}>{line(u)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {resume.projects.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={heading}>Projects</h2>
          {resume.projects.map((p) => {
            const m = frame.projects[p.projectId];
            if (!m) return null;
            return (
              <div key={p.projectId} className="flex flex-col gap-1 break-inside-avoid">
                {entryHead(m.name, "", m.url)}
                {p.bullets.length > 0 && (
                  <ul className={list}>
                    {p.bullets.map((u) => (
                      <li key={u.id}>{line(u)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {skills.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={heading}>Skills</h2>
          <div className="flex flex-col gap-1 text-[14.5px] leading-[1.5]">
            {skills.map((g) => (
              <p key={g.group || "all"} className="m-0">
                {g.group && <b>{g.group}: </b>}
                {g.names.join(", ")}
              </p>
            ))}
          </div>
        </section>
      )}

      {frame.education.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className={heading}>Education</h2>
          {frame.education.map((e, i) => (
            <div key={i} className="break-inside-avoid">
              {entryHead([e.degree, e.field].filter(Boolean).join(", ") || e.institution, e.dates, [e.degree || e.field ? e.institution : "", gradeLabel(e.grade)].filter(Boolean).join(" · "))}
            </div>
          ))}
        </section>
      )}

      {frame.certifications.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className={heading}>Certifications</h2>
          {frame.certifications.map((c, i) => (
            <div key={i} className="break-inside-avoid">
              {entryHead(c.name, c.dates, c.issuer)}
            </div>
          ))}
        </section>
      )}

      {frame.languages && frame.languages.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={heading}>Languages</h2>
          <p className="m-0 text-[14.5px]">{frame.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(", ")}</p>
        </section>
      )}
    </article>
  );
}
