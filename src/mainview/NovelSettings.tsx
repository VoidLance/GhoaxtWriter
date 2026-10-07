import { useEffect, useState } from "react";
import NovelCover, { pickCoverImage } from "./Cover";
import type { NovelEntry, NovelMeta } from "./Library";

type Props = {
  novel: NovelEntry;
  apiFetch: <T>(path: string, options?: RequestInit) => Promise<T>;
  onSaved: (meta: NovelMeta, path: string) => void;
  onClose: () => void;
  buttonClass: string;
};

function NovelSettings({ novel, apiFetch, onSaved, onClose, buttonClass }: Props) {
  const [meta, setMeta] = useState<NovelMeta>(novel.meta);
  const [authors, setAuthors] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ authors: string[] }>("/api/library").then((result) => setAuthors(result.authors)).catch(() => undefined);
  }, []);

  async function save() {
    if (!meta.title.trim()) {
      setError("Title is required.");
      return;
    }
    try {
      const result = await apiFetch<{ path: string }>("/api/novel/meta", { method: "POST", body: JSON.stringify({ path: novel.path, meta }) });
      onSaved(meta, result.path);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unable to save.";
      try {
        setError(JSON.parse(raw).error ?? raw);
      } catch {
        setError(raw);
      }
    }
  }

  const field = "w-full px-3 py-2 rounded-lg border border-slate-700 bg-transparent";
  const label = { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "var(--muted)", marginBottom: 4 };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", zIndex: 60 }} onClick={onClose}>
      <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-700 p-6 flex gap-6" style={{ width: 720, maxHeight: "90vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-col gap-2" style={{ width: 160 }}>
          <NovelCover title={meta.title} subtitle={meta.subtitle} author={meta.author} seed={meta.cover.seed} image={meta.cover.image} />
          <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => setMeta({ ...meta, cover: { seed: Math.floor(Math.random() * 1_000_000), image: null } })}>New cover</button>
          <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => void pickCoverImage(apiFetch).then((image) => image && setMeta((prev) => ({ ...prev, cover: { ...prev.cover, image } }))).catch(() => setError("Unable to import that image."))}>Import image…</button>
          {meta.cover.image && (
            <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => setMeta({ ...meta, cover: { ...meta.cover, image: null } })}>Use generated cover</button>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-3">
          <h2 style={{ margin: 0, fontSize: 20 }}>Novel settings</h2>
          <div><div style={label}>Title</div><input className={field} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></div>
          <div><div style={label}>Subtitle</div><input className={field} value={meta.subtitle} onChange={(e) => setMeta({ ...meta, subtitle: e.target.value })} /></div>
          <div>
            <div style={label}>Author</div>
            <input className={field} list="novel-authors" value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} />
            <datalist id="novel-authors">{authors.map((name) => <option key={name} value={name} />)}</datalist>
          </div>
          <div><div style={label}>Genre</div><input className={field} value={meta.genre} onChange={(e) => setMeta({ ...meta, genre: e.target.value })} /></div>
          <div><div style={label}>Description</div><textarea className={field} rows={4} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></div>
          {error && <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onClose}>Cancel</button>
            <button type="button" className={`px-3 py-2 ${buttonClass}`} onClick={() => void save()}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NovelSettings;
