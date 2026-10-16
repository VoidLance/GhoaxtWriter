import { useEffect, useState } from "react";
import { type ApiFetch, errorText, post } from "./api";
import { Modal } from "./Dialogs";

type Summary = {
  structure: "chapters" | "acts";
  levels: number[];
  acts: Array<{ title: string | null; chapters: Array<{ title: string; scenes: number; words: number }> }>;
};

type Result = { chapters: number; scenes: number; words: number };

type Props = {
  novelPath: string;
  apiFetch: ApiFetch;
  onImported: (result: Result) => void;
  onClose: () => void;
};

const field = "px-2 py-1 rounded-md border border-slate-700 bg-transparent";
const FORMATS = "Word (.docx), OpenDocument (.odt), RTF, plain text, Markdown, HTML, ePub and PDF";

export function ImportDialog({ novelPath, apiFetch, onImported, onClose }: Props) {
  const [session, setSession] = useState<{ token: string; name: string; format: string; warnings: string[] } | null>(null);
  const [structure, setStructure] = useState<"auto" | "chapters" | "acts">("auto");
  const [splitScenes, setSplitScenes] = useState(true);
  const [actName, setActName] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Result | null>(null);

  const options = { structure, splitScenes, actName };

  async function pick() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ token: string | null; name?: string; format?: string; warnings?: string[] }>(apiFetch, "/api/import/pick", { novel: novelPath });
      if (result.token) setSession({ token: result.token, name: result.name ?? "", format: result.format ?? "", warnings: result.warnings ?? [] });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    post<Summary>(apiFetch, "/api/import/plan", { novel: novelPath, token: session.token, ...options })
      .then((result) => { setSummary(result); setError(""); })
      .catch((failure) => setError(errorText(failure)));
  }, [session?.token, structure, splitScenes, actName]);

  async function commit() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<Result>(apiFetch, "/api/import/commit", { novel: novelPath, token: session.token, ...options });
      setDone(result);
      onImported(result);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  const chapters = summary?.acts.flatMap((act) => act.chapters) ?? [];
  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.words, 0);

  return (
    <Modal onClose={onClose} width={640}>
      <strong style={{ fontSize: 18 }}>Import manuscript</strong>

      {done ? (
        <>
          <div>Imported {done.chapters} chapters and {done.scenes} scenes ({done.words.toLocaleString()} words). They're added after your existing chapters.</div>
          <div className="flex justify-end"><button type="button" className="px-3 py-2 rounded-lg bg-amber-500 text-slate-900" onClick={onClose}>Done</button></div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Reads {FORMATS}. Headings become chapters, and scene breaks (***, #, a blank centred line) split scenes. Bold and italic are kept for Word documents.</div>
          <div className="flex items-center gap-3">
            <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" disabled={busy} onClick={() => void pick()}>{session ? "Choose another file…" : "Choose file…"}</button>
            {session && <span style={{ fontSize: 13 }}>{session.name}</span>}
          </div>

          {session?.warnings.map((warning) => <div key={warning} style={{ color: "#fbbf24", fontSize: 13 }}>{warning}</div>)}

          {session && summary && (
            <>
              <div className="flex gap-4 flex-wrap items-center" style={{ fontSize: 14 }}>
                <label className="flex items-center gap-2">
                  Structure
                  <select className={field} value={structure} onChange={(event) => setStructure(event.target.value as typeof structure)}>
                    <option value="auto" style={{ color: "#111827" }}>Detect ({summary.structure === "acts" ? "acts and chapters" : "chapters"})</option>
                    <option value="chapters" style={{ color: "#111827" }}>Chapters only</option>
                    <option value="acts" style={{ color: "#111827" }}>Acts and chapters</option>
                  </select>
                </label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={splitScenes} onChange={(event) => setSplitScenes(event.target.checked)} /> Split scenes at scene breaks</label>
              </div>
              {summary.structure === "chapters" && (
                <label className="flex items-center gap-2" style={{ fontSize: 14 }}>
                  Put everything in a new act called
                  <input className={field} style={{ width: 200 }} placeholder="(optional)" value={actName} onChange={(event) => setActName(event.target.value)} />
                </label>
              )}

              <div className="rounded-lg border border-slate-700 p-3" style={{ maxHeight: 240, overflow: "auto", fontSize: 13 }}>
                <div style={{ color: "var(--muted)", marginBottom: 6 }}>{chapters.length} chapters · {totalWords.toLocaleString()} words</div>
                {summary.acts.slice(0, 40).map((act, index) => (
                  <div key={index}>
                    {act.title && <div style={{ fontWeight: 700, marginTop: 6 }}>📁 {act.title}</div>}
                    {act.chapters.slice(0, 60).map((chapter, i) => (
                      <div key={i} className="flex justify-between gap-3" style={{ paddingLeft: act.title ? 16 : 0 }}>
                        <span>{chapter.title}</span>
                        <span style={{ color: "var(--muted)" }}>{chapter.scenes} {chapter.scenes === 1 ? "scene" : "scenes"} · {chapter.words.toLocaleString()} words</span>
                      </div>
                    ))}
                    {act.chapters.length > 60 && <div style={{ color: "var(--muted)", paddingLeft: 16 }}>…and {act.chapters.length - 60} more chapters</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {error && <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onClose}>Cancel</button>
            <button type="button" className="px-3 py-2 rounded-lg bg-amber-500 text-slate-900" disabled={busy || !session || !summary || chapters.length === 0} onClick={() => void commit()}>{busy ? "Working…" : "Import"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
