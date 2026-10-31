export const BUTTON_VARIANTS = {
  primary:
    "bg-teal text-charcoal hover:bg-[#55e4cc] disabled:hover:bg-teal",
  secondary:
    "border border-line-strong bg-transparent text-ink hover:border-teal/60 hover:text-teal",
  danger:
    "border border-danger/50 bg-transparent text-danger hover:bg-danger/10",
  ghost: "text-muted hover:text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
  contentClassName = "p-4 sm:p-5",
}) {
  return (
    <section
      className={`min-w-0 rounded-lg border border-line bg-panel ${className}`}
    >
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-ink">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className={`min-w-0 ${contentClassName}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-1 break-words font-mono text-base text-ink sm:text-lg">
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
