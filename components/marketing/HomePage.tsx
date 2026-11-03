import Link from "next/link";
import { Lockup, LogoMark } from "@/components/brand/Logo";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { TASK_CREDITS } from "@/lib/quota/credits";
import { HeroPreview } from "./HeroPreview";
import { MatchMeter } from "./MatchMeter";
import { Reveal } from "./Reveal";

const SIGNUP = { href: "/login", label: "Start free" };

function Soon({ feature }: { feature: FeatureKey }) {
  if (FEATURES[feature].live) return null;
  return (
    <span className="rounded-[var(--radius-tag)] bg-well px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">
      Coming soon
    </span>
  );
}

export function HomePage() {
  return (
    <div className="bg-paper text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-sheet focus:px-3 focus:py-2">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-8">
          <Link href="/" className="no-underline" aria-label="Cvidence home">
            <Lockup />
          </Link>
          <ul className="m-0 hidden list-none items-center gap-7 p-0 text-[14px] font-medium md:flex">
            <li><a href="#how" className="text-ink-2 no-underline hover:text-ink">How it works</a></li>
            <li><a href="#features" className="text-ink-2 no-underline hover:text-ink">Features</a></li>
            <li><a href="#free" className="text-ink-2 no-underline hover:text-ink">Pricing</a></li>
          </ul>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn hidden text-ink-2 hover:text-ink sm:inline-flex">Sign in</Link>
            <Link href={SIGNUP.href} className="btn btn-primary press">{SIGNUP.label}</Link>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* Hero: asymmetric split, message left, live product preview right */}
        <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-20 pt-14 md:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:pb-28 lg:pt-20">
          <div className="hero-copy flex min-w-0 flex-col items-start gap-6">
            <h1 className="m-0 text-[clamp(2.4rem,5.2vw,4.1rem)] leading-[1.04] tracking-[-0.025em]">
              Every resume line, backed by your profile.
            </h1>
            <p className="m-0 max-w-[44ch] text-[17px] leading-relaxed text-ink-2">
              Paste a job description. Cvidence tailors your resume from your own facts and flags anything it can’t trace.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={SIGNUP.href} className="btn btn-primary press h-12 px-6 text-[15px]">{SIGNUP.label}</Link>
              <a href="#how" className="btn btn-secondary press h-12 px-6 text-[15px]">See how it works</a>
            </div>
          </div>
          <div className="min-w-0">
            <HeroPreview />
          </div>
        </section>

        {/* Promise strip: full-width ink band */}
        <section aria-label="What Cvidence never does" className="bg-ink text-paper">
          <div className="mx-auto grid max-w-[1200px] gap-px bg-white/10 px-0 md:grid-cols-4">
            {[
              ["Never invents experience", "Numbers, employers and skills come from your profile, or get flagged."],
              ["Never auto-applies", "You read and send every application yourself."],
              ["Never scrapes LinkedIn", "Jobs come only from public company career boards."],
              ["Never sells your data", "Export it or delete your account whenever you like."],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 80} className="flex flex-col gap-2 bg-ink px-6 py-8 md:px-7">
                <span className="font-display text-[19px] font-semibold text-paper">{title}</span>
                <span className="text-[14px] leading-relaxed text-ink-soft">{body}</span>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works: vertical timeline that draws as you scroll */}
        <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 md:px-8 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
            <div className="flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
              <h2 className="m-0 text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.1] tracking-[-0.02em]">
                From job post to a resume you can defend.
              </h2>
              <p className="m-0 max-w-[48ch] text-[16px] leading-relaxed text-ink-2">
                Code decides what’s true. The AI only writes, and every line it writes points back to a role or project you added.
              </p>
            </div>

            <ol className="timeline relative m-0 flex list-none flex-col gap-10 p-0 pl-10">
              <Reveal as="li" className="relative flex flex-col gap-3">
                <span className="tl-dot" aria-hidden="true" />
                <h3 className="m-0 text-[21px]">Paste the job description</h3>
                <p className="m-0 max-w-[52ch] text-ink-2">
                  Cvidence pulls out the title, location and every requirement: skills, years, languages. The posting is read as data, so text hidden in it can’t steer the AI.
                </p>
              </Reveal>
              <Reveal as="li" className="relative flex flex-col gap-3">
                <span className="tl-dot" aria-hidden="true" />
                <h3 className="m-0 text-[21px]">See exactly how you match</h3>
                <p className="m-0 max-w-[52ch] text-ink-2">
                  Each requirement is covered, partial or a gap, worked out from your profile. Years come from your dates, not a guess.
                </p>
                <div className="mt-2 max-w-[460px]">
                  <MatchMeter />
                </div>
              </Reveal>
              <Reveal as="li" className="relative flex flex-col gap-3">
                <span className="tl-dot" aria-hidden="true" />
                <h3 className="m-0 flex flex-wrap items-center gap-3 text-[21px]">
                  Get a resume with sources <Soon feature="tailor" />
                </h3>
                <p className="m-0 max-w-[52ch] text-ink-2">
                  Bullets are reordered and rewritten for the role, each tagged with where it came from. Edit any line, regenerate one, or undo to an earlier version, then export PDF or DOCX.
                </p>
              </Reveal>
            </ol>
          </div>
        </section>

        {/* Features: five-cell bento with varied grounds */}
        <section id="features" className="scroll-mt-20 bg-rail py-20 lg:py-28">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 md:px-8">
            <h2 className="m-0 max-w-[22ch] text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.1] tracking-[-0.02em]">
              Everything a job search needs, in one place.
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
              <Reveal as="article" className="bento md:col-span-4 bg-sheet">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="m-0 text-[20px]">Find jobs worth applying to</h3>
                  <Soon feature="jobs" />
                </div>
                <p className="m-0 max-w-[52ch] text-ink-2">
                  Fresh openings from Greenhouse, Lever, Ashby and Workable company boards, filtered free by code, then scored against your profile with reasons.
                </p>
                <div className="funnel mt-auto grid grid-cols-3 gap-2" aria-label="Example search funnel">
                  {[
                    ["found", "1,284"],
                    ["after filters", "63"],
                    ["scored for you", "12"],
                  ].map(([label, n], i) => (
                    <div key={label} className="funnel-step rounded-[8px] bg-well px-3 py-3" style={{ "--i": i } as React.CSSProperties}>
                      <div className="num text-[26px] leading-none text-ink">{n}</div>
                      <div className="mt-1 text-[12px] text-muted">{label}</div>
                    </div>
                  ))}
                </div>
                <span className="text-[11px] text-subtle">Example numbers</span>
              </Reveal>

              <Reveal as="article" delay={80} className="bento md:col-span-2 bg-teal-tint">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="m-0 text-[20px] text-teal-ink">Track every application</h3>
                  <Soon feature="tracker" />
                </div>
                <p className="m-0 text-teal-ink/80">Drag cards from Draft to Applied, Interview and Offer. Your funnel updates itself.</p>
                <div className="mt-auto flex gap-1.5" aria-hidden="true">
                  {["Draft", "Applied", "Interview", "Offer"].map((s, i) => (
                    <div key={s} className="flex flex-1 flex-col gap-1.5">
                      <span className="text-[10.5px] font-semibold text-teal-ink/70">{s}</span>
                      {Array.from({ length: 3 - Math.min(i, 2) }).map((_, j) => (
                        <span key={j} className="board-card h-5 rounded-[4px] bg-sheet/90 ring-1 ring-teal/15" />
                      ))}
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal as="article" className="bento md:col-span-2 bg-sheet">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="m-0 text-[20px]">Cover letter and outreach email</h3>
                  <Soon feature="letters" />
                </div>
                <p className="m-0 text-ink-2">Same rule as the resume. Gaps are addressed honestly, never papered over. Copy or open in your mail app.</p>
              </Reveal>

              <Reveal as="article" delay={80} className="bento md:col-span-2 bg-ink text-paper">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="m-0 text-[20px] text-paper">A morning shortlist</h3>
                  <Soon feature="agent" />
                </div>
                <p className="m-0 text-ink-soft">Turn on the daily agent and wake up to your top five matches, drafted and waiting for your review. Off until you switch it on.</p>
              </Reveal>

              <Reveal as="article" delay={160} className="bento md:col-span-2 bg-sheet">
                <h3 className="m-0 text-[20px]">Private by default</h3>
                <p className="m-0 text-ink-2">Your profile is locked to your account in the database. Export everything as one file, or delete it all.</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Free: credit ledger as a receipt */}
        <section id="free" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 md:px-8 lg:py-28">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-20">
            <div className="flex flex-col gap-4">
              <h2 className="m-0 text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.1] tracking-[-0.02em]">Free. 25 AI credits a day.</h2>
              <p className="m-0 max-w-[46ch] text-[16px] leading-relaxed text-ink-2">
                Enough for about three full applications. Credits reset at midnight IST, and you get them back if a step fails.
              </p>
            </div>
            <Reveal className="card receipt overflow-hidden">
              <ul className="m-0 flex list-none flex-col p-0">
                {(
                  [
                    ["Read a job description", TASK_CREDITS.extract],
                    ["Match it to your profile", TASK_CREDITS.match],
                    ["Tailor your resume", TASK_CREDITS.tailor_resume],
                    ["Write a cover letter", TASK_CREDITS.cover_letter],
                    ["Write an outreach email", TASK_CREDITS.outreach_email],
                  ] as const
                ).map(([label, n]) => (
                  <li key={label} className="flex items-center justify-between gap-4 px-5 py-3 [&+&]:border-t [&+&]:border-dashed [&+&]:border-line">
                    <span>{label}</span>
                    <span className="num text-ink-2">{n}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-4 border-t-2 border-ink bg-surface px-5 py-4">
                <span className="font-semibold">One full application</span>
                <span className="num text-[18px] font-medium">
                  {TASK_CREDITS.extract + TASK_CREDITS.match + TASK_CREDITS.tailor_resume + TASK_CREDITS.cover_letter + TASK_CREDITS.outreach_email}
                </span>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Closing call */}
        <section className="mx-auto max-w-[1200px] px-4 pb-20 md:px-8 lg:pb-28">
          <Reveal className="flex flex-col items-start gap-6 rounded-[var(--radius-card)] bg-teal px-6 py-12 text-on-teal md:flex-row md:items-center md:justify-between md:px-12">
            <div className="flex items-center gap-5">
              <LogoMark size={56} title="" />
              <h2 className="m-0 max-w-[24ch] text-[clamp(1.6rem,2.8vw,2.25rem)] leading-[1.15] text-on-teal">
                Start with your profile. The rest follows from it.
              </h2>
            </div>
            <Link href={SIGNUP.href} className="btn press h-12 shrink-0 bg-paper px-6 text-[15px] text-teal hover:bg-sheet">
              {SIGNUP.label}
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-[13px] text-muted md:flex-row md:items-center md:justify-between md:px-8">
          <Lockup />
          <span>Free while in early access, for job seekers in India.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="text-ink-2">Privacy</Link>
            <Link href="/terms" className="text-ink-2">Terms</Link>
            <Link href="/login" className="text-ink-2">Sign in</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
