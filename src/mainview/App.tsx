import { marked } from "marked";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Library, { type NovelEntry } from "./Library";
import NovelSettings from "./NovelSettings";
import { type ElementItem, loadElements, novelFileUrl, post } from "./api";
import Elements from "./Elements";
import Planning from "./Planning";
import Research from "./Research";

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
};

type WorkspaceState = {
  workspace: string | null;
  settings: { appCss: string; markdownCss: string; tailwindClasses?: string };
};

const API_BASE = "http://localhost:4310";

const defaultAppCss = `
:root {
  color-scheme: dark;
  --border: rgba(148, 163, 184, 0.2);
  --muted: #94a3b8;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Inter", "Segoe UI", sans-serif;
}

button {
  transition: 0.2s ease;
}
`;

const defaultMarkdownCss = `
.markdown-body {
  font-family: "Georgia", "Iowan Old Style", serif;
  line-height: 1.75;
  color: #e5e7eb;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin-top: 1.4em;
  color: #f8fafc;
  font-weight: 700;
}

.markdown-body h1 { font-size: 2.2rem; }
.markdown-body h2 { font-size: 1.8rem; }
.markdown-body h3 { font-size: 1.4rem; }
.markdown-body p, .markdown-body li { font-size: 1rem; }
.markdown-body ul, .markdown-body ol { padding-left: 1.4rem; }
.markdown-body a { color: #fbbf24; }
.markdown-body em, .markdown-body span { font-style: italic; }
.markdown-body strong { color: #fff; }
.DropCap {
  font-size: 64px;
  font-style: normal;
  font-weight: bold;
}
.markdown-body blockquote { border-left: 3px solid #fbbf24; padding-left: 1rem; color: #cbd5e1; }
.markdown-body code {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
}
`;

const styleElements = [
  { key: "app", label: "Background", fallback: "bg-slate-950 text-slate-100" },
  { key: "header", label: "Header", fallback: "bg-slate-900 border-slate-700" },
  { key: "sidebar", label: "Sidebar", fallback: "bg-slate-900 border-slate-700 text-slate-400" },
  { key: "editor", label: "Editor", fallback: "bg-slate-950 text-slate-100 p-6" },
  { key: "panel", label: "Style panel", fallback: "bg-slate-900 border-slate-700" },
  { key: "button", label: "Buttons", fallback: "bg-amber-500 text-slate-900 rounded-lg" },
  { key: "status", label: "Status bar", fallback: "bg-slate-900 text-slate-400 border-slate-700" },
] as const;

type StyleKey = (typeof styleElements)[number]["key"];
type TailwindMap = Record<StyleKey, string>;

const defaultTailwind = Object.fromEntries(styleElements.map((e) => [e.key, e.fallback])) as TailwindMap;

function parseTailwind(raw?: string): TailwindMap {
  try {
    const parsed = JSON.parse(raw || "");
    if (parsed && typeof parsed === "object") return { ...defaultTailwind, ...parsed };
  } catch {
    // Legacy or empty value: use defaults.
  }
  return { ...defaultTailwind };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function getRelativePath(root: string, filePath: string) {
  return filePath.startsWith(root) ? filePath.slice(root.length + 1) : filePath;
}

// A folder's note is <Folder>/<Folder>.md.
function folderNotePath(dir: string) {
  return `${dir}/${dir.split("/").pop()}.md`;
}

function isFolderNotePath(path: string | null) {
  if (!path) return false;
  const parts = path.split("/");
  return parts.length > 1 && parts[parts.length - 1] === `${parts[parts.length - 2]}.md`;
}

type LiveEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className: string;
  disabled: boolean;
  dropCap?: boolean;
  elementNames?: string[];
  onOpenElement?: (name: string) => void;
  onHoverElement?: (name: string | null, rect?: DOMRect) => void;
  focusDim?: boolean;
};

// One editing surface: the active line is raw markdown, every other line is rendered.
function LiveEditor({ value, onChange, className, disabled, dropCap = true, elementNames = [], onOpenElement, onHoverElement, focusDim = false }: LiveEditorProps) {
  const lines = useMemo(() => value.split("\n"), [value]);
  const [active, setActive] = useState(0);
  const pending = useRef<{ line: number; pos: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const current = Math.min(active, lines.length - 1);
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);

  // Typing [[ offers matching elements to link to.
  const linkMatch = !disabled && lines[current] !== undefined ? /\[\[([^\]\n]*)$/.exec(lines[current].slice(0, caret)) : null;
  const suggestions = linkMatch ? elementNames.filter((name) => name.toLowerCase().includes(linkMatch[1].toLowerCase())).slice(0, 6) : [];

  function applySuggestion(name: string) {
    if (!linkMatch) return;
    const line = lines[current];
    const before = line.slice(0, linkMatch.index);
    const after = line.slice(caret);
    const next = [...lines];
    next[current] = `${before}[[${name}]]${after.startsWith("]]") ? after.slice(2) : after}`;
    update(next);
    const pos = before.length + name.length + 4;
    setCaret(pos);
    setSel(0);
    focusLine(current, pos);
  }

  const rendered = useMemo(() => {
    let inFence = false;
    // A page starts at the top of the file and after each horizontal rule.
    let pageStart = dropCap;
    return lines.map((line) => {
      if (line.trim().startsWith("```")) {
        inFence = !inFence;
        return { kind: "fence" as const, html: "" };
      }
      if (inFence) return { kind: "code" as const, html: "" };
      if (!line.trim()) return { kind: "blank" as const, html: "" };

      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        pageStart = dropCap;
        return { kind: "md" as const, html: marked.parse(line, { gfm: true }) as string };
      }

      let source = line;
      if (pageStart && !/^\s*(#|>|[-*+]\s|\d+[.)]\s|<|\||!\[)/.test(line)) {
        source = line.replace(/^(\s*["“'‘]?)(\p{L})/u, '$1<span class="DropCap">$2</span>');
        pageStart = false;
      } else if (!/^\s*#/.test(line)) {
        pageStart = false;
      }
      const known = new Set(elementNames.map((name) => name.toLowerCase()));
      const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      source = source.replace(/\[\[([^\]\n]+)\]\]/g, (_match, name: string) => {
        const trimmed = name.trim();
        return `<a class="element-link${known.has(trimmed.toLowerCase()) ? "" : " missing"}" data-element="${escape(trimmed)}">${escape(trimmed)}</a>`;
      });
      return { kind: "md" as const, html: marked.parse(source, { gfm: true }) as string };
    });
  }, [lines, dropCap, elementNames]);

  function update(next: string[]) {
    onChange(next.join("\n"));
  }

  function focusLine(line: number, pos: number) {
    pending.current = { line, pos };
    setActive(line);
  }

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (pending.current && pending.current.line === current) {
      el.focus();
      el.setSelectionRange(pending.current.pos, pending.current.pos);
      pending.current = null;
    }
  });

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    const pos = el.selectionStart;
    const end = el.selectionEnd;

    if (suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSel((prev) => (prev + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applySuggestion(suggestions[Math.min(sel, suggestions.length - 1)]);
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const next = [...lines];
      next.splice(current, 1, lines[current].slice(0, pos), lines[current].slice(end));
      update(next);
      focusLine(current + 1, 0);
    } else if (event.key === "Backspace" && pos === 0 && end === 0 && current > 0) {
      event.preventDefault();
      const next = [...lines];
      const joinAt = lines[current - 1].length;
      next.splice(current - 1, 2, lines[current - 1] + lines[current]);
      update(next);
      focusLine(current - 1, joinAt);
    } else if (event.key === "ArrowUp" && current > 0 && !event.shiftKey) {
      event.preventDefault();
      focusLine(current - 1, Math.min(pos, lines[current - 1].length));
    } else if (event.key === "ArrowDown" && current < lines.length - 1 && !event.shiftKey) {
      event.preventDefault();
      focusLine(current + 1, Math.min(pos, lines[current + 1].length));
    } else if (event.key === "ArrowLeft" && pos === 0 && end === 0 && current > 0) {
      event.preventDefault();
      focusLine(current - 1, lines[current - 1].length);
    } else if (event.key === "ArrowRight" && pos === lines[current].length && current < lines.length - 1) {
      event.preventDefault();
      focusLine(current + 1, 0);
    }
  }

  if (disabled) {
    return <div className={`flex-1 overflow-auto ${className}`} style={{ color: "var(--muted)" }}>Choose a workspace and open or create a file to start writing.</div>;
  }

  return (
    <div className={`flex-1 overflow-auto ${className}`}>
      <style>{`.markdown-body.live-line > :first-child{margin-top:0}.markdown-body.live-line > :last-child{margin-bottom:0}.element-link{color:#38bdf8;border-bottom:1px dotted #38bdf8;cursor:pointer}.element-link.missing{color:#f87171;border-bottom-color:#f87171}.focus-lines > *{transition:opacity 1.2s ease}.focus-lines.focus-dim > *:not(.active-line){opacity:0.06}`}</style>
      <div
        className={`markdown-body focus-lines${focusDim ? " focus-dim" : ""}`}
        onMouseOver={(event) => {
          const link = (event.target as HTMLElement).closest?.("[data-element]");
          if (link) onHoverElement?.(link.getAttribute("data-element"), link.getBoundingClientRect());
        }}
        onMouseOut={(event) => {
          if ((event.target as HTMLElement).closest?.("[data-element]")) onHoverElement?.(null);
        }}
      >
        {lines.map((line, index) => {
          if (index === current) {
            return (
              <div key={index} className="active-line" style={{ position: "relative" }}>
              <textarea
                ref={inputRef}
                rows={1}
                value={line}
                spellCheck
                onChange={(event) => {
                  const next = [...lines];
                  next[index] = event.target.value.replace(/\n/g, " ");
                  update(next);
                  setCaret(event.target.selectionStart ?? 0);
                  setSel(0);
                }}
                onSelect={(event) => setCaret((event.target as HTMLTextAreaElement).selectionStart ?? 0)}
                onKeyDown={onKeyDown}
                style={{
                  display: "block",
                  width: "100%",
                  resize: "none",
                  overflow: "hidden",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "inherit",
                  padding: 0,
                  font: "inherit",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 14,
                  lineHeight: 1.75,
                }}
              />
              {suggestions.length > 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-900 text-slate-100 py-1 shadow-lg" style={{ position: "absolute", left: 0, top: "100%", zIndex: 20, minWidth: 200 }}>
                  {suggestions.map((name, i) => (
                    <div key={name} className="px-3 py-1 cursor-pointer" style={{ background: i === Math.min(sel, suggestions.length - 1) ? "rgba(245,158,11,0.25)" : undefined }} onMouseDown={(event) => { event.preventDefault(); applySuggestion(name); }}>
                      {name}
                    </div>
                  ))}
                </div>
              )}
              </div>
            );
          }

          const item = rendered[index];
          const common = {
            key: index,
            onMouseDown: (event: React.MouseEvent) => {
              event.preventDefault();
              const link = (event.target as HTMLElement).closest?.("[data-element]");
              if (link && onOpenElement) {
                onOpenElement(link.getAttribute("data-element") ?? "");
                return;
              }
              focusLine(index, line.length);
            },
          };
          if (item.kind === "blank") return <div {...common} style={{ minHeight: "1.75em" }} />;
          if (item.kind === "md") return <div {...common} className="markdown-body live-line" dangerouslySetInnerHTML={{ __html: item.html }} />;
          return (
            <div {...common} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, whiteSpace: "pre-wrap", background: "rgba(15, 23, 42, 0.8)", padding: "0 0.75rem", minHeight: "1.75em" }}>
              {line}
            </div>
          );
        })}
        <div style={{ minHeight: 160 }} onMouseDown={(event) => { event.preventDefault(); focusLine(lines.length - 1, lines[lines.length - 1].length); }} />
      </div>
    </div>
  );
}

function App() {
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [appCss, setAppCss] = useState(defaultAppCss);
  const [tw, setTw] = useState<TailwindMap>(defaultTailwind);
  const [markdownCss, setMarkdownCss] = useState(defaultMarkdownCss);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [status, setStatus] = useState("Choose a workspace folder to begin.");
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [novel, setNovel] = useState<NovelEntry | null>(null);
  const [novelSettingsOpen, setNovelSettingsOpen] = useState(false);
  const [tab, setTab] = useState<"manuscript" | "planning" | "elements" | "research">("manuscript");
  const [elements, setElements] = useState<ElementItem[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hoverElement, setHoverElement] = useState<{ name: string; x: number; y: number } | null>(null);

  // Focus mode: the interface and every line but the current one fade away; moving the mouse brings them back until it rests for 3 seconds.
  const [focusMode, setFocusMode] = useState(false);
  const [awake, setAwake] = useState(true);
  const wakeTimer = useRef<number | undefined>(undefined);
  const lastMouse = useRef({ x: 0, y: 0 });

  function toggleFocus(event: React.MouseEvent) {
    window.clearTimeout(wakeTimer.current);
    if (focusMode) {
      setFocusMode(false);
      setAwake(true);
      return;
    }
    lastMouse.current = { x: event.clientX, y: event.clientY };
    setAwake(false);
    setFocusMode(true);
  }

  useEffect(() => {
    if (!focusMode) return;
    const onMove = (event: MouseEvent) => {
      // Ignore the jitter of the click that started focus mode.
      if (Math.hypot(event.clientX - lastMouse.current.x, event.clientY - lastMouse.current.y) < 6) return;
      lastMouse.current = { x: event.clientX, y: event.clientY };
      setAwake(true);
      window.clearTimeout(wakeTimer.current);
      wakeTimer.current = window.setTimeout(() => setAwake(false), 3000);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusMode(false);
        setAwake(true);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(wakeTimer.current);
    };
  }, [focusMode]);

  useEffect(() => {
    if (focusMode && (!novel || tab !== "manuscript")) {
      setFocusMode(false);
      setAwake(true);
    }
  }, [focusMode, novel, tab]);

  const dim = focusMode && !awake;
  const fade: React.CSSProperties = { opacity: dim ? 0 : 1, pointerEvents: dim ? "none" : undefined, transition: "opacity 1.2s ease" };
  const elementNames = useMemo(() => elements.map((element) => element.name), [elements]);
  const [treeMenu, setTreeMenu] = useState<{ x: number; y: number; node: TreeNode; siblings: TreeNode[] } | null>(null);
  const dragPath = useRef<string | null>(null);
  const savedRef = useRef<{ path: string; content: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(() => localStorage.getItem("ghoaxtwriter.confirmDelete") !== "false");

  useEffect(() => {
    localStorage.setItem("ghoaxtwriter.confirmDelete", String(confirmDelete));
  }, [confirmDelete]);

  useEffect(() => {
    const close = () => setTreeMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  async function fetchTree(target: NovelEntry | null = novel) {
    const rel = target && workspace ? getRelativePath(workspace, target.path) : "";
    return apiFetch<{ tree: TreeNode[]; workspace: string }>(`/api/tree?root=${encodeURIComponent(rel)}`);
  }

  async function openNovel(target: NovelEntry) {
    setNovel(target);
    setSelectedFile(null);
    setFileContent("");
    setSelectedFolder(target.path);
    setTab("manuscript");
    setHoverElement(null);
    setElements([]);
    void loadElements(apiFetch, target.path).then(setElements).catch(() => undefined);
    setTree((await fetchTree(target)).tree);
    setStatus(`Opened: ${target.meta.title}`);
  }

  function closeNovel() {
    setNovel(null);
    setSelectedFile(null);
    setFileContent("");
  }

  async function createFolder(kind: "Act" | "Chapter", parentOverride?: string) {
    if (!workspace || !novel) return;
    const name = window.prompt(`New ${kind.toLowerCase()} name`, kind);
    if (!name?.trim()) return;
    // Acts sit at the novel root; chapters go inside the selected folder.
    const parent = parentOverride ?? (kind === "Act" ? novel.path : selectedFolder ?? novel.path);
    try {
      await apiFetch("/api/folder", {
        method: "POST",
        body: JSON.stringify({ path: getRelativePath(workspace, `${parent}/${name.trim()}`) }),
      });
      setTree((await fetchTree()).tree);
      if (!parentOverride) setSelectedFolder(`${parent}/${name.trim()}`);
      setStatus(`Created ${kind.toLowerCase()}: ${name.trim()}`);
    } catch (error) {
      setStatus(errorText(error));
    }
  }

  function openElement(name: string) {
    setHoverElement(null);
    const found = elements.find((element) => element.name.toLowerCase() === name.toLowerCase());
    if (found) {
      setSelectedElementId(found.id);
      setTab("elements");
      return;
    }
    if (!novel || !window.confirm(`Create an element named "${name}"?`)) return;
    void post<{ item: ElementItem }>(apiFetch, "/api/elements/save", { novel: novel.path, name, type: "Character", notes: "" })
      .then((result) => {
        setElements((prev) => [...prev, result.item]);
        setSelectedElementId(result.item.id);
        setTab("elements");
      })
      .catch((error) => setStatus(errorText(error)));
  }

  function applySettings(settings: WorkspaceState["settings"]) {
    setAppCss(settings.appCss || defaultAppCss);
    setMarkdownCss(settings.markdownCss || defaultMarkdownCss);
    setTw(parseTailwind(settings.tailwindClasses));
  }

  async function refreshWorkspace() {
    try {
      const result = await apiFetch<WorkspaceState>("/api/workspace");
      setWorkspace(result.workspace);
      applySettings(result.settings);
      if (result.workspace) {
        const treeResult = await fetchTree(null);
        setTree(treeResult.tree);
        setStatus(`Workspace ready: ${result.workspace}`);
      } else {
        setTree([]);
      }
    } catch (error) {
      console.error(error);
      setStatus("Unable to load workspace.");
    }
  }

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  async function chooseWorkspace() {
    try {
      const result = await apiFetch<WorkspaceState>("/api/select-workspace", { method: "POST" });
      setNovel(null);
      setWorkspace(result.workspace);
      applySettings(result.settings);

      if (result.workspace) {
        const treeResult = await fetchTree(null);
        setTree(treeResult.tree);
        setSelectedFolder(result.workspace);
        setSelectedFile(null);
        setFileContent("");
        setStatus(`Workspace selected: ${result.workspace}`);
      }
    } catch (error) {
      console.error(error);
      setStatus("No workspace selected.");
    }
  }

  async function loadFile(filePath: string) {
    const result = await apiFetch<{ path: string; content: string }>(`/api/file?path=${encodeURIComponent(getRelativePath(workspace || "", filePath))}`);
    setSelectedFile(filePath);
    setFileContent(result.content);
  }

  // A folder's note is <Folder>/<Folder>.md; it may not exist until the first edit.
  async function openFolderNote(dir: string) {
    const notePath = folderNotePath(dir);
    let content = "";
    try {
      content = (await apiFetch<{ content: string }>(`/api/file?path=${encodeURIComponent(getRelativePath(workspace || "", notePath))}`)).content;
    } catch {
      // No note yet.
    }
    savedRef.current = { path: notePath, content };
    setSelectedFolder(dir);
    setSelectedFile(notePath);
    setFileContent(content);
  }

  async function saveFile() {
    if (!selectedFile || !workspace) return;
    // Skip untouched files so merely opening a folder note doesn't create an empty note file.
    if (savedRef.current?.path === selectedFile && savedRef.current.content === fileContent) return;
    await apiFetch<{ ok: boolean }>("/api/file", {
      method: "POST",
      body: JSON.stringify({ path: getRelativePath(workspace, selectedFile), content: fileContent }),
    });
    savedRef.current = { path: selectedFile, content: fileContent };
    setStatus(`Autosaved: ${selectedFile}`);
  }

  useEffect(() => {
    if (!selectedFile || !workspace) return;
    const timeout = window.setTimeout(() => {
      void saveFile();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [fileContent, selectedFile, workspace]);

  async function persistStyles(next: { appCss: string; markdownCss: string; tw: TailwindMap }) {
    if (!workspace) return;
    await apiFetch<{ saved: boolean }>("/api/settings", {
      method: "POST",
      body: JSON.stringify({ appCss: next.appCss, markdownCss: next.markdownCss, tailwindClasses: JSON.stringify(next.tw) }),
    });
  }

  async function saveStyles() {
    await persistStyles({ appCss, markdownCss, tw });
    setStatus("Styles saved to workspace settings.");
  }

  async function resetStyles() {
    setAppCss(defaultAppCss);
    setMarkdownCss(defaultMarkdownCss);
    setTw(defaultTailwind);
    await persistStyles({ appCss: defaultAppCss, markdownCss: defaultMarkdownCss, tw: defaultTailwind });
    setStatus("Styles reset to defaults.");
  }

  async function createFile(dirOverride?: string) {
    if (!workspace) {
      setStatus("Select a workspace folder first.");
      return;
    }

    const name = window.prompt("New scene name", "New scene");
    if (!name?.trim()) return;

    const trimmed = name.trim();
    const finalName = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
    const targetFolder = dirOverride ?? (selectedFolder && selectedFolder !== workspace ? selectedFolder : workspace);
    const newPath = `${targetFolder}/${finalName}`;
    const initial = "";

    try {
      await apiFetch("/api/file", {
        method: "POST",
        body: JSON.stringify({ path: getRelativePath(workspace, newPath), content: initial }),
      });
    } catch (error) {
      setStatus(errorText(error));
      return;
    }

    const nextTree = await fetchTree();
    setTree(nextTree.tree);
    setStatus(`Created: ${finalName}`);
    // Cards made from the Planning tab stay on the board.
    if (dirOverride) return;
    savedRef.current = { path: newPath, content: initial };
    setSelectedFolder(targetFolder);
    setSelectedFile(newPath);
    setFileContent(initial);
  }

  async function deleteNode(node: TreeNode) {
    if (!workspace) return;
    const what = node.type === "dir" ? `folder "${node.name}" and everything in it` : `"${node.name}"`;
    if (confirmDelete && !window.confirm(`Delete ${what}?`)) return;

    try {
      await apiFetch("/api/file/delete", {
        method: "POST",
        body: JSON.stringify({ path: getRelativePath(workspace, node.path) }),
      });
    } catch (error) {
      setStatus(errorText(error));
      return;
    }

    const inside = (value: string | null) => !!value && (value === node.path || value.startsWith(`${node.path}/`));
    if (inside(selectedFile)) {
      setSelectedFile(null);
      setFileContent("");
    }
    if (inside(selectedFolder)) setSelectedFolder(novel?.path ?? workspace);
    setTree((await fetchTree()).tree);
    setStatus(`Deleted: ${node.name}`);
  }

  function findNode(nodes: TreeNode[], path: string): TreeNode | null {
    for (const node of nodes) {
      if (node.path === path) return node;
      const inner = node.children ? findNode(node.children, path) : null;
      if (inner) return inner;
    }
    return null;
  }

  function errorText(error: unknown) {
    const raw = error instanceof Error ? error.message : String(error);
    try {
      return JSON.parse(raw).error ?? raw;
    } catch {
      return raw;
    }
  }

  // Keep the open file/folder pointing at the right place after a rename or move.
  function remapSelection(oldPath: string, newPath: string) {
    const remap = (value: string | null) => (value && (value === oldPath || value.startsWith(`${oldPath}/`)) ? newPath + value.slice(oldPath.length) : value);
    setSelectedFile((prev) => remap(prev));
    setSelectedFolder((prev) => remap(prev));
  }

  async function renameNode(node: TreeNode) {
    if (!workspace) return;
    const current = node.type === "file" ? node.name.replace(/\.md$/i, "") : node.name;
    const name = window.prompt("Rename", current);
    if (!name?.trim() || name.trim() === current) return;
    try {
      const result = await apiFetch<{ path: string }>("/api/rename", {
        method: "POST",
        body: JSON.stringify({ path: getRelativePath(workspace, node.path), name }),
      });
      remapSelection(node.path, result.path);
      setTree((await fetchTree()).tree);
      setStatus(`Renamed to ${name.trim()}`);
    } catch (error) {
      setStatus(errorText(error));
    }
  }

  async function moveNode(node: TreeNode, toDir: string, before?: string) {
    if (!workspace) return;
    try {
      const result = await apiFetch<{ path: string }>("/api/move", {
        method: "POST",
        body: JSON.stringify({ path: getRelativePath(workspace, node.path), toDir: getRelativePath(workspace, toDir), before }),
      });
      remapSelection(node.path, result.path);
      setTree((await fetchTree()).tree);
      setStatus(`Moved ${node.name}`);
    } catch (error) {
      setStatus(errorText(error));
    }
  }

  function shiftNode(node: TreeNode, siblings: TreeNode[], direction: -1 | 1) {
    const index = siblings.findIndex((s) => s.path === node.path);
    const parent = node.path.slice(0, node.path.lastIndexOf("/"));
    // Moving down places the node before the sibling two ahead, or at the end.
    const before = direction === -1 ? siblings[index - 1]?.name : siblings[index + 2]?.name;
    void moveNode(node, parent, before);
  }

  const buttonBase = `px-3 py-2 ${tw.button}`;
  const ghostButton = "px-3 py-2 rounded-lg border border-slate-700 bg-transparent";

  function renderTree(nodes: TreeNode[], depth = 0): JSX.Element[] {
    return nodes.flatMap((node) => {
      const isNote = node.type === "dir" && selectedFile === folderNotePath(node.path);
      const isSelected = isNote || selectedFile === node.path;
      const parent = node.path.slice(0, node.path.lastIndexOf("/"));
      return [
        <div
          key={node.path}
          style={{ marginLeft: depth * 14 }}
          className="flex items-center gap-1"
          draggable
          onDragStart={() => { dragPath.current = node.path; }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dragged = dragPath.current ? findNode(tree, dragPath.current) : null;
            dragPath.current = null;
            if (!dragged || dragged.path === node.path) return;
            // Dropping on a folder moves into it; dropping on a file places the item before it.
            if (node.type === "dir") void moveNode(dragged, node.path);
            else void moveNode(dragged, parent, node.name);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setTreeMenu({ x: event.clientX, y: event.clientY, node, siblings: nodes });
          }}
        >
          <button
            type="button"
            className={`flex-1 text-left px-2 py-1 rounded-md border ${isSelected ? "border-amber-500 font-bold" : "border-transparent"}`}
            onClick={() => {
              if (node.type === "dir") {
                void openFolderNote(node.path);
                return;
              }
              void loadFile(node.path);
              setSelectedFolder(node.path.slice(0, node.path.lastIndexOf("/")));
            }}
          >
            {node.type === "dir" ? "📁" : "📄"} {node.name}
          </button>
          <button type="button" title="Delete" className="px-2 opacity-60" onClick={() => void deleteNode(node)}>
            ✕
          </button>
        </div>,
        ...(node.type === "dir" && node.children ? renderTree(node.children, depth + 1) : []),
      ];
    });
  }

  const textareaStyle = { width: "100%", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(0,0,0,0.25)", color: "inherit", padding: 12, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, resize: "vertical" as const };

  return (
    <>
      <style>{appCss}</style>
      <style>{markdownCss}</style>

      <div className={`h-screen flex flex-col ${tw.app}`} style={{ cursor: dim ? "none" : undefined }}>
        <div className={`flex justify-between items-center px-4 py-3 border-b ${tw.header}`} style={fade}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{novel ? novel.meta.title : "GhoaxtWriter"}</h1>
          <div className="flex gap-2 flex-wrap">
            {novel && <button type="button" onClick={closeNovel} className={ghostButton}>Library</button>}
            <button type="button" onClick={chooseWorkspace} className={buttonBase}>
              {workspace ? "Change workspace" : "Choose workspace"}
            </button>
            {novel && tab === "manuscript" && <button type="button" onClick={() => void createFolder("Act")} className={ghostButton}>New act</button>}
            {novel && tab === "manuscript" && <button type="button" onClick={() => void createFolder("Chapter")} className={ghostButton}>New chapter</button>}
            {novel && <button type="button" onClick={() => setNovelSettingsOpen(true)} className={ghostButton}>Novel settings</button>}
            {novel && tab === "manuscript" && <button type="button" onClick={() => void createFile()} className={ghostButton}>New scene</button>}
            {novel && tab === "manuscript" && selectedFile && <button type="button" onClick={toggleFocus} className={ghostButton}>Focus mode</button>}
            <button type="button" onClick={() => setStyleEditorOpen((prev) => !prev)} className={ghostButton}>
              Settings
            </button>
          </div>
        </div>

        {!novel ? (
          workspace ? (
            <Library key={workspace} apiFetch={apiFetch} onOpen={(entry) => void openNovel(entry)} onStatus={setStatus} buttonClass={tw.button} className={`p-6 ${tw.editor}`} />
          ) : (
            <div className={`flex-1 p-6 ${tw.editor}`} style={{ color: "var(--muted)" }}>Choose a workspace folder to see your library.</div>
          )
        ) : (
        <>
        <div className={`flex gap-1 px-4 pt-2 border-b ${tw.header}`} style={fade}>
          {([["manuscript", "Manuscript"], ["planning", "Planning"], ["elements", "Elements"], ["research", "Research"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-t-lg border-b-2 bg-transparent ${tab === key ? "border-amber-500 font-bold" : "border-transparent"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "planning" && workspace && (
          <Planning
            tree={tree}
            novelPath={novel.path}
            novelRel={getRelativePath(workspace, novel.path)}
            apiFetch={apiFetch}
            onMove={(node, toDir, before) => moveNode(node, toDir, before)}
            onOpenFile={(path) => {
              setTab("manuscript");
              setSelectedFolder(path.slice(0, path.lastIndexOf("/")));
              void loadFile(path);
            }}
            onOpenFolder={(path) => {
              setTab("manuscript");
              void openFolderNote(path);
            }}
            onCreateScene={(dir) => void createFile(dir)}
            onCreateFolder={(parent, kind) => void createFolder(kind, parent)}
          />
        )}
        {tab === "elements" && (
          <Elements novelPath={novel.path} apiFetch={apiFetch} items={elements} setItems={setElements} selectedId={selectedElementId} onSelect={setSelectedElementId} confirmDelete={confirmDelete} buttonClass={tw.button} onStatus={setStatus} />
        )}
        {tab === "research" && <Research novelPath={novel.path} apiFetch={apiFetch} confirmDelete={confirmDelete} buttonClass={tw.button} onStatus={setStatus} />}

        {tab === "manuscript" && (
        <div className="flex flex-1 min-h-0">
          <aside className={`w-64 shrink-0 overflow-auto p-2 border-r ${tw.sidebar}`} style={fade}>
            {workspace ? renderTree(tree) : <div style={{ color: "var(--muted)" }}>No workspace selected.</div>}
          </aside>

          <div className="flex-1 flex flex-col min-w-0">
            {isFolderNotePath(selectedFile) && (
              <div className="px-4 py-2 text-xs border-b border-slate-700" style={{ color: "var(--muted)", ...fade }}>
                Folder note: {selectedFile!.split("/").slice(-2, -1)[0]}
              </div>
            )}
            <LiveEditor key={selectedFile ?? "none"} value={fileContent} onChange={setFileContent} className={tw.editor} disabled={!selectedFile} dropCap={!isFolderNotePath(selectedFile)} elementNames={elementNames} onOpenElement={openElement} onHoverElement={(name, rect) => setHoverElement(name && rect ? { name, x: rect.left, y: rect.bottom } : null)} focusDim={dim} />
          </div>
        </div>
        )}
        </>
        )}

        {styleEditorOpen && (
          <aside className={`fixed top-0 right-0 bottom-0 w-96 overflow-auto p-4 border-l shadow-2xl ${tw.panel}`} style={{ zIndex: 40, ...fade }} onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <strong style={{ fontSize: 18 }}>Settings</strong>
              <button type="button" onClick={() => setStyleEditorOpen(false)} className={ghostButton}>Close</button>
            </div>

            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>General</div>
            <label className="flex items-center gap-2 mb-6">
              <input type="checkbox" checked={confirmDelete} onChange={(event) => setConfirmDelete(event.target.checked)} />
              Ask for confirmation before deleting
            </label>

            <div className="flex justify-between items-center mb-3">
              <strong>Appearance</strong>
              <div className="flex gap-2">
                <button type="button" onClick={() => void resetStyles()} className={ghostButton}>Reset</button>
                <button type="button" onClick={() => void saveStyles()} className={buttonBase}>Save</button>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Tailwind classes per element</div>
            {styleElements.map((element) => (
              <div key={element.key} className="mb-2">
                <button
                  type="button"
                  onClick={() => setOpenStyle(openStyle === element.key ? null : element.key)}
                  className={`w-full text-left px-3 py-2 rounded-lg border ${openStyle === element.key ? "border-amber-500" : "border-slate-700"}`}
                >
                  {element.label}
                </button>
                {openStyle === element.key && (
                  <input
                    autoFocus
                    value={tw[element.key]}
                    onChange={(event) => setTw({ ...tw, [element.key]: event.target.value })}
                    placeholder={element.fallback}
                    style={{ ...textareaStyle, resize: "none", marginTop: 6 }}
                  />
                )}
              </div>
            ))}

            <div style={{ fontSize: 11, color: "var(--muted)", margin: "14px 0 6px" }}>Custom CSS</div>
            {([
              ["markdown", "Markdown formatting", markdownCss, setMarkdownCss, 260],
              ["appcss", "App CSS", appCss, setAppCss, 180],
            ] as const).map(([key, label, value, setter, height]) => (
              <div key={key} className="mb-2">
                <button
                  type="button"
                  onClick={() => setOpenStyle(openStyle === key ? null : key)}
                  className={`w-full text-left px-3 py-2 rounded-lg border ${openStyle === key ? "border-amber-500" : "border-slate-700"}`}
                >
                  {label}
                </button>
                {openStyle === key && (
                  <textarea value={value} onChange={(event) => setter(event.target.value)} style={{ ...textareaStyle, minHeight: height, marginTop: 6 }} />
                )}
              </div>
            ))}
          </aside>
        )}

        <div className={`px-4 py-2 text-xs border-t ${tw.status}`} style={fade}>{status}</div>

        {novel && hoverElement && (() => {
          const found = elements.find((element) => element.name.toLowerCase() === hoverElement.name.toLowerCase());
          return (
            <div
              className="fixed w-80 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 p-4 shadow-2xl"
              style={{ zIndex: 55, left: Math.max(8, Math.min(hoverElement.x, window.innerWidth - 340)), top: hoverElement.y + 8, pointerEvents: "none", maxHeight: "50vh", overflow: "hidden" }}
            >
              {found ? (
                <>
                  <div className="flex gap-3 items-center mb-2">
                    {found.image && <img src={novelFileUrl(novel.path, found.image, found.imageVersion)} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />}
                    <div>
                      <strong style={{ fontSize: 16 }}>{found.name}</strong>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{found.type}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{found.notes.slice(0, 500) || "No notes yet."}</div>
                </>
              ) : (
                <div style={{ fontSize: 13 }}>No element named "{hoverElement.name}" yet. Click to create it.</div>
              )}
            </div>
          );
        })()}

        {treeMenu && (() => {
          const index = treeMenu.siblings.findIndex((s) => s.path === treeMenu.node.path);
          const items = [
            { label: "Rename…", disabled: false, run: () => void renameNode(treeMenu.node) },
            { label: "Move up", disabled: index <= 0, run: () => shiftNode(treeMenu.node, treeMenu.siblings, -1) },
            { label: "Move down", disabled: index >= treeMenu.siblings.length - 1, run: () => shiftNode(treeMenu.node, treeMenu.siblings, 1) },
            { label: "Delete", disabled: false, run: () => void deleteNode(treeMenu.node) },
          ];
          return (
            <div className="fixed rounded-lg border border-slate-700 bg-slate-900 text-slate-100 py-1 shadow-lg" style={{ left: treeMenu.x, top: treeMenu.y, zIndex: 50, minWidth: 150 }}>
              {items.map((item) => (
                <button key={item.label} type="button" disabled={item.disabled} className="block w-full text-left px-3 py-2 bg-transparent" style={{ opacity: item.disabled ? 0.4 : 1 }} onClick={item.run}>
                  {item.label}
                </button>
              ))}
            </div>
          );
        })()}

        {novel && novelSettingsOpen && (
          <NovelSettings
            novel={novel}
            apiFetch={apiFetch}
            buttonClass={tw.button}
            onClose={() => setNovelSettingsOpen(false)}
            onSaved={(meta, path) => {
              const updated = { ...novel, meta, path };
              if (path !== novel.path) remapSelection(novel.path, path);
              setNovel(updated);
              setNovelSettingsOpen(false);
              void fetchTree(updated).then((result) => setTree(result.tree));
              setStatus("Novel settings saved.");
            }}
          />
        )}
      </div>
    </>
  );
}

export default App;
