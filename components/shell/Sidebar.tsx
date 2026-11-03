"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lockup } from "@/components/brand/Logo";
import { IconDashboard, IconFolder, IconSearch, IconSliders, IconUser } from "./icons";

const NAV = [
  { href: "/dashboard", label: "Dashboard", short: "Home", Icon: IconDashboard },
  { href: "/jobs", label: "Find jobs", short: "Jobs", Icon: IconSearch },
  { href: "/applications", label: "Applications", short: "Applied", Icon: IconFolder },
  { href: "/profile", label: "Profile", short: "Profile", Icon: IconUser },
  { href: "/settings", label: "Settings", short: "Settings", Icon: IconSliders },
] as const;

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

/** Desktop and tablet: the Casefile left rail. Hidden below md. */
export function Sidebar({ credits }: { credits: React.ReactNode }) {
  const isActive = useActive();

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-1 border-r border-line bg-rail px-3.5 py-5 md:flex"
    >
      <Link href="/dashboard" className="mb-4 rounded-[var(--radius-control)] px-2 py-1 no-underline">
        <Lockup />
      </Link>

      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-10 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 font-medium no-underline transition-colors duration-150 " +
                  (active
                    ? "bg-surface text-teal shadow-[inset_3px_0_0_var(--color-teal)]"
                    : "text-ink-2 hover:bg-surface/60 hover:text-ink")
                }
              >
                <Icon className="shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="grow" />
      {credits}
    </nav>
  );
}

/** Phone: a slim top bar (logo + credits) and a five-tab bar at the bottom. */
export function PhoneBars({ creditsLeft, creditsLimit }: { creditsLeft: number; creditsLimit: number }) {
  const isActive = useActive();

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-rail/95 px-4 backdrop-blur md:hidden">
        <Link href="/dashboard" className="no-underline">
          <Lockup />
        </Link>
        <span className="num rounded-[var(--radius-tag)] bg-surface px-2 py-1 text-[12px] text-ink-2 ring-1 ring-line">
          {creditsLeft}/{creditsLimit} credits
        </span>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-rail/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="m-0 grid list-none grid-cols-5 p-0">
          {NAV.map(({ href, short, label, Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium no-underline " +
                    (active ? "text-teal" : "text-muted")
                  }
                >
                  <Icon />
                  <span>{short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
