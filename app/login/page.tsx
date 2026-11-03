import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { safeNextPath } from "@/lib/safe-redirect";
import { getUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getUser()) redirect(next);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <LogoMark size={48} />
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[28px] leading-tight tracking-[-0.01em]">Sign in to Cvidence</h1>
            <p className="m-0 text-balance text-muted">Every line of your resume, backed by your own profile.</p>
          </div>
        </div>

        <section className="card flex flex-col gap-5 p-6" aria-label="Sign in">
          {params.error === "link" && (
            <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-gap-bg px-3 py-2.5 text-[13px] text-gap-text">
              That sign-in link has expired or was already used. Ask for a new one below.
            </p>
          )}
          <LoginForm next={next} />
        </section>

        <p className="m-0 text-balance text-center text-[12px] text-subtle">
          Free while in early access. Your profile is private to you, and you can delete it any time.
        </p>
      </div>
    </main>
  );
}
