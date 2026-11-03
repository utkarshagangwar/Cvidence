# Cvidence — product truth

Source: "Cvidence — Implementation Plan" (2 Nov 2026) and the "Cvidence — Platform Designs" canvas (Direction A, Casefile).

- **What it is:** a free, multi-user job-search workspace. One master profile; for each job description it drafts a tailored resume, cover letter and outreach email that use only facts from that profile.
- **Who uses it:** job seekers in India first (Bengaluru, remote in India), early-career engineers and QA folks applying to several roles a week, mostly on a laptop, sometimes on a phone.
- **Core job:** paste a JD → see how you match (covered / partial / gap) → get a resume where every line shows which part of your profile it came from.
- **Promise:** every line, backed. The app never invents experience, never auto-applies, and flags anything it can't trace ("Check this").
- **Surfaces:** Operate mode (app UI). Dashboard, Find jobs, Applications, Profile, Settings. Marketing pages come later.
- **Visual authority:** the Casefile canvas. Paper #F1F3F2, Ink #16201D, Ledger teal #0F5C55, Source mint #6FC2B4; Source Serif 4 for headings, IBM Plex Sans for UI, IBM Plex Mono for numbers and source tags. Footnote C logo.
- **Hard rules:** JD text is untrusted data; AI credits are charged server-side only; resumes are personal data (RLS on every row, export and delete on request).
