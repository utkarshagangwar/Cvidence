// Small control icons in the same grid and stroke as components/shell/icons.tsx.

function Base({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const IconUp = () => <Base><path d="m5 12 5-5 5 5" /></Base>;
export const IconDown = () => <Base><path d="m5 8 5 5 5-5" /></Base>;
export const IconTrash = () => <Base><path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" /></Base>;
export const IconPlus = () => <Base><path d="M10 4v12M4 10h12" /></Base>;
export const IconX = () => <Base size={14}><path d="m5 5 10 10M15 5 5 15" /></Base>;
export const IconUpload = () => <Base><path d="M10 13V4M6 8l4-4 4 4M4 16h12" /></Base>;
export const IconCheck = () => <Base><path d="m4.5 10.5 3.5 3.5 7.5-8" /></Base>;
export const IconUndo = () => <Base><path d="M8 5 4 9l4 4" /><path d="M4 9h7a5 5 0 0 1 0 10H9" /></Base>;
export const IconSparkle = () => <Base><path d="M10 3v4M10 13v4M3 10h4M13 10h4" /></Base>;
export const IconDownload = () => <Base><path d="M10 4v9M6 9l4 4 4-4M4 16h12" /></Base>;
export const IconBookmark = ({ filled = false }: { filled?: boolean }) => (
  <Base>
    <path d="M6 3.5h8v13l-4-3-4 3z" fill={filled ? "currentColor" : "none"} />
  </Base>
);
export const IconExternal = () => <Base size={14}><path d="M11 4h5v5M16 4l-7 7M14 12v4H4V6h4" /></Base>;
