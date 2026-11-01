export function BrandMark() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-teal/40 bg-teal/10">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path
          d="M3.5 7.5c4.2 0 4.2 9 8.5 9s4.3-9 8.5-9"
          stroke="var(--color-teal)"
        />
        <path
          d="M3.5 16.5c4.2 0 4.2-9 8.5-9s4.3 9 8.5 9"
          stroke="var(--color-line-strong)"
        />
      </svg>
    </span>
  );
}
