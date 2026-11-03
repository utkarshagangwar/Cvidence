"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary press" onClick={() => window.print()}>
      Save as PDF
    </button>
  );
}
