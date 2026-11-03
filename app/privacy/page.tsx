import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, operator } from "@/components/legal/LegalPage";
import { CONSENT_POINTS } from "@/lib/consent";

export const metadata: Metadata = { title: "Privacy policy" };

// Plain description of what the app actually does with data. Have it reviewed
// by a lawyer before public launch (see README, "Before launch").
export default function PrivacyPage() {
  const op = operator();
  return (
    <LegalPage title="Privacy policy" updated="3 November 2026">
      <p>
        Cvidence helps you write job applications from your own profile. This page says what we collect, why, where it goes and how to remove it. It&apos;s written to meet India&apos;s Digital Personal Data Protection Act, 2023.
      </p>

      <h2>Who is responsible</h2>
      <p>
        {op.name ? <>Cvidence is run by {op.name}.</> : <>The operator&apos;s name will be published here before public launch.</>}{" "}
        {op.email ? <>For any privacy question, request or complaint, email <a href={`mailto:${op.email}`}>{op.email}</a>.</> : <>A contact email for privacy requests will be published here before public launch.</>}
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your sign-in email address.</li>
        <li>Your profile: what you type or import (name, headline, city, phone, links, summary, roles, projects, education, certifications, skills, languages).</li>
        <li>Job descriptions you paste or start from Find Jobs, and what Cvidence drafts from them (resumes, cover letters, emails, their versions, and your refine chat).</li>
        <li>Your notes, the jobs you save, dismiss or score, your application statuses, and your daily agent settings.</li>
        <li>Usage records for AI credits: which task ran, when, and how many tokens it used. Not the text itself.</li>
      </ul>
      <p>We don&apos;t use advertising trackers and we don&apos;t sell or share your data for marketing.</p>

      <h2>What you agree to before AI is used</h2>
      <ul>
        {CONSENT_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h2>Who processes it for us</h2>
      <ul>
        <li>Supabase: database and sign-in.</li>
        <li>Vercel: hosts the app.</li>
        <li>Google (Gemini API), and OpenRouter as a backup: run the AI steps on the text each step needs.</li>
        <li>Resend: sends the morning email, if you turn it on. It sees your email address and the job titles in that email.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>Until you delete it or your account. Deleting your account removes your data from our database straight away. Usage records are removed with the account.</p>

      <h2>Your rights</h2>
      <ul>
        <li>See and download all your data: <Link href="/settings">Settings → Download my data</Link>.</li>
        <li>Correct it: edit your profile at any time.</li>
        <li>Withdraw consent for AI: Settings → Withdraw consent. AI steps and the daily agent stop.</li>
        <li>Erase it: Settings → Delete my account.</li>
        <li>Complain: contact us using the details above. If you&apos;re not satisfied, you can approach the Data Protection Board of India.</li>
      </ul>

      <h2>Security</h2>
      <p>Your rows are protected in the database so only your account can read them. Secrets stay on the server. Nothing is ever sent to an employer: you apply yourself.</p>

      <h2>Changes</h2>
      <p>If what we do with your data changes, we update this page and ask for your consent again before any new use.</p>
    </LegalPage>
  );
}
