"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addNoteAction, deleteNoteAction } from "@/app/(app)/applications/actions";
import { IconTrash } from "@/components/ui/icons";
import { UndoToast } from "@/components/ui/UndoToast";

interface Note {
  id: string;
  body: string;
  created_at: string;
}

const UNDO_MS = 6000;
const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Private notes: who you spoke to, what they said, follow-up dates. Only you can see them. */
export function NotesPanel({ applicationId, notes }: { applicationId: string; notes: Note[] }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Note | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removingRef = useRef<Note | null>(null);
  useEffect(() => {
    removingRef.current = removing;
  }, [removing]);

  const commitDelete = (id: string) => {
    void deleteNoteAction(applicationId, id).then((res) => {
      if (res.status === "error") setError(res.message);
    });
  };

  // Leaving the page during the undo window still deletes the note.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (removingRef.current) commitDelete(removingRef.current.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const add = () => {
    setError(null);
    start(async () => {
      const res = await addNoteAction(applicationId, text);
      if (res.status === "error") setError(res.message);
      else setText("");
    });
  };

  // The delete is sent only after the undo window closes.
  const remove = (note: Note) => {
    if (timer.current && removing) {
      clearTimeout(timer.current);
      commitDelete(removing.id);
    }
    setRemoving(note);
    timer.current = setTimeout(() => {
      commitDelete(note.id);
      setRemoving(null);
    }, UNDO_MS);
  };

  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    setRemoving(null);
  };

  const visible = notes.filter((n) => n.id !== removing?.id);

  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="notes-h">
      <div className="flex flex-col gap-0.5">
        <h2 id="notes-h" className="m-0 text-[17px]">Notes</h2>
        <p className="m-0 text-[13px] text-muted">Private to you. Never sent to the AI.</p>
      </div>
      <label htmlFor="note-new" className="sr-only">New note</label>
      <textarea id="note-new" className="field h-auto py-2 text-[14px]" rows={3} maxLength={5000} placeholder="e.g. Spoke to Ananya from HR, follow up on Friday" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-secondary press h-9 px-3 text-[13px]" disabled={pending || !text.trim()} onClick={add}>
          {pending ? "Saving…" : "Add note"}
        </button>
        {error && <span role="alert" className="text-[13px] text-gap-text">{error}</span>}
      </div>
      {visible.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {visible.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 border-t border-line-soft py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="whitespace-pre-wrap text-[14px] text-ink [overflow-wrap:anywhere]">{n.body}</span>
                <span className="text-[12px] text-subtle">{when(n.created_at)}</span>
              </span>
              <button type="button" className="shrink-0 rounded-[4px] p-1 text-subtle hover:bg-gap-bg hover:text-gap-text" aria-label="Delete note" onClick={() => remove(n)}>
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      )}
      {removing && <UndoToast message="Note deleted" onUndo={undo} />}
    </section>
  );
}
