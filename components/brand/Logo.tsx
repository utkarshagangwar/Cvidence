// Footnote C: an open C (the arc) with a small square "footnote" at its top right.
// Geometry copied from the logo system board on the Platform Designs canvas.

export function LogoMark({ size = 28, title = "Cvidence" }: { size?: number; title?: string }) {
  return (
    <svg role="img" aria-label={title} width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="var(--color-teal)" />
      <path d="M38.5 42.2 A14 14 0 1 1 38.5 24.8" fill="none" stroke="var(--color-paper)" strokeWidth="7" />
      <rect x="40" y="13" width="9.5" height="9.5" rx="2" fill="var(--color-mint-on-teal)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-[17px] font-semibold tracking-[-0.01em] text-ink ${className}`}>cvidence</span>
  );
}

export function Lockup() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={28} title="" />
      <Wordmark />
    </span>
  );
}
