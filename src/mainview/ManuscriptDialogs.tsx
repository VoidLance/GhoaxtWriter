import { useState } from "react";
import { Modal } from "./Dialogs";
import type { ChapterInfo, MatterTemplate } from "../shared/manuscript";
import { isNumberedChapter } from "../shared/manuscript";

const field = "w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900";
const button = "px-3 py-2 rounded-lg border border-slate-700";

export function ChapterDialog({ name, info, roles, onSave, onClose }: {
  name: string;
  info: ChapterInfo;
  roles: string[];
  onSave: (info: ChapterInfo) => Promise<void>;
  onClose: () => void;
}) {
  const [numbered, setNumbered] = useState(info.numbered ?? isNumberedChapter(name, { ...info, role: "" }));
  const [title, setTitle] = useState(info.title ?? "");
  const [role, setRole] = useState(info.role ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose}>
      <strong>Chapter settings: {name}</strong>
      <label>Role (leave blank for an ordinary chapter)<input className={field} list="chapter-roles" value={role} onChange={(e) => setRole(e.target.value)} /></label>
      <datalist id="chapter-roles">{roles.filter(Boolean).map((item, index) => <option key={index} value={item} />)}</datalist>
      <label><input type="checkbox" checked={numbered} disabled={!!role.trim()} onChange={(e) => setNumbered(e.target.checked)} /> Number this chapter automatically</label>
      <label>Title for numbered chapter<input className={field} value={title} disabled={!numbered || !!role.trim()} onChange={(e) => setTitle(e.target.value)} /></label>
      {error && <div role="alert" style={{ color: "#fca5a5" }}>{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" className={button} onClick={onClose}>Cancel</button>
        <button type="button" className={button} disabled={busy} onClick={() => {
          setBusy(true);
          void onSave({ ...info, numbered, title, role }).catch((err) => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusy(false));
        }}>Save</button>
      </div>
    </Modal>
  );
}

export function MatterDialog({ position, templates, onAdd, onClose }: {
  position: "front" | "back";
  templates: MatterTemplate[];
  onAdd: (index: number) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose}>
      <strong>Add {position === "front" ? "front" : "back"} matter</strong>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>Templates and chapter roles can be customized in Novel settings.</div>
      {templates.length === 0 && <div>No templates yet. Add one in Novel settings.</div>}
      {templates.map((template, index) => (
        <button key={index} type="button" className={`${button} text-left`} disabled={busy} onClick={() => {
          setBusy(true);
          void onAdd(index).catch((err) => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusy(false));
        }}>{template.name || "(Unnamed template)"}</button>
      ))}
      {error && <div role="alert" style={{ color: "#fca5a5" }}>{error}</div>}
      <button type="button" className={`${button} self-end`} onClick={onClose}>Cancel</button>
    </Modal>
  );
}
