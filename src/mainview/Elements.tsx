import { useEffect, useRef, useState } from "react";
import { type ApiFetch, type ElementItem, errorText, loadElements, novelFileUrl, post } from "./api";
import { pickCoverImage } from "./Cover";

export const ELEMENT_TYPES = ["Character", "Location", "Item", "Concept", "Other"];

type Props = {
  novelPath: string;
  apiFetch: ApiFetch;
  items: ElementItem[];
  setItems: React.Dispatch<React.SetStateAction<ElementItem[]>>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  confirmDelete: boolean;
  buttonClass: string;
  onStatus: (message: string) => void;
};

function Elements({ novelPath, apiFetch, items, setItems, selectedId, onSelect, confirmDelete, buttonClass, onStatus }: Props) {
  const [query, setQuery] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => setNameDraft(selected?.name ?? ""), [selected?.id]);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  async function persist(next: ElementItem, previousId: string, image?: string | null) {
    try {
      const result = await post<{ item: ElementItem }>(apiFetch, "/api/elements/save", {
        novel: novelPath,
        previousName: previousId,
        name: next.name,
        type: next.type,
        notes: next.notes,
        image,
      });
      // Only take the server's identity and image; the user may have typed more since.
      setItems((prev) => prev.map((item) => (item.id === previousId ? { ...item, id: result.item.id, name: result.item.name, image: result.item.image, imageVersion: result.item.imageVersion } : item)));
      if (result.item.id !== previousId) onSelect(result.item.id);
    } catch (error) {
      onStatus(errorText(error));
      void loadElements(apiFetch, novelPath).then(setItems);
      setNameDraft(selected?.name ?? "");
    }
  }

  function patch(change: Partial<ElementItem>, options: { immediate?: boolean; image?: string | null } = {}) {
    if (!selected) return;
    const next = { ...selected, ...change };
    setItems((prev) => prev.map((item) => (item.id === selected.id ? next : item)));
    window.clearTimeout(saveTimer.current);
    if (options.immediate || options.image !== undefined) void persist(next, selected.id, options.image);
    else saveTimer.current = window.setTimeout(() => void persist(next, selected.id), 400);
  }

  async function create() {
    const name = window.prompt("Element name");
    if (!name?.trim()) return;
    try {
      const result = await post<{ item: ElementItem }>(apiFetch, "/api/elements/save", { novel: novelPath, name: name.trim(), type: "Character", notes: "" });
      setItems((prev) => [...prev, result.item]);
      onSelect(result.item.id);
    } catch (error) {
      onStatus(errorText(error));
    }
  }

  async function remove(item: ElementItem) {
    if (confirmDelete && !window.confirm(`Delete "${item.name}"?`)) return;
    await post(apiFetch, "/api/elements/delete", { novel: novelPath, name: item.id });
    setItems((prev) => prev.filter((other) => other.id !== item.id));
    onSelect(null);
  }

  async function chooseImage() {
    try {
      const image = await pickCoverImage(apiFetch);
      if (image) patch({}, { image });
    } catch {
      onStatus("Unable to import that image.");
    }
  }

  const filtered = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const types = Array.from(new Set([...ELEMENT_TYPES, ...items.map((item) => item.type)]));
  const field = "w-full px-3 py-2 rounded-lg border border-slate-700 bg-transparent";

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-72 shrink-0 overflow-auto p-3 border-r border-slate-700">
        <div className="flex gap-2 mb-3">
          <input className={field} placeholder="Search elements" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className={`px-3 py-2 ${buttonClass}`} onClick={() => void create()}>New</button>
        </div>
        {items.length === 0 && <div style={{ color: "var(--muted)" }}>No elements yet. Characters, places, items and ideas live here, and you can link to them from the manuscript with [[Name]].</div>}
        {types.map((type) => {
          const group = filtered.filter((item) => item.type === type);
          if (group.length === 0) return null;
          return (
            <div key={type} className="mb-4">
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: 4 }}>{type}s</div>
              {group.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`w-full text-left px-2 py-1 rounded-md border flex items-center gap-2 ${item.id === selectedId ? "border-amber-500 font-bold" : "border-transparent"}`}
                >
                  {item.image ? <img src={novelFileUrl(novelPath, item.image, item.imageVersion)} alt="" style={{ width: 24, height: 24, borderRadius: 12, objectFit: "cover" }} /> : <span style={{ width: 24, textAlign: "center" }}>•</span>}
                  {item.name}
                </button>
              ))}
            </div>
          );
        })}
      </aside>

      <section className="flex-1 overflow-auto p-6">
        {!selected ? (
          <div style={{ color: "var(--muted)" }}>Select or create an element.</div>
        ) : (
          <div className="flex gap-6 max-w-4xl">
            <div className="flex flex-col gap-2" style={{ width: 200 }}>
              <div className="rounded-lg border border-slate-700 overflow-hidden flex items-center justify-center" style={{ width: 200, height: 200 }}>
                {selected.image ? <img src={novelFileUrl(novelPath, selected.image, selected.imageVersion)} alt={selected.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "var(--muted)" }}>No image</span>}
              </div>
              <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => void chooseImage()}>{selected.image ? "Change image…" : "Add image…"}</button>
              {selected.image && <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => patch({}, { image: null })}>Remove image</button>}
              <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => void remove(selected)}>Delete element</button>
              <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => void post(apiFetch, "/api/open", { novel: novelPath, file: `Elements/${selected.id}.md` })}>Open file</button>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              {/* The name is the file name, so it is only saved when you finish editing it. */}
              <input
                className={field}
                style={{ fontSize: 20, fontWeight: 700 }}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => nameDraft.trim() && nameDraft.trim() !== selected.name && patch({ name: nameDraft.trim() }, { immediate: true })}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              />
              <select className={field} value={selected.type} onChange={(event) => patch({ type: event.target.value }, { immediate: true })}>
                {types.map((type) => <option key={type} value={type} style={{ color: "#111827" }}>{type}</option>)}
              </select>
              <textarea className={field} rows={18} placeholder="Notes (markdown)" value={selected.notes} onChange={(event) => patch({ notes: event.target.value })} />
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Link to this from the manuscript by typing [[{selected.name}]]. Saved as Elements/{selected.name}.md in the novel folder.</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default Elements;
