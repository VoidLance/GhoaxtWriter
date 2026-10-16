import { useEffect, useState } from "react";
import NovelCover, { pickCoverImage } from "./Cover";
import NovelSettings from "./NovelSettings";
import type { Goals } from "./goals";

export type NovelMeta = {
  title: string;
  subtitle: string;
  author: string;
  genre: string;
  description: string;
  cover: { seed: number; image: string | null; template?: string; palette?: number };
  createdAt: string;
  goals?: Goals;
  // Maps a date to the novel's word total at the start of that day.
  progress?: Record<string, number>;
};

export type NovelEntry = { path: string; shelf: string | null; meta: NovelMeta };

type LibraryData = { novels: NovelEntry[]; shelves: Array<{ folder: string; name: string; author: string }>; authors: string[] };

type LibraryProps = {
  apiFetch: <T>(path: string, options?: RequestInit) => Promise<T>;
  onOpen: (novel: NovelEntry) => void;
  onStatus: (message: string) => void;
  buttonClass: string;
  className: string;
};

const AUTHOR_KEY = "ghoaxtwriter.author";

function Library({ apiFetch, onOpen, onStatus, buttonClass, className }: LibraryProps) {
  const [data, setData] = useState<LibraryData>({ novels: [], shelves: [], authors: [] });
  const [author, setAuthor] = useState(() => localStorage.getItem(AUTHOR_KEY) ?? "");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", subtitle: "", shelf: "" });
  const [menu, setMenu] = useState<{ x: number; y: number; novel: NovelEntry } | null>(null);
  const [settingsFor, setSettingsFor] = useState<NovelEntry | null>(null);

  async function updateCover(novel: NovelEntry, cover: NovelMeta["cover"]) {
    try {
      await apiFetch("/api/novel/meta", { method: "POST", body: JSON.stringify({ path: novel.path, meta: { cover } }) });
      setData((prev) => ({
        ...prev,
        novels: prev.novels.map((n) => (n.path === novel.path ? { ...n, meta: { ...n.meta, cover } } : n)),
      }));
    } catch (error) {
      console.error(error);
      onStatus("Unable to save cover.");
    }
  }

  function regenerate(novel: NovelEntry) {
    // A new seed reshuffles the design and colours; the chosen template stays.
    void updateCover(novel, { ...novel.meta.cover, seed: Math.floor(Math.random() * 1_000_000), image: null, palette: undefined });
  }

  async function importImage(novel: NovelEntry) {
    try {
      const image = await pickCoverImage(apiFetch);
      if (image) await updateCover(novel, { ...novel.meta.cover, image });
    } catch (error) {
      console.error(error);
      onStatus("Unable to import that image.");
    }
  }

  async function load() {
    try {
      setData(await apiFetch<LibraryData>("/api/library"));
    } catch (error) {
      console.error(error);
      onStatus("Unable to load library.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    localStorage.setItem(AUTHOR_KEY, author);
  }, [author]);

  const activeAuthor = data.authors.includes(author) ? author : data.authors[0] ?? "";
  const visible = data.novels.filter((novel) => novel.meta.author === activeAuthor);
  // Shelves with no recorded owner (empty legacy folders) stay visible to every author.
  const myShelves = data.shelves.filter((shelf) => !shelf.author || shelf.author === activeAuthor);
  const groups = [
    ...myShelves.map((shelf) => ({ name: shelf.name as string | null, folder: shelf.folder as string | null, novels: visible.filter((n) => n.shelf === shelf.folder) })),
    { name: null as string | null, folder: null as string | null, novels: visible.filter((n) => !n.shelf) },
  ].filter((group) => group.name === null ? group.novels.length > 0 : true);

  async function renameShelf(folder: string, current: string) {
    const name = window.prompt("Rename shelf", current);
    if (!name?.trim() || name.trim() === current) return;
    try {
      await apiFetch("/api/shelf/rename", { method: "POST", body: JSON.stringify({ folder, name }) });
      await load();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Unable to rename shelf.";
      try {
        onStatus(JSON.parse(raw).error ?? raw);
      } catch {
        onStatus(raw);
      }
    }
  }

  async function addAuthor() {
    const name = window.prompt("Author name");
    if (!name?.trim()) return;
    const result = await apiFetch<{ authors: string[] }>("/api/authors", { method: "POST", body: JSON.stringify({ name }) });
    setData((prev) => ({ ...prev, authors: result.authors }));
    setAuthor(name.trim());
  }

  async function addShelf() {
    const name = window.prompt("Shelf (series) name");
    if (!name?.trim()) return;
    if (!activeAuthor) {
      onStatus("Add an author profile first.");
      return;
    }
    await apiFetch("/api/shelf", { method: "POST", body: JSON.stringify({ name, author: activeAuthor }) });
    await load();
  }

  async function createNovel() {
    if (!activeAuthor) {
      onStatus("Add an author profile first.");
      return;
    }
    try {
      const created = await apiFetch<NovelEntry>("/api/novel", {
        method: "POST",
        body: JSON.stringify({ ...form, author: activeAuthor }),
      });
      setCreating(false);
      setForm({ title: "", subtitle: "", shelf: "" });
      onOpen(created);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Unable to create novel.");
    }
  }

  const field = "w-full px-3 py-2 rounded-lg border border-slate-700 bg-transparent";

  return (
    <div className={`flex-1 overflow-auto ${className}`} onClick={() => setMenu(null)}>
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <span style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.15em" }}>Author</span>
        <select value={activeAuthor} onChange={(event) => setAuthor(event.target.value)} className={field} style={{ width: "auto", minWidth: 200 }}>
          {data.authors.length === 0 && <option value="">No authors yet</option>}
          {data.authors.map((name) => (
            <option key={name} value={name} style={{ color: "#111827" }}>{name}</option>
          ))}
        </select>
        <button type="button" onClick={() => void addAuthor()} className="px-3 py-2 rounded-lg border border-slate-700">New author</button>
        <div className="flex-1" />
        <button type="button" onClick={() => void addShelf()} className="px-3 py-2 rounded-lg border border-slate-700">New shelf</button>
        <button type="button" onClick={() => setCreating(true)} className={`px-3 py-2 ${buttonClass}`}>New novel</button>
      </div>

      {creating && (
        <div className="mb-8 p-4 rounded-xl border border-slate-700 max-w-xl flex flex-col gap-3">
          <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className={field} />
          <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Subtitle (optional)" className={field} />
          <select value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })} className={field}>
            <option value="" style={{ color: "#111827" }}>No shelf</option>
            {myShelves.map((shelf) => (
              <option key={shelf.folder} value={shelf.folder} style={{ color: "#111827" }}>{shelf.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={() => void createNovel()} className={`px-3 py-2 ${buttonClass}`}>Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 rounded-lg border border-slate-700">Cancel</button>
          </div>
        </div>
      )}

      {groups.length === 0 || (groups.every((g) => g.novels.length === 0) && !creating) ? (
        <div style={{ color: "var(--muted)" }}>{activeAuthor ? `No novels by ${activeAuthor} yet.` : "Create an author profile to begin."}</div>
      ) : null}

      {groups.map((group) => (
        <section key={group.name ?? "__none"} className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 style={{ fontSize: 18, margin: 0 }}>{group.name ?? "Standalone"}</h2>
            {group.folder && group.name && (
              <button type="button" title="Rename shelf" className="px-2 py-1 rounded-md border border-slate-700 text-xs" onClick={() => void renameShelf(group.folder!, group.name!)}>
                Rename
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            {group.novels.map((novel) => (
              <div
                key={novel.path}
                className="relative"
                style={{ width: 160 }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, novel });
                }}
              >
                <button type="button" onClick={() => onOpen(novel)} className="block p-0 border-0 bg-transparent" title="Open (⋯ or right-click for options)">
                  <NovelCover title={novel.meta.title} subtitle={novel.meta.subtitle} author={novel.meta.author} seed={novel.meta.cover.seed} image={novel.meta.cover.image} template={novel.meta.cover.template} palette={novel.meta.cover.palette} />
                </button>
                <button
                  type="button"
                  title="Novel options"
                  onClick={(event) => {
                    event.stopPropagation();
                    const box = event.currentTarget.getBoundingClientRect();
                    setMenu({ x: box.left, y: box.bottom + 4, novel });
                  }}
                  className="absolute top-2 right-2 px-2 rounded-md bg-slate-900 text-slate-100"
                  style={{ lineHeight: 1.4, fontSize: 18 }}
                >
                  ⋯
                </button>
              </div>
            ))}
            {group.novels.length === 0 && <div style={{ color: "var(--muted)" }}>Empty shelf.</div>}
          </div>
        </section>
      ))}

      {settingsFor && (
        <NovelSettings
          novel={settingsFor}
          apiFetch={apiFetch}
          buttonClass={buttonClass}
          onClose={() => setSettingsFor(null)}
          onSaved={(meta) => {
            setData((prev) => ({ ...prev, novels: prev.novels.map((n) => (n.path === settingsFor.path ? { ...n, meta } : n)) }));
            setSettingsFor(null);
            void load();
          }}
        />
      )}

      {menu && (
        <div
          className="fixed rounded-lg border border-slate-700 bg-slate-900 text-slate-100 py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y, zIndex: 50, minWidth: 190 }}
          onClick={(event) => event.stopPropagation()}
        >
          {[
            { label: "Novel settings…", run: () => setSettingsFor(menu.novel) },
            { label: "Generate new cover", run: () => regenerate(menu.novel) },
            { label: "Import image from computer…", run: () => void importImage(menu.novel) },
            ...(menu.novel.meta.cover.image ? [{ label: "Remove imported image", run: () => void updateCover(menu.novel, { ...menu.novel.meta.cover, image: null }) }] : []),
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="block w-full text-left px-3 py-2 bg-transparent"
              onClick={() => {
                setMenu(null);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Library;
