import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomePage } from "@/components/marketing/HomePage";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Cvidence · Tailored resumes where every line is backed" },
  description:
    "Paste a job description and get a resume tailored from your own profile, with a source on every line and a flag on anything it can't trace. Free for job seekers in India.",
};

// Signed-in people go to their dashboard; everyone else sees the home page.
export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");
  return <HomePage />;
}
