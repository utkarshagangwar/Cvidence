"use client";

/** The bottom strip shown after a remove or dismiss, with an Undo button. */
export function UndoToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-[420px] items-center justify-between gap-3 rounded-[var(--radius-card)] bg-ink px-4 py-3 text-[14px] text-paper shadow-lg md:bottom-6"
    >
      <span className="truncate">{message}</span>
      <button type="button" className="btn h-8 shrink-0 bg-paper px-3 text-[13px] text-ink" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
