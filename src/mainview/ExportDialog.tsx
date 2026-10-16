import { useState } from "react";
import { errorText } from "./api";
import { Modal } from "./Dialogs";

export type ExportOptions = { spacing: number; fontSize: number; newPage: boolean; email: string };

type Props = {
  mode: "save" | "email";
  defaults: ExportOptions;
  onRun: (options: ExportOptions) => Promise<string>;
  onClose: () => void;
};

const field = "px-2 py-1 rounded-md border border-slate-700 bg-transparent";
const PRESETS = [1.5, 2, 2.25, 2.5, 3];

export function ExportDialog({ mode, defaults, onRun, onClose }: Props) {
  const [spacing, setSpacing] = useState(defaults.spacing);
  const [fontSize, setFontSize] = useState(defaults.fontSize);
  const [newPage, setNewPage] = useState(defaults.newPage);
  const [email, setEmail] = useState(defaults.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const custom = !PRESETS.includes(spacing);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  async function run() {
    setBusy(true);
    setError("");
    try {
      setDone(await onRun({ spacing, fontSize, newPage, email: email.trim() }));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} width={520}>
      <strong style={{ fontSize: 18 }}>{mode === "email" ? "Email PDF draft to myself" : "Export PDF draft"}</strong>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>
        A manuscript-style PDF with wide margins and loose line spacing, so you can annotate between the lines in any PDF reader or by hand on a printout.
      </div>

      {done ? (
        <>
          <div style={{ fontSize: 14 }}>{done}</div>
          <div className="flex justify-end"><button type="button" className="px-3 py-2 rounded-lg bg-amber-500 text-slate-900" onClick={onClose}>Done</button></div>
        </>
      ) : (
        <>
          <label className="flex items-center justify-between gap-3">
            Line spacing
            <span className="flex items-center gap-2">
              <select className={field} value={custom ? "custom" : String(spacing)} onChange={(event) => event.target.value !== "custom" && setSpacing(Number(event.target.value))}>
                {PRESETS.map((value) => <option key={value} value={value} style={{ color: "#111827" }}>{value === 2 ? "2 (double)" : value}</option>)}
                <option value="custom" style={{ color: "#111827" }}>Other…</option>
              </select>
              {custom && <input type="number" className={field} style={{ width: 70 }} min={1} max={4} step={0.25} value={spacing} onChange={(event) => setSpacing(Number(event.target.value) || 2)} />}
            </span>
          </label>
          <label className="flex items-center justify-between gap-3">
            Font size
            <select className={field} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))}>
              {[11, 12, 13, 14].map((value) => <option key={value} value={value} style={{ color: "#111827" }}>{value} pt</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={newPage} onChange={(event) => setNewPage(event.target.checked)} /> Start each chapter and act on a new page</label>
          {mode === "email" && (
            <label className="flex items-center justify-between gap-3">
              Send to
              <input type="email" className={field} style={{ width: 280 }} placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
          )}
          {mode === "email" && <div style={{ fontSize: 12, color: "var(--muted)" }}>Your mail app opens a message addressed to you. Mail apps can't attach files automatically, so the PDF's folder opens beside it to drag in.</div>}
          {error && <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onClose}>Cancel</button>
            <button type="button" className="px-3 py-2 rounded-lg bg-amber-500 text-slate-900" disabled={busy || (mode === "email" && !emailOk)} onClick={() => void run()}>
              {busy ? "Building…" : mode === "email" ? "Create and email" : "Create PDF"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
