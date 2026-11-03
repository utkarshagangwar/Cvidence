import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request and sends signed-out
// visitors away from app pages. This is a convenience redirect only: every app
// page and API route checks the user again on the server.

const APP_PREFIXES = ["/dashboard", "/jobs", "/applications", "/profile", "/settings", "/print"];

const IP_LIMIT_PER_MINUTE = 60;

/**
 * Per-IP limit on writes (server actions are POSTs) and API calls, counted in
 * Postgres so it holds across serverless instances. The IP is hashed before it
 * is stored. If the counter itself is down we let the request through: the
 * per-user AI limit and credits still protect the expensive paths.
 */
async function ipLimited(request: NextRequest): Promise<boolean> {
  const path = request.nextUrl.pathname;
  const isWrite = request.method !== "GET" && request.method !== "HEAD";
  if (!(isWrite || path.startsWith("/api/")) || path.startsWith("/api/worker/")) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return false;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`cvidence-ip:${ip}`));
  const hash = Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    const res = await fetch(`${url}/rest/v1/rpc/hit_rate_limit`, {
      method: "POST",
      headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ p_key: `ip:${hash}`, p_max: IP_LIMIT_PER_MINUTE, p_window_seconds: 60 }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    return (await res.json()) === false;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  if (await ipLimited(request)) {
    return NextResponse.json({ error: "Too many requests from your network. Wait a minute and try again." }, { status: 429, headers: { "retry-after": "60" } });
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
