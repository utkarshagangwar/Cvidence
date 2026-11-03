import { mkdirSync, writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { test as setup } from "@playwright/test";

// Signs the E2E test account in with a password and saves the exact cookies
// @supabase/ssr would set, so tests start logged in without the email flow.
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// E2E_USER_EMAIL and E2E_USER_PASSWORD (from .env.local; never committed).

setup("sign in test account", async ({ baseURL }) => {
  const url = must("NEXT_PUBLIC_SUPABASE_URL");
  const key = must("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const jar = new Map<string, string>();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => {
        for (const { name, value } of items) jar.set(name, value);
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: must("E2E_USER_EMAIL"),
    password: must("E2E_USER_PASSWORD"),
  });
  if (error) throw new Error(`E2E sign-in failed: ${error.message}`);

  const host = new URL(baseURL ?? "http://localhost:3000").hostname;
  const cookies = [...jar].map(([name, value]) => ({
    name,
    value,
    domain: host,
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));

  mkdirSync("tests/e2e/.auth", { recursive: true });
  writeFileSync("tests/e2e/.auth/user.json", JSON.stringify({ cookies, origins: [] }));
});

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} for E2E tests`);
  return v;
}
