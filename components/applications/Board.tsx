"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { setStatusAction } from "@/app/(app)/applications/actions";
import { StatusSelect, STATUS_OPTIONS } from "@/components/applications/StatusSelect";

export interface BoardItem {
  id: string;
  title: string;
  company: string;
  status: string;
  covered: number | null;
  total: number | null;
  updated_at: string;
}

const DOT: Record<string, string> = {
  draft: "bg-line-strong",
  applied: "bg-teal",
  interview: "bg-partial",
  offer: "bg-covered",
  closed: "bg-subtle",
};

/**
 * Drag a card to another column, or use the status menu on the card (keyboard
 * and phone friendly). Both go through the same action, which records history.
 */
export function Board({ items }: { items: BoardItem[] }) {
  const [list, setList] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setList(items), [items]);

  const move = (id: string, to: string) => {
    const card = list.find((i) => i.id === id);
    if (!card || card.status === to) return;
    const from = card.status;
    setList((l) => l.map((i) => (i.id === id ? { ...i, status: to } : i)));
    setError(null);
    start(async () => {
      const res = await setStatusAction(id, to);
      if (res.status === "error") {
        setList((l) => l.map((i) => (i.id === id ? { ...i, status: from } : i)));
        setError(res.message);
      }
    });
  };

  return (
    <>
      {error && <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-gap-bg px-3 py-2.5 text-[13px] text-gap-text">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Applications board">
        {STATUS_OPTIONS.map(([status, label]) => {
          const cards = list.filter((i) => i.status === status);
          return (
            <section
              key={status}
              aria-label={`${label}, ${cards.length}`}
              className={`flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border p-2 transition-colors ${over === status ? "border-teal bg-teal-tint" : "border-line-soft bg-well"}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) move(dragId, status);
                setDragId(null);
                setOver(null);
              }}
            >
              <h2 className="m-0 flex items-center justify-between px-1.5 pt-1 font-sans text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${DOT[status]}`} aria-hidden="true" />
                  {label}
                </span>
                <span className="num font-normal text-subtle">{cards.length}</span>
              </h2>
              {cards.length === 0 && <p className="m-0 px-1.5 pb-2 text-[12px] text-subtle">Drop a card here</p>}
              {cards.map((c) => (
                <article
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(c.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  className={`flex cursor-grab flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-sheet p-3 shadow-[0_1px_2px_rgba(22,32,29,0.06)] active:cursor-grabbing ${dragId === c.id ? "opacity-50" : ""}`}
                >
                  <Link href={`/applications/${c.id}`} className="flex flex-col gap-0.5 text-ink no-underline hover:text-teal">
                    <span className="text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">{c.title || "Untitled role"}</span>
                    <span className="text-[12.5px] text-muted [overflow-wrap:anywhere]">{c.company}</span>
                  </Link>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {c.total ? <span className="num text-[11.5px] text-subtle">{c.covered}/{c.total} covered</span> : <span />}
                    <StatusSelect applicationId={c.id} status={c.status} compact label={`Move ${c.title || "application"} to`} key={`${c.id}-${c.status}`} />
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
