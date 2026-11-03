// What the person agrees to before any AI step runs (India's DPDP Act asks for
// consent that is specific, informed and easy to withdraw). Bump the version
// whenever these points change, so everyone is asked again.

export const CONSENT_VERSION = "2026-11-03";

export const CONSENT_POINTS = [
  "Your profile and the job posts you paste are stored in our Supabase database, protected so only you can read them.",
  "When you use an AI step, the text it needs is sent to Google Gemini (and OpenRouter if Gemini is down). Importing a resume sends the whole file text, contact details included. Tailoring, letters and scoring send your profile without your email or phone.",
  "On free AI plans, Google may use what's sent to improve its products. We'll move to a paid plan before this changes for you, and update this notice.",
  "Your notes are never sent to an AI. Nothing is ever sent to an employer: you apply yourself.",
  "You can download everything or delete your account at any time in Settings. Deleting removes all your data right away.",
] as const;
