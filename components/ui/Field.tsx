"use client";

import { useId } from "react";

// Shared form controls: label above, help or error below (one at a time).

export function TextField({
  label,
  value,
  onChange,
  error,
  help,
  className = "",
  ...input
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  help?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = useId();
  const describedBy = error ? `${id}-err` : help ? `${id}-help` : undefined;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {error ? (
        <span id={`${id}-err`} className="text-[13px] text-gap-text">{error}</span>
      ) : help ? (
        <span id={`${id}-help`} className="text-[12px] text-subtle">{help}</span>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  help,
  rows = 3,
  maxLength,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={help ? `${id}-help` : undefined}
        className="field h-auto py-2.5 leading-normal"
      />
      {help && <span id={`${id}-help`} className="text-[12px] text-subtle">{help}</span>}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  disabled,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={
        "press inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] border border-line bg-sheet disabled:opacity-40 " +
        (tone === "danger" ? "text-gap-text hover:border-gap hover:bg-gap-bg" : "text-ink-2 hover:border-line-strong hover:text-ink")
      }
    >
      {children}
    </button>
  );
}
