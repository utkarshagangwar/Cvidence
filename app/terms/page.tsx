import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, operator } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  const op = operator();
  return (
    <LegalPage title="Terms of use" updated="3 November 2026">
      <p>These terms cover your use of Cvidence. By signing in you agree to them.</p>

      <h2>What Cvidence does</h2>
      <p>
        It drafts resumes, cover letters and outreach emails from the profile you give it, and helps you find and track jobs. It never applies, emails an employer or contacts anyone for you.
      </p>

      <h2>Your part</h2>
      <ul>
        <li>Keep your profile truthful. Cvidence only rewrites what you gave it and flags anything it can&apos;t trace (&quot;Check this&quot;), but you&apos;re responsible for what you send.</li>
        <li>Read every draft before you use it. AI can make mistakes.</li>
        <li>Use it for your own job search, one account per person. Don&apos;t try to get around the daily credits, rate limits or security checks.</li>
      </ul>

      <h2>Job listings</h2>
      <p>
        Jobs come from companies&apos; public career boards. We don&apos;t check them and aren&apos;t part of any hiring decision. Apply through the company&apos;s own page.
      </p>

      <h2>Free service and limits</h2>
      <p>
        Cvidence is free during early access. Each account gets a number of AI credits per day (reset at midnight IST), and AI may pause for everyone when the day&apos;s shared budget runs out. Features can change.
      </p>

      <h2>Your data</h2>
      <p>
        You own your profile and documents. How we handle them is in the <Link href="/privacy">privacy policy</Link>. You can download or delete everything at any time.
      </p>

      <h2>No guarantee</h2>
      <p>The service is provided as it is. We can&apos;t promise interviews or offers, or that it will always be available.</p>

      <h2>Contact</h2>
      <p>{op.email ? <>Questions: <a href={`mailto:${op.email}`}>{op.email}</a>.</> : <>A contact email will be published here before public launch.</>}</p>
    </LegalPage>
  );
}
