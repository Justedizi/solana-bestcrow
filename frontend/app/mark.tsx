// Common Ground mark — an abstract vault door resolving into a checkmark.
// The circle is the vault; the check is the condition being met. Strokes use
// `currentColor` so the mark adapts to its container (dark ink on light,
// light ink on the gradient/dark surfaces).
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="5" />
      <path
        d="M19 33.5 L28 42.5 L46 23.5"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
