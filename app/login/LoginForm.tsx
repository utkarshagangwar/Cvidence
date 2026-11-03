"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cloudflare Turnstile bot check on the email link. Only on when a site key is
// set; Supabase Auth verifies the token (Auth > Attack Protection > CAPTCHA).
const TURNSTILE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [googleBusy, setGoogleBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_KEY || !scriptReady || !box.current || widget.current || !window.turnstile) return;
    widget.current = window.turnstile.render(box.current, {
      sitekey: TURNSTILE_KEY,
      theme: "light",
      callback: (t: string) => setCaptcha(t),
      "expired-callback": () => setCaptcha(null),
      "error-callback": () => setCaptcha(null),
    });
  }, [scriptReady]);

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setState({ kind: "error", message: "Enter an email address like name@example.com." });
      return;
    }
    if (TURNSTILE_KEY && !captcha) {
      setState({ kind: "error", message: "Complete the quick check below the email field first." });
      return;
    }
    setState({ kind: "sending" });
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: value,
        options: { emailRedirectTo: callbackUrl(), ...(captcha ? { captchaToken: captcha } : {}) },
      });
      if (error) throw error;
      setState({ kind: "sent", email: value });
    } catch {
      setState({ kind: "error", message: "We couldn't send the link. Wait a minute and try again." });
    } finally {
      // A token works once: get a fresh one for the next try.
      if (widget.current && window.turnstile) {
        window.turnstile.reset(widget.current);
        setCaptcha(null);
      }
    }
  }

  async function google() {
    setGoogleBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
      if (error) throw error;
    } catch {
      setGoogleBusy(false);
      setState({ kind: "error", message: "Google sign-in isn't available right now. Use the email link instead." });
    }
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <h2 className="m-0 text-[18px]">Check your inbox</h2>
        <p className="m-0 text-ink-2">
          We sent a sign-in link to <b className="font-semibold">{state.email}</b>. It works once and expires in an hour.
        </p>
        <button type="button" className="btn btn-secondary self-start" onClick={() => setState({ kind: "idle" })}>
          Use a different email
        </button>
      </div>
    );
  }

  const sending = state.kind === "sending";
  const error = state.kind === "error" ? state.message : null;

  return (
    <div className="flex flex-col gap-5">
      <button type="button" className="btn btn-secondary w-full" onClick={google} disabled={googleBusy || sending}>
        <GoogleGlyph />
        {googleBusy ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 text-[12px] text-subtle" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <form className="flex flex-col gap-2" onSubmit={sendLink} noValidate>
        <label htmlFor="email" className="text-[13px] font-medium text-ink-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@example.com"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          maxLength={320}
          required
        />
        {TURNSTILE_KEY && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
            <div ref={box} className="mt-1 min-h-[65px]" />
          </>
        )}
        {error && (
          <p id="login-error" role="alert" className="m-0 text-[13px] text-gap-text">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary mt-2 w-full" disabled={sending || googleBusy}>
          {sending ? "Sending link…" : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
