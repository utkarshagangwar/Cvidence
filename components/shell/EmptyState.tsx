import Link from "next/link";

interface Action {
  href: string;
  label: string;
}

export function EmptyState({
  title,
  body,
  action,
  note,
}: {
  title: string;
  body: string;
  action?: Action;
  /** Short line about when something will be available. */
  note?: string;
}) {
  return (
    <section className="card flex flex-col items-start gap-3 p-6">
      <h2 className="m-0 text-[18px]">{title}</h2>
      <p className="m-0 max-w-[60ch] text-ink-2">{body}</p>
      {action && (
        <Link href={action.href} className="btn btn-primary mt-1">
          {action.label}
        </Link>
      )}
      {note && <p className="m-0 text-[12px] text-subtle">{note}</p>}
    </section>
  );
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="m-0 text-[30px] leading-[1.15] tracking-[-0.01em]">{title}</h1>
        {intro && <p className="m-0 max-w-[65ch] text-muted">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
