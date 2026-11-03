// The morning digest email. Pure (no I/O), so it's unit-tested. Only job titles,
// companies and scores go in it: never resume text.

export interface DigestDraft {
  applicationId: string;
  title: string;
  company: string;
  score: number | null;
}

export interface DigestMatch {
  title: string;
  company: string;
  score: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildDigest(o: { name: string; siteUrl: string; drafts: DigestDraft[]; matches: DigestMatch[]; found: number; note: string | null }) {
  const base = o.siteUrl.replace(/\/$/, "");
  const hello = o.name ? `Good morning, ${o.name.split(/\s+/)[0]}.` : "Good morning.";
  const subject =
    o.drafts.length > 0
      ? `${o.drafts.length} draft${o.drafts.length === 1 ? "" : "s"} ready to review`
      : o.matches.length > 0
        ? `${o.matches.length} new job${o.matches.length === 1 ? "" : "s"} worth a look`
        : "No new matches today";

  const draftLines = o.drafts.map((d) => `- ${d.title} at ${d.company}${d.score !== null ? ` (fit ${d.score})` : ""}: ${base}/applications/${d.applicationId}`);
  const matchLines = o.matches.map((m) => `- ${m.title} at ${m.company} (fit ${m.score})`);
  const text = [
    hello,
    "",
    o.drafts.length ? "Drafted for you (nothing has been sent; review each one before you apply):" : `The agent checked ${o.found} matching jobs and drafted nothing today.`,
    ...draftLines,
    ...(matchLines.length ? ["", "Also worth a look:", ...matchLines] : []),
    ...(o.note ? ["", o.note] : []),
    "",
    `Review: ${base}/dashboard`,
    `Turn the agent or this email off: ${base}/settings`,
  ].join("\n");

  const li = (inner: string) => `<li style="margin:0 0 8px">${inner}</li>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f3f2;font-family:Arial,Helvetica,sans-serif;color:#16201d">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-size:18px;margin:0 0 16px">${esc(hello)}</p>
${
  o.drafts.length
    ? `<p style="margin:0 0 8px">Drafted for you. Nothing has been sent: review each one before you apply.</p><ul style="padding-left:18px;margin:0 0 16px">${o.drafts
        .map((d) => li(`<a href="${esc(`${base}/applications/${d.applicationId}`)}" style="color:#0f5c55;font-weight:bold">${esc(d.title)}</a> at ${esc(d.company)}${d.score !== null ? ` <span style="color:#4e5a56">(fit ${d.score})</span>` : ""}`))
        .join("")}</ul>`
    : `<p style="margin:0 0 16px">The agent checked ${o.found} matching jobs and drafted nothing today.</p>`
}
${o.matches.length ? `<p style="margin:0 0 8px">Also worth a look:</p><ul style="padding-left:18px;margin:0 0 16px">${o.matches.map((m) => li(`${esc(m.title)} at ${esc(m.company)} <span style="color:#4e5a56">(fit ${m.score})</span>`)).join("")}</ul>` : ""}
${o.note ? `<p style="margin:0 0 16px;color:#7e5300">${esc(o.note)}</p>` : ""}
<p style="margin:20px 0"><a href="${esc(`${base}/dashboard`)}" style="background:#0f5c55;color:#f4f7f6;padding:10px 16px;border-radius:6px;text-decoration:none">Open your review queue</a></p>
<p style="font-size:12px;color:#5f6b67;margin:24px 0 0">Cvidence never applies for you. <a href="${esc(`${base}/settings`)}" style="color:#5f6b67">Turn the agent or this email off</a>.</p>
</div></body></html>`;

  return { subject, text, html };
}
