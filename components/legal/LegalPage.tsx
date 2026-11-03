import Link from "next/link";
import { Lockup } from "@/components/brand/Logo";

/** Operator details come from env, so these pages never show made-up names or addresses. */
export function operator() {
  return {
    name: process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || null,
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null,
  };
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-4 py-4 md:px-8">
          <Link href="/" className="no-underline" aria-label="Cvidence home">
            <Lockup />
          </Link>
          <nav className="flex gap-4 text-[14px]">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-[760px] flex-col gap-5 px-4 py-10 md:px-8 [&_h2]:mb-0 [&_h2]:mt-4 [&_h2]:text-[20px] [&_li]:mb-1.5 [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-ink-2 [&_ul]:m-0 [&_ul]:max-w-[68ch] [&_ul]:pl-5 [&_ul]:text-ink-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[32px] leading-tight tracking-[-0.01em]">{title}</h1>
          <span className="text-[13px] text-subtle">Last updated {updated}</span>
        </div>
        {children}
      </main>
    </div>
  );
}
