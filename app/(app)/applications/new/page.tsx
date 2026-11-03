import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/EmptyState";
import { NewApplicationForm } from "./NewApplicationForm";

export const metadata: Metadata = { title: "New application" };

export default function NewApplicationPage() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-subtle">
          <Link href="/applications">Applications</Link> / New
        </span>
        <PageHeader title="Paste a job description" intro="Cvidence reads it, lists every requirement, and checks each one against your profile." />
      </div>
      <NewApplicationForm />
    </>
  );
}
