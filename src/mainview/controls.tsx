export const field = "px-2 py-1 rounded-md border border-slate-700 bg-transparent";
export const ghost = "px-3 py-1 rounded-lg border border-slate-700 bg-transparent";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: 8 }}>{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {hint && <div style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</div>}
      </span>
    </label>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      {children}
    </label>
  );
}
