import "server-only";
// Sends one email through Resend's HTTP API. Logs never include the address or body.

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class EmailNotConfigured extends Error {
  constructor() {
    super("Email isn't set up on this server (RESEND_API_KEY, RESEND_FROM).");
    this.name = "EmailNotConfigured";
  }
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(msg: OutgoingEmail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) throw new EmailNotConfigured();
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    signal: AbortSignal.timeout(20_000),
  });
  // Never include the response body: it can echo the address.
  if (!res.ok) throw new Error(`Resend returned HTTP ${res.status}`);
}
