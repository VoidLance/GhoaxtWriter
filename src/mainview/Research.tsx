import { useEffect, useRef, useState } from "react";
import { type ApiFetch, errorText, loadResearch, novelFileUrl, post, type ResearchItem, type ResearchSection } from "./api";
import { pickCoverImage } from "./Cover";

type Props = {
  novelPath: string;
  apiFetch: ApiFetch;
  confirmDelete: boolean;
  buttonClass: string;
  onStatus: (message: string) => void;
};

const KIND_LABEL: Record<ResearchItem["kind"], string> = { note: "Note", link: "Link", image: "Image", document: "Document" };
const field = "w-full px-3 py-2 rounded-lg border border-slate-700 bg-transparent";

function Research({ novelPath, apiFetch, confirmDelete, buttonClass, onStatus }: Props) {
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [sections, setSections] = useState<ResearchSection[]>([]);
  // null shows everything, "" shows items outside any section.
  const [filter, setFilter] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<ResearchItem | null>(null);
  const [openSection, setOpenSection] = useState<{ section: ResearchSection | null } | null>(null);
  const [hover, setHover] = useState<{ item: ResearchItem; rect: DOMRect } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attempted = useRef(new Set<string>());

  async function reload() {
    const data = await loadResearch(apiFetch, novelPath);
    setItems(data.items);
    setSections(data.sections);
    return data;
  }

  // Links saved without a preview (older saves, or when the site was unreachable) are retried once per session.
  async function backfillPreviews(list: ResearchItem[]) {
    let changed = false;
    for (const item of list) {
      if (item.kind !== "link" || !item.url || item.preview || attempted.current.has(item.id)) continue;
      attempted.current.add(item.id);
      try {
        await post(apiFetch, "/api/research/refresh", { novel: novelPath, id: item.id });
        changed = true;
      } catch {
        // The site may be offline; the manual refresh button reports why.
      }
    }
    if (changed) await reload();
  }

  useEffect(() => {
    void reload().then((data) => backfillPreviews(data.items)).catch(() => onStatus("Unable to load research."));
  }, [novelPath]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      onStatus(errorText(error));
    }
  }

  const currentSection = filter || null;

  function addNote() {
    void run(async () => {
      const result = await post<{ id: string }>(apiFetch, "/api/research/save", { novel: novelPath, kind: "note", title: "Untitled note", description: "", text: "", section: currentSection });
      const data = await reload();
      setOpenItem(data.items.find((item) => item.id === result.id) ?? null);
    });
  }

  function addLink() {
    const raw = window.prompt("Paste a link (article, image or document URL)");
    if (!raw?.trim()) return;
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    setBusy(true);
    void run(async () => {
      const result = await post<{ id: string; warning?: string }>(apiFetch, "/api/research/link", { novel: novelPath, url, section: currentSection });
      await reload();
      onStatus(result.warning ?? "Link saved with a preview of the page.");
    }).finally(() => setBusy(false));
  }

  function importFile() {
    setBusy(true);
    void run(async () => {
      await post(apiFetch, "/api/research/import", { novel: novelPath, section: currentSection });
      await reload();
    }).finally(() => setBusy(false));
  }

  function openReal(item: ResearchItem) {
    if (item.kind === "link" && item.url) void run(() => post(apiFetch, "/api/open", { novel: novelPath, url: item.url }));
    else if (item.file) void run(() => post(apiFetch, "/api/open", { novel: novelPath, file: item.file }));
    else setOpenItem(item);
  }

  function moveItem(id: string, section: string | null) {
    const item = items.find((other) => other.id === id);
    if (!item || (item.section ?? null) === section) return;
    void run(async () => {
      await post(apiFetch, "/api/research/move", { novel: novelPath, id, section });
      await reload();
    });
  }

  function removeItem(item: ResearchItem) {
    if (confirmDelete && !window.confirm(`Delete "${item.title}"?`)) return;
    void run(async () => {
      await post(apiFetch, "/api/research/delete", { novel: novelPath, id: item.id });
      setOpenItem(null);
      await reload();
    });
  }

  function removeSection(section: ResearchSection) {
    if (confirmDelete && !window.confirm(`Delete section "${section.name}"? Its items stay in the dashboard.`)) return;
    void run(async () => {
      await post(apiFetch, "/api/research/section/delete", { novel: novelPath, name: section.name });
      if (filter === section.name) setFilter(null);
      setOpenSection(null);
      await reload();
    });
  }

  const visible = items.filter((item) => filter === null || (item.section ?? "") === filter);
  const ghost = "px-3 py-2 rounded-lg border border-slate-700";
  const unsorted = items.filter((item) => !item.section).length;

  function chip(key: string, label: React.ReactNode, active: boolean, onClick: () => void, target: string | null | undefined) {
    const droppable = target !== undefined;
    return (
      <div
        key={key}
        onDragOver={droppable ? (event) => { event.preventDefault(); setDropTarget(key); } : undefined}
        onDragLeave={droppable ? () => setDropTarget((prev) => (prev === key ? null : prev)) : undefined}
        onDrop={droppable ? (event) => { event.preventDefault(); setDropTarget(null); if (dragId) moveItem(dragId, target ?? null); setDragId(null); } : undefined}
        className={`rounded-lg border ${active || dropTarget === key ? "border-amber-500" : "border-slate-700"}`}
        style={{ background: dropTarget === key ? "rgba(245,158,11,0.15)" : undefined }}
      >
        <button type="button" onClick={onClick} className="p-2 bg-transparent text-left flex items-center gap-2">{label}</button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex gap-2 flex-wrap mb-2">
        <button type="button" className={`px-3 py-2 ${buttonClass}`} onClick={addNote}>New note</button>
        <button type="button" className={ghost} disabled={busy} onClick={addLink}>{busy ? "Working…" : "Add link…"}</button>
        <button type="button" className={ghost} disabled={busy} onClick={importFile}>Import file…</button>
        <div className="flex-1" />
        <button type="button" className={ghost} onClick={() => setOpenSection({ section: null })}>New section</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        Everything here is saved as ordinary files in the novel's Research folder. Click a card to open the real thing; drag a card onto a section to file it.
      </div>

      <div className="flex gap-3 flex-wrap mb-6">
        {chip("all", `All (${items.length})`, filter === null, () => setFilter(null), undefined)}
        {chip("unsorted", `Unsorted (${unsorted})`, filter === "", () => setFilter(""), null)}
        {sections.map((section) => (
          <div key={section.name} className="flex items-stretch gap-1">
            {chip(
              `section:${section.name}`,
              <>
                {section.image && <img src={novelFileUrl(novelPath, section.image, section.version)} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
                <span>
                  <div>{section.name}</div>
                  {section.description && <div style={{ fontSize: 11, color: "var(--muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.description}</div>}
                </span>
              </>,
              filter === section.name,
              () => setFilter(section.name),
              section.name,
            )}
            <button type="button" title="Edit section" className="px-1 bg-transparent" onClick={() => setOpenSection({ section })}>✎</button>
          </div>
        ))}
      </div>

      {visible.length === 0 && <div style={{ color: "var(--muted)" }}>Nothing here yet. Add notes, links, images and documents to build your research dashboard.</div>}

      <div className="flex flex-wrap gap-4">
        {visible.map((item) => {
          const thumb = item.kind === "image" && item.file ? item.file : item.preview;
          return (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => { event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; setDragId(item.id); setHover(null); }}
              onDragEnd={() => { setDragId(null); setDropTarget(null); }}
              onMouseEnter={(event) => setHover({ item, rect: event.currentTarget.getBoundingClientRect() })}
              onMouseLeave={() => setHover(null)}
              onClick={() => openReal(item)}
              className="relative text-left rounded-xl border border-slate-700 bg-slate-900 text-slate-100 overflow-hidden cursor-pointer"
              style={{ width: 220 }}
            >
              {thumb ? (
                <img src={novelFileUrl(novelPath, thumb, item.version)} alt={item.title} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
              ) : item.text || item.url ? (
                <div style={{ height: 120, padding: 10, fontSize: 12, color: "var(--muted)", overflow: "hidden" }}>{(item.text || item.url || "").slice(0, 220)}</div>
              ) : (
                <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "var(--muted)" }}>{(item.file?.split(".").pop() ?? "file").toUpperCase()}</div>
              )}
              <button type="button" title="Edit details" className="absolute top-2 right-2 px-2 rounded-md bg-slate-900 text-slate-100" onClick={(event) => { event.stopPropagation(); setHover(null); setOpenItem(item); }}>✎</button>
              <div className="p-3">
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{KIND_LABEL[item.kind]}{item.section ? ` · ${item.section}` : ""}</div>
                <strong style={{ fontSize: 14 }}>{item.title}</strong>
                {item.description && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{item.description.slice(0, 100)}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {hover && !dragId && <HoverCard hover={hover} novelPath={novelPath} />}

      {openItem && (
        <ItemDialog
          item={openItem}
          sections={sections}
          onClose={() => setOpenItem(null)}
          onOpenReal={() => openReal(openItem)}
          onRefresh={() => void run(async () => {
            const result = await post<{ preview: boolean }>(apiFetch, "/api/research/refresh", { novel: novelPath, id: openItem.id });
            setOpenItem(null);
            await reload();
            onStatus(result.preview ? "Preview updated." : "Saved, but the page offers no preview image.");
          })}
          onSave={(draft) => void run(async () => {
            await post(apiFetch, "/api/research/save", { novel: novelPath, id: draft.id, title: draft.title, description: draft.description, section: draft.section, text: draft.text, url: draft.url });
            setOpenItem(null);
            await reload();
          })}
          onDelete={() => removeItem(openItem)}
        />
      )}
      {openSection && (
        <SectionDialog
          section={openSection.section}
          apiFetch={apiFetch}
          novelPath={novelPath}
          buttonClass={buttonClass}
          onClose={() => setOpenSection(null)}
          onSave={(draft) => void run(async () => {
            await post(apiFetch, "/api/research/section", { novel: novelPath, previousName: openSection.section?.name, name: draft.name, description: draft.description, image: draft.image });
            if (openSection.section && filter === openSection.section.name) setFilter(draft.name);
            setOpenSection(null);
            await reload();
          })}
          onDelete={openSection.section ? () => removeSection(openSection.section!) : undefined}
        />
      )}
    </div>
  );
}

// A peek at what's inside, shown next to the hovered card.
function HoverCard({ hover, novelPath }: { hover: { item: ResearchItem; rect: DOMRect }; novelPath: string }) {
  const { item, rect } = hover;
  const width = 360;
  const left = rect.right + 12 + width > window.innerWidth ? Math.max(8, rect.left - width - 12) : rect.right + 12;
  const image = item.kind === "image" && item.file ? item.file : item.preview;
  const body = item.kind === "note" || item.kind === "link" || item.text ? (item.text ?? "") : "";
  return (
    <div className="fixed rounded-xl border border-slate-700 bg-slate-900 text-slate-100 p-4 shadow-2xl" style={{ zIndex: 55, left, top: Math.max(8, Math.min(rect.top, window.innerHeight - 380)), width, maxHeight: 370, overflow: "hidden", pointerEvents: "none" }}>
      {image && <img src={novelFileUrl(novelPath, image, item.version)} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 8, marginBottom: 8 }} />}
      <strong>{item.title}</strong>
      {item.url && <div style={{ fontSize: 11, color: "#38bdf8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.url}</div>}
      {item.description && <div style={{ fontSize: 13, marginTop: 6 }}>{item.description}</div>}
      {body && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, whiteSpace: "pre-wrap" }}>{body.slice(0, 600)}</div>}
      {!image && !body && !item.description && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Click to open the file.</div>}
    </div>
  );
}

function Modal({ children, onClose, width = 640 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", zIndex: 60 }} onClick={onClose}>
      <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-700 p-6 flex flex-col gap-3" style={{ width, maxHeight: "90vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ItemDialog({ item, sections, onClose, onOpenReal, onRefresh, onSave, onDelete }: { item: ResearchItem; sections: ResearchSection[]; onClose: () => void; onOpenReal: () => void; onRefresh: () => void; onSave: (item: ResearchItem) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(item);
  const editableText = draft.kind === "note" || draft.kind === "link";

  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>{KIND_LABEL[draft.kind]}</div>
      <input className={field} style={{ fontSize: 18, fontWeight: 700 }} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      <textarea className={field} rows={2} placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      <select className={field} value={draft.section ?? ""} onChange={(e) => setDraft({ ...draft, section: e.target.value || null })}>
        <option value="" style={{ color: "#111827" }}>No section</option>
        {sections.map((section) => <option key={section.name} value={section.name} style={{ color: "#111827" }}>{section.name}</option>)}
      </select>
      {draft.kind === "link" && <input className={field} value={draft.url ?? ""} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />}
      {editableText && <textarea className={field} rows={10} placeholder={draft.kind === "note" ? "Write your note…" : "Saved copy of the page"} value={draft.text ?? ""} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />}
      <div className="flex gap-2 justify-between">
        <div className="flex gap-2">
          <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onDelete}>Delete</button>
          {draft.kind !== "note" && <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onOpenReal}>{draft.kind === "link" ? "Open link" : "Open file"}</button>}
          {draft.kind === "link" && <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onRefresh}>Refresh preview</button>}
        </div>
        <div className="flex gap-2">
          <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onClose}>Cancel</button>
          <button type="button" className="px-3 py-2 rounded-lg bg-amber-500 text-slate-900" onClick={() => onSave(draft)}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

type SectionDraft = { name: string; description: string; image: string | null | undefined };

function SectionDialog({ section, apiFetch, novelPath, buttonClass, onClose, onSave, onDelete }: { section: ResearchSection | null; apiFetch: ApiFetch; novelPath: string; buttonClass: string; onClose: () => void; onSave: (draft: SectionDraft) => void; onDelete?: () => void }) {
  // image: undefined keeps the saved one, null removes it, a data URL replaces it.
  const [draft, setDraft] = useState<SectionDraft>({ name: section?.name ?? "", description: section?.description ?? "", image: undefined });
  const shown = draft.image === undefined ? (section?.image ? novelFileUrl(novelPath, section.image, section.version) : null) : draft.image;

  return (
    <Modal onClose={onClose} width={480}>
      <strong style={{ fontSize: 18 }}>{section ? "Edit section" : "New section"}</strong>
      <input className={field} placeholder="Name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <textarea className={field} rows={3} placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      <div className="flex items-center gap-3">
        {shown && <img src={shown} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover" }} />}
        <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => void pickCoverImage(apiFetch).then((image) => image && setDraft((prev) => ({ ...prev, image }))).catch(() => undefined)}>{shown ? "Change image…" : "Attach image…"}</button>
        {shown && <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => setDraft({ ...draft, image: null })}>Remove</button>}
      </div>
      <div className="flex gap-2 justify-between">
        {onDelete ? <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onDelete}>Delete</button> : <span />}
        <div className="flex gap-2">
          <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onClose}>Cancel</button>
          <button type="button" className={`px-3 py-2 ${buttonClass}`} disabled={!draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

export default Research;
