import { useEffect, useMemo, useRef, useState } from "react";

export function Modal({ children, onClose, width = 640 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", zIndex: 80 }} onClick={onClose}>
      <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-700 p-6 flex flex-col gap-3" style={{ width, maxHeight: "90vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function InfoDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="flex justify-between items-center">
        <strong style={{ fontSize: 18 }}>{title}</strong>
        <button type="button" className="px-3 py-1 rounded-lg border border-slate-700" onClick={onClose}>Close</button>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </Modal>
  );
}

export function keyCombo(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return parts.join("+");
}

export type ShortcutRow = { id: string; label: string; group: string; shortcut?: string; defaultShortcut?: string };

type ShortcutsProps = {
  commands: ShortcutRow[];
  // "" unbinds a command; null restores its default.
  onSet: (id: string, shortcut: string | null) => void;
  onResetAll: () => void;
  onClose: () => void;
};

export function ShortcutsDialog({ commands, onSet, onResetAll, onClose }: ShortcutsProps) {
  const [recording, setRecording] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const groups = Array.from(new Set(commands.map((command) => command.group)));

  useEffect(() => {
    if (!recording) return;
    // Capture phase, so the app's own shortcuts don't fire while a key is being recorded.
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
      if (event.key === "Escape") {
        setRecording(null);
        return;
      }
      const combo = keyCombo(event);
      const clash = commands.find((command) => command.shortcut === combo && command.id !== recording);
      if (clash) {
        onSet(clash.id, "");
        setNotice(`${combo} was moved here from "${clash.label}".`);
      } else {
        setNotice("");
      }
      onSet(recording, combo);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, commands]);

  const small = "px-2 py-0.5 rounded-md border border-slate-700 text-xs";

  return (
    <InfoDialog title="Keyboard shortcuts" onClose={onClose}>
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>Click a shortcut to record a new one. Esc cancels recording.</div>
      {notice && <div style={{ color: "#fbbf24", fontSize: 12, marginBottom: 8 }}>{notice}</div>}
      {groups.map((group) => (
        <div key={group} className="mb-4">
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: 4 }}>{group}</div>
          {commands
            .filter((command) => command.group === group)
            .map((command) => (
              <div key={command.id} className="flex justify-between items-center gap-3 py-0.5">
                <span>{command.label}</span>
                <span className="flex items-center gap-2">
                  <button type="button" className={small} style={{ minWidth: 110, borderColor: recording === command.id ? "#f59e0b" : undefined }} onClick={() => setRecording(recording === command.id ? null : command.id)}>
                    {recording === command.id ? "Press keys…" : command.shortcut || "—"}
                  </button>
                  {command.shortcut && <button type="button" className={small} onClick={() => onSet(command.id, "")} title="Remove shortcut">Clear</button>}
                  {(command.shortcut ?? "") !== (command.defaultShortcut ?? "") && <button type="button" className={small} onClick={() => onSet(command.id, null)} title="Restore default">Reset</button>}
                </span>
              </div>
            ))}
        </div>
      ))}
      <div className="flex justify-between items-center">
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Vim normal mode keys aren't rebindable.</span>
        <button type="button" className={small} onClick={onResetAll}>Reset all to defaults</button>
      </div>
    </InfoDialog>
  );
}

export type SearchHit = { path: string; line: number; text: string };

type FindProps = {
  initialMode: "find" | "replace";
  content: string;
  onGoto: (line: number, pos: number) => void;
  onReplace: (content: string) => void;
  onClose: () => void;
  searchNovel: (query: string, caseSensitive: boolean) => Promise<SearchHit[]>;
  onOpenHit: (hit: SearchHit) => void;
};

// A floating panel so the manuscript stays visible while searching.
export function FindPanel({ initialMode, content, onGoto, onReplace, onClose, searchNovel, onOpenHit }: FindProps) {
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [index, setIndex] = useState(0);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => input.current?.focus(), []);

  const matches = useMemo(() => {
    if (!query) return [];
    const flags = caseSensitive ? "" : "i";
    const found: Array<{ line: number; pos: number }> = [];
    content.split("\n").forEach((line, lineIndex) => {
      const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), `g${flags}`);
      for (const match of line.matchAll(pattern)) found.push({ line: lineIndex, pos: match.index ?? 0 });
    });
    return found;
  }, [query, caseSensitive, content]);

  function step(delta: number) {
    if (matches.length === 0) return;
    const next = (index + delta + matches.length) % matches.length;
    setIndex(next);
    onGoto(matches[next].line, matches[next].pos);
  }

  function replaceOne() {
    const match = matches[Math.min(index, matches.length - 1)];
    if (!match) return;
    const lines = content.split("\n");
    const line = lines[match.line];
    lines[match.line] = line.slice(0, match.pos) + replacement + line.slice(match.pos + query.length);
    onReplace(lines.join("\n"));
  }

  function replaceAll() {
    if (!query) return;
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
    onReplace(content.replace(pattern, () => replacement));
  }

  const field = "px-2 py-1 rounded-md border border-slate-700 bg-transparent";
  const small = "px-2 py-1 rounded-md border border-slate-700";

  return (
    <div className="fixed rounded-xl border border-slate-700 bg-slate-900 text-slate-100 p-3 shadow-2xl flex flex-col gap-2" style={{ top: 56, right: 16, width: 380, zIndex: 60 }}>
      <div className="flex gap-2 items-center">
        <input
          ref={input}
          className={`${field} flex-1`}
          placeholder="Find"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setIndex(0); setHits(null); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") step(event.shiftKey ? -1 : 1);
            if (event.key === "Escape") onClose();
          }}
        />
        <button type="button" className={small} onClick={() => step(-1)} title="Previous">↑</button>
        <button type="button" className={small} onClick={() => step(1)} title="Next">↓</button>
        <button type="button" className={small} onClick={onClose} title="Close">✕</button>
      </div>
      {mode === "replace" && (
        <div className="flex gap-2">
          <input className={`${field} flex-1`} placeholder="Replace with" value={replacement} onChange={(event) => setReplacement(event.target.value)} />
          <button type="button" className={small} onClick={replaceOne}>Replace</button>
          <button type="button" className={small} onClick={replaceAll}>All</button>
        </div>
      )}
      <div className="flex gap-3 items-center" style={{ fontSize: 12 }}>
        <label className="flex items-center gap-1"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /> Match case</label>
        <span style={{ color: "var(--muted)" }}>{query ? `${matches.length} in this scene` : ""}</span>
        <div className="flex-1" />
        <button type="button" className={small} onClick={() => setMode(mode === "find" ? "replace" : "find")}>{mode === "find" ? "Replace…" : "Find only"}</button>
        <button type="button" className={small} disabled={!query} onClick={() => void searchNovel(query, caseSensitive).then(setHits)}>Search novel</button>
      </div>
      {hits && (
        <div style={{ maxHeight: 260, overflow: "auto", fontSize: 12 }}>
          {hits.length === 0 && <div style={{ color: "var(--muted)" }}>No matches in the manuscript.</div>}
          {hits.map((hit, i) => (
            <button key={i} type="button" className="block w-full text-left px-2 py-1 rounded-md bg-transparent hover:bg-slate-800" onClick={() => onOpenHit(hit)}>
              <div style={{ color: "var(--muted)" }}>{hit.path.split("/").slice(-2).join(" / ")}:{hit.line + 1}</div>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hit.text}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MarkdownGuide() {
  const row = (syntax: string, meaning: string) => (
    <div className="flex justify-between gap-6 py-0.5">
      <code>{syntax}</code>
      <span style={{ color: "var(--muted)" }}>{meaning}</span>
    </div>
  );
  return (
    <>
      {row("# Heading", "Heading (## and ### for smaller)")}
      {row("**bold**  *italic*  ~~strike~~", "Inline formatting")}
      {row("> quote", "Block quote")}
      {row("- item", "Bulleted list")}
      {row("***", "Scene break (also starts a new page for the drop cap)")}
      {row("[[Name]]", "Link to an element; hover to preview, click to open")}
      {row("::: poetry … :::", "Poetry block (Format > Poetry style)")}
      {row("<span class=\"DropCap\">T</span>", "Manual drop cap")}
      <div className="mt-3" style={{ color: "var(--muted)" }}>The line you're typing on shows raw markdown; every other line shows formatted.</div>
    </>
  );
}
