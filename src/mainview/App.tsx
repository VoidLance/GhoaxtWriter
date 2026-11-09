import { useEffect, useMemo, useRef, useState } from "react";
import Library, { type NovelEntry } from "./Library";
import NovelSettings from "./NovelSettings";
import { LiveEditor, type EditorHandle, type VimMode } from "./LiveEditor";
import { Menubar, type MenuDef, type MenuItem } from "./Menubar";
import { FindPanel, InfoDialog, keyCombo, MarkdownGuide, ShortcutsDialog, type SearchHit } from "./Dialogs";
import { formatWords, usePrefs, type Tab } from "./prefs";
import { SettingsPanel } from "./SettingsPanel";
import { ExportDialog, type ExportOptions } from "./ExportDialog";
import { GoalsDialog } from "./GoalsDialog";
import { FormatDialog } from "./FormatDialog";
import { ImportDialog } from "./ImportDialog";
import { dailyTarget, remapGoalPaths, todayKey, type Goals } from "./goals";
import { defaultTypography, ensureTypography, withTypography } from "./typography";
import { type ElementItem, loadElements, novelFileUrl, post } from "./api";
import Elements from "./Elements";
import Planning from "./Planning";
import Research from "./Research";
import { ChapterDialog, MatterDialog } from "./ManuscriptDialogs";
import { manuscriptSettings, type ChapterInfo } from "../shared/manuscript";

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
  displayName?: string;
  chapter?: ChapterInfo;
  isAct?: boolean;
  generatedContents?: boolean;
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

const baseMarkdownCss = `
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

const defaultMarkdownCss = withTypography(baseMarkdownCss, defaultTypography);

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
  const [novel, setNovel] = useState<NovelEntry | null>(null);
  const [novelSettingsOpen, setNovelSettingsOpen] = useState(false);
  const [chapterSettings, setChapterSettings] = useState<TreeNode | null>(null);
  const [matterPosition, setMatterPosition] = useState<"front" | "back" | null>(null);
  const [splitBusy, setSplitBusy] = useState(false);
  const splitLock = useRef(false);
  const chapterFocus = useRef<string | null>(null);
  const [tab, setTab] = useState<Tab>("manuscript");
  const [elements, setElements] = useState<ElementItem[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hoverElement, setHoverElement] = useState<{ name: string; x: number; y: number } | null>(null);

  const [prefs, setPrefs] = usePrefs();
  const confirmDelete = prefs.confirmDelete;
  const editorRef = useRef<EditorHandle | null>(null);
  const [vimMode, setVimMode] = useState<VimMode | null>(null);
  const [dialog, setDialog] = useState<null | "shortcuts" | "about" | "welcome" | "markdown" | "goals" | "export" | "email" | "import" | "format">(null);
  const [find, setFind] = useState<null | "find" | "replace">(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  // Focus mode: the interface and every line but the current one fade away; moving the mouse brings them back until it rests for 3 seconds.
  // It stays on while you visit other tabs and applies again when you return to the manuscript.
  const [focusMode, setFocusMode] = useState(false);
  const [awake, setAwake] = useState(true);
  const wakeTimer = useRef<number | undefined>(undefined);
  const lastMouse = useRef({ x: 0, y: 0 });

  function toggleFocus() {
    window.clearTimeout(wakeTimer.current);
    if (focusMode) {
      setFocusMode(false);
      setAwake(true);
      return;
    }
    setAwake(false);
    setFocusMode(true);
  }

  useEffect(() => {
    if (focusMode) return;
    const track = (event: MouseEvent) => {
      lastMouse.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("mousemove", track);
    return () => window.removeEventListener("mousemove", track);
  }, [focusMode]);

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
    if (focusMode && !novel) {
      setFocusMode(false);
      setAwake(true);
    }
  }, [focusMode, novel]);

  const dim = focusMode && !awake && !!novel && tab === "manuscript";
  const fade: React.CSSProperties = { opacity: dim ? 0 : 1, pointerEvents: dim ? "none" : undefined, transition: "opacity 1.2s ease" };
  const elementNames = useMemo(() => elements.map((element) => element.name), [elements]);
  const [treeMenu, setTreeMenu] = useState<{ x: number; y: number; node: TreeNode; siblings: TreeNode[] } | null>(null);
  const dragPath = useRef<string | null>(null);
  const savedRef = useRef<{ path: string; content: string } | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const activeFileRef = useRef(selectedFile);
  activeFileRef.current = selectedFile;
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
    setTab(prefs.defaultTab);
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
    let parent = parentOverride ?? (kind === "Act" ? novel.path : selectedFolder ?? novel.path);
    const selected = findNode(tree, parent);
    if (!parentOverride && kind === "Chapter" && selected?.type === "dir" && !selected.isAct && !/^act(?:\s+\d+)?$/i.test(selected.name)) parent = parent.slice(0, parent.lastIndexOf("/"));
    const siblings = parent === novel.path ? tree : findNode(tree, parent)?.children ?? [];
    let number = 1;
    while (siblings.some((node) => node.name === `Chapter ${number}`)) number++;
    const name = window.prompt(`New ${kind.toLowerCase()} name`, kind === "Chapter" ? `Chapter ${number}` : kind);
    if (!name?.trim()) return;
    if (/[\\/]/.test(name) || name.trim().startsWith(".")) {
      setStatus("Folder names cannot contain slashes or start with a dot.");
      return;
    }
    try {
      await apiFetch("/api/folder", {
        method: "POST",
        body: JSON.stringify({ path: getRelativePath(workspace, `${parent}/${name.trim()}`), kind }),
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
    setMarkdownCss(ensureTypography(settings.markdownCss || defaultMarkdownCss));
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
    savedRef.current = { path: filePath, content: result.content };
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
    const path = selectedFile;
    const content = fileContent;
    // Skip untouched files so merely opening a folder note doesn't create an empty note file.
    const task = saveQueue.current.catch((error) => {
      console.error("Previous save failed:", error);
    }).then(async () => {
      if (savedRef.current?.path === path && savedRef.current.content === content) return;
      await apiFetch<{ ok: boolean }>("/api/file", {
        method: "POST",
        body: JSON.stringify({ path: getRelativePath(workspace, path), content }),
      });
      savedRef.current = { path, content };
      setStatus(`Autosaved: ${path}`);
    });
    saveQueue.current = task;
    await task;
  }

  useEffect(() => {
    if (!selectedFile || !workspace || splitBusy || findNode(tree, selectedFile)?.generatedContents) return;
    const timeout = window.setTimeout(() => {
      if (!splitLock.current) void saveFile().catch((error) => setStatus(`Autosave failed: ${errorText(error)}`));
    }, prefs.autosaveMs);
    return () => window.clearTimeout(timeout);
  }, [fileContent, selectedFile, workspace, prefs.autosaveMs, splitBusy, tree]);

  async function splitChapter(before: string, after: string) {
    if (!novel || !selectedFile || splitLock.current) return;
    const source = selectedFile;
    splitLock.current = true;
    setSplitBusy(true);
    try {
      await saveFile();
      await saveQueue.current;
      const result = await post<{ path: string; folder: string }>(apiFetch, "/api/manuscript/split", { novel: novel.path, path: source, before, after, expected: fileContent });
      if (activeFileRef.current === source) {
        savedRef.current = { path: result.path, content: after };
        chapterFocus.current = result.path;
        setSelectedFolder(result.folder);
        setSelectedFile(result.path);
        setFileContent(after);
      }
      try {
        setTree((await fetchTree()).tree);
        setStatus("Created a new chapter.");
      } catch (error) {
        setStatus(`Chapter created, but the manuscript could not be refreshed: ${errorText(error)}`);
      }
    } catch (error) {
      setStatus(`Unable to create chapter: ${errorText(error)}`);
    } finally {
      splitLock.current = false;
      setSplitBusy(false);
    }
  }

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
    const goalError = await updateGoalPaths(node.path, null);
    setStatus(goalError ? `Deleted ${node.name}, but could not update its word goals: ${goalError}` : `Deleted: ${node.name}`);
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

  async function updateGoalPaths(oldPath: string, newPath: string | null): Promise<string | null> {
    if (!novel) return null;
    const currentGoals = novel.meta.goals ?? {};
    const nextGoals = remapGoalPaths(
      currentGoals,
      getRelativePath(novel.path, oldPath),
      newPath === null ? null : getRelativePath(novel.path, newPath),
    );
    if (nextGoals === currentGoals) return null;
    try {
      const result = await post<{ meta: NovelEntry["meta"] }>(apiFetch, "/api/novel/meta", { path: novel.path, meta: { goals: nextGoals } });
      setNovel((prev) => (prev && prev.path === novel.path ? { ...prev, meta: result.meta } : prev));
      return null;
    } catch (error) {
      return errorText(error);
    }
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
      const goalError = await updateGoalPaths(node.path, result.path);
      setStatus(goalError ? `Renamed ${node.name}, but could not update its word goals: ${goalError}` : `Renamed to ${name.trim()}`);
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
      const goalError = await updateGoalPaths(node.path, result.path);
      setStatus(goalError ? `Moved ${node.name}, but could not update its word goals: ${goalError}` : `Moved ${node.name}`);
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

  function formatNodeWords(node: TreeNode, words: number) {
    const goal = novel ? goals.chapters?.[getRelativePath(novel.path, node.path)] : undefined;
    return formatWords(words, goal, prefs.wordFormat);
  }

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
            {node.type === "dir" ? "📁" : "📄"} {node.displayName || node.name}
          </button>
          {prefs.showTreeWords && (
            <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatNodeWords(node, wordsOf(node))}</span>
          )}
          <button type="button" title="Delete" disabled={node.generatedContents} className="px-2 opacity-60" onClick={() => void deleteNode(node)}>
            ✕
          </button>
        </div>,
        ...(node.type === "dir" && node.children ? renderTree(node.children, depth + 1) : []),
      ];
    });
  }

  // ---- Undo history for the open scene ----
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastEdit = useRef(0);

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastEdit.current = 0;
  }, [selectedFile]);

  function editContent(next: string) {
    const now = Date.now();
    if (now - lastEdit.current > 700 || undoStack.current.length === 0) {
      undoStack.current.push(fileContent);
      if (undoStack.current.length > 200) undoStack.current.shift();
    }
    lastEdit.current = now;
    redoStack.current = [];
    setFileContent(next);
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (previous === undefined) return;
    redoStack.current.push(fileContent);
    lastEdit.current = 0;
    setFileContent(previous);
  }

  function redo() {
    const next = redoStack.current.pop();
    if (next === undefined) return;
    undoStack.current.push(fileContent);
    lastEdit.current = 0;
    setFileContent(next);
  }

  const sceneWords = useMemo(() => (fileContent.match(/\S+/g) ?? []).length, [fileContent]);

  function windowAction(action: string, value?: boolean) {
    void post(apiFetch, "/api/window", { action, value }).catch(() => undefined);
  }

  async function searchManuscript(query: string, caseSensitive: boolean): Promise<SearchHit[]> {
    if (!novel) return [];
    const result = await apiFetch<{ hits: SearchHit[] }>(`/api/search?novel=${encodeURIComponent(novel.path)}&q=${encodeURIComponent(query)}&case=${caseSensitive ? 1 : 0}`);
    return result.hits;
  }

  async function openHit(hit: SearchHit) {
    await loadFile(hit.path);
    setSelectedFolder(hit.path.slice(0, hit.path.lastIndexOf("/")));
    setTab("manuscript");
    window.setTimeout(() => editorRef.current?.goTo(hit.line, 0), 150);
  }

  // ---- Word counts beside files and folders ----
  const [wordMap, setWordMap] = useState<Record<string, number>>({});
  const [wordsLoaded, setWordsLoaded] = useState(false);

  async function loadWordCounts() {
    if (!novel) return;
    try {
      const result = await apiFetch<{ words: Record<string, number> }>(`/api/stats?novel=${encodeURIComponent(novel.path)}`);
      setWordMap(result.words);
      setWordsLoaded(true);
    } catch {
      // Counts are a convenience; ignore failures.
    }
  }

  useEffect(() => {
    if (!novel) {
      setWordMap({});
      return;
    }
    const timer = window.setTimeout(() => void loadWordCounts(), 1500);
    return () => window.clearTimeout(timer);
  }, [novel?.path, tree, fileContent]);

  useEffect(() => {
    setWordMap({});
    setWordsLoaded(false);
  }, [novel?.path]);

  async function saveMeta(change: Record<string, unknown>) {
    if (!novel) return;
    try {
      const result = await post<{ meta: NovelEntry["meta"]; path: string }>(apiFetch, "/api/novel/meta", { path: novel.path, meta: change });
      setNovel((prev) => (prev && prev.path === novel.path ? { ...prev, meta: result.meta } : prev));
    } catch (error) {
      setStatus(errorText(error));
    }
  }

  const mapWords = (node: TreeNode): number => (node.type === "file" ? wordMap[node.path] ?? 0 : (node.children ?? []).reduce((sum, child) => sum + mapWords(child), 0));
  const today = todayKey();
  const goals: Goals = novel?.meta.goals ?? {};
  const baseline = novel?.meta.progress?.[today];

  // The first count of each day becomes that day's starting point.
  useEffect(() => {
    if (!novel || !wordsLoaded || baseline !== undefined) return;
    const progress = { ...(novel.meta.progress ?? {}), [today]: tree.reduce((sum, node) => sum + mapWords(node), 0) };
    const recent = Object.fromEntries(Object.entries(progress).sort(([a], [b]) => a.localeCompare(b)).slice(-120));
    void saveMeta({ progress: recent });
  }, [novel?.path, wordsLoaded, baseline, today]);

  function wordsOf(node: TreeNode): number {
    if (node.type === "file") return node.path === selectedFile ? sceneWords : wordMap[node.path] ?? 0;
    return (node.children ?? []).reduce((sum, child) => sum + wordsOf(child), 0);
  }

  const totalWords = tree.reduce((sum, node) => sum + wordsOf(node), 0);
  const wordsAtStartOfToday = baseline ?? totalWords;
  const todayWords = Math.max(0, totalWords - wordsAtStartOfToday);
  const dailyPlan = dailyTarget(goals, wordsAtStartOfToday, today);

  function goalEntries(nodes: TreeNode[], depth = 0): Array<{ path: string; name: string; words: number; depth: number; type: "file" | "dir" }> {
    return nodes.flatMap((node) => [
      { path: novel ? getRelativePath(novel.path, node.path) : node.path, name: node.name, words: wordsOf(node), depth, type: node.type },
      ...goalEntries(node.children ?? [], depth + 1),
    ]);
  }

  async function runExport(options: ExportOptions, mode: "save" | "email"): Promise<string> {
    if (!novel) throw new Error("Open a novel first.");
    if (splitLock.current) throw new Error("Wait for the chapter split to finish before exporting.");
    if (!generatedContents) await saveFile();
    const result = await post<{ path: string; name: string; pages: number; words: number; dateLabel: string }>(apiFetch, "/api/export/pdf", {
      novel: novel.path,
      spacing: options.spacing,
      fontSize: options.fontSize,
      newPageChapters: options.newPage,
      dateFormat: prefs.dateFormat,
    });
    setPrefs({ pdfSpacing: options.spacing, pdfFontSize: options.fontSize, pdfNewPage: options.newPage, ...(mode === "email" ? { email: options.email } : {}) });
    void post(apiFetch, "/api/reveal", { path: result.path }).catch(() => undefined);
    if (mode === "email") {
      const subject = `${novel.meta.title} - draft ${result.dateLabel}`;
      const body = `Draft of "${novel.meta.title}" (${result.pages} pages, ${result.words.toLocaleString()} words).\n\nThe PDF is saved at:\n${result.path}\n\nAttach it to this message before sending.`;
      await post(apiFetch, "/api/open", { novel: novel.path, url: `mailto:${options.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` });
    }
    setStatus(`PDF draft saved: ${result.path}`);
    return mode === "email"
      ? `Saved ${result.name} (${result.pages} pages). Your mail app has opened a message to ${options.email}; drag the PDF from the folder that just opened into it.`
      : `Saved ${result.name} (${result.pages} pages) in the novel's Drafts folder.`;
  }

  // Shift+H/L change tabs; Shift+J/K step through chapters, acts and scenes in order.
  function vimNavigate(action: "tabPrev" | "tabNext" | "nodePrev" | "nodeNext") {
    if (!novel) return;
    if (action === "tabPrev" || action === "tabNext") {
      const order: Tab[] = ["manuscript", "planning", "elements", "research"];
      setTab(order[(order.indexOf(tab) + (action === "tabNext" ? 1 : order.length - 1)) % order.length]);
      return;
    }
    const flat: TreeNode[] = [];
    const walk = (nodes: TreeNode[]) => nodes.forEach((node) => { flat.push(node); if (node.children) walk(node.children); });
    walk(tree);
    if (!flat.length) return;
    const index = flat.findIndex((node) => (node.type === "dir" ? folderNotePath(node.path) === selectedFile : node.path === selectedFile));
    const next = flat[Math.max(0, Math.min(flat.length - 1, index === -1 ? 0 : index + (action === "nodeNext" ? 1 : -1)))];
    setTab("manuscript");
    if (next.type === "dir") {
      void openFolderNote(next.path);
    } else {
      setSelectedFolder(next.path.slice(0, next.path.lastIndexOf("/")));
      void loadFile(next.path);
    }
  }

  const shortcutsRef = useRef(prefs.shortcuts);
  shortcutsRef.current = prefs.shortcuts;

  function setShortcut(id: string, shortcut: string | null) {
    const next = { ...shortcutsRef.current };
    if (shortcut === null) delete next[id];
    else next[id] = shortcut;
    shortcutsRef.current = next;
    setPrefs({ shortcuts: next });
  }

  type Command = { id: string; defaultShortcut?: string; label: string; group: string; shortcut?: string; alias?: string[]; native?: boolean; enabled?: boolean; checked?: boolean; run: () => void };
  const inNovel = !!novel;
  const selectedNode = selectedFile ? findNode(tree, selectedFile) : null;
  const generatedContents = !!selectedNode?.generatedContents;
  const selectedParent = selectedFile ? findNode(tree, selectedFile.slice(0, selectedFile.lastIndexOf("/"))) : null;
  const canSplitChapter = !!selectedParent && !selectedParent.isAct && !selectedParent.chapter?.contents && !isFolderNotePath(selectedFile);
  const inEditor = inNovel && tab === "manuscript" && !!selectedFile && !generatedContents && !splitBusy;
  useEffect(() => {
    if (chapterFocus.current !== selectedFile || !selectedFile) return;
    chapterFocus.current = null;
    editorRef.current?.goTo(0, 0);
  }, [selectedFile]);
  useEffect(() => {
    if (!selectedFile || !workspace || !generatedContents) return;
    const path = selectedFile;
    void apiFetch<{ content: string }>(`/api/file?path=${encodeURIComponent(getRelativePath(workspace, path))}`).then((result) => {
      if (activeFileRef.current !== path) return;
      savedRef.current = { path, content: result.content };
      setFileContent(result.content);
    }).catch((error) => setStatus(`Unable to refresh table of contents: ${errorText(error)}`));
  }, [tree, selectedFile, workspace, generatedContents]);
  const ed = () => editorRef.current;
  const zoomBy = (delta: number) => setPrefs({ zoom: Math.max(60, Math.min(220, prefs.zoom + delta)) });

  const baseCommands: Command[] = [
    { id: "newScene", label: "New scene", group: "File", shortcut: "Ctrl+Shift+N", enabled: inNovel, run: () => void createFile() },
    { id: "newChapter", label: "New chapter", group: "File", shortcut: "Ctrl+Alt+N", enabled: inNovel, run: () => void createFolder("Chapter") },
    { id: "newAct", label: "New act", group: "File", shortcut: "Ctrl+Alt+Shift+N", enabled: inNovel, run: () => void createFolder("Act") },
    { id: "library", label: "Open library", group: "File", enabled: inNovel, run: closeNovel },
    { id: "novelSettings", label: "Novel settings…", group: "File", enabled: inNovel, run: () => setNovelSettingsOpen(true) },
    { id: "save", label: "Save", group: "File", shortcut: "Ctrl+S", enabled: inEditor, run: () => void saveFile().then(() => setStatus("Saved.")) },
    { id: "goals", label: "Word goals…", group: "File", shortcut: "Ctrl+Alt+G", enabled: inNovel, run: () => setDialog("goals") },
    { id: "exportPdf", label: "Export PDF draft…", group: "File", enabled: inNovel, run: () => setDialog("export") },
    { id: "emailDraft", label: "Email PDF draft to myself…", group: "File", enabled: inNovel, run: () => setDialog("email") },
    { id: "importManuscript", label: "Import manuscript…", group: "File", enabled: inNovel, run: () => setDialog("import") },
    { id: "settings", label: "Settings…", group: "File", shortcut: "Ctrl+,", run: () => setStyleEditorOpen((prev) => !prev) },
    { id: "changeWorkspace", label: "Change workspace location…", group: "File", run: () => void chooseWorkspace() },
    { id: "revealWorkspace", label: "Show workspace in file manager", group: "File", enabled: !!workspace, run: () => void post(apiFetch, "/api/reveal", { path: workspace }) },
    { id: "quit", label: "Quit", group: "File", shortcut: "Ctrl+Q", run: () => windowAction("quit") },

    { id: "undo", label: "Undo", group: "Edit", shortcut: "Ctrl+Z", enabled: inEditor, run: undo },
    { id: "redo", label: "Redo", group: "Edit", shortcut: "Ctrl+Shift+Z", alias: ["Ctrl+Y"], enabled: inEditor, run: redo },
    { id: "cut", label: "Cut", group: "Edit", shortcut: "Ctrl+X", native: true, enabled: inEditor, run: () => ed()?.cut() },
    { id: "copy", label: "Copy", group: "Edit", shortcut: "Ctrl+C", native: true, enabled: inEditor, run: () => ed()?.copy() },
    { id: "paste", label: "Paste", group: "Edit", shortcut: "Ctrl+V", native: true, enabled: inEditor, run: () => ed()?.paste() },
    { id: "selectLine", label: "Select line", group: "Edit", shortcut: "Ctrl+L", enabled: inEditor, run: () => ed()?.selectLine() },
    { id: "find", label: "Find…", group: "Edit", shortcut: "Ctrl+F", enabled: inEditor, run: () => setFind("find") },
    { id: "replace", label: "Find and replace…", group: "Edit", shortcut: "Ctrl+H", enabled: inEditor, run: () => setFind("replace") },
    { id: "deleteLine", label: "Delete line", group: "Edit", shortcut: "Ctrl+Shift+K", enabled: inEditor, run: () => ed()?.deleteLine() },
    { id: "duplicateLine", label: "Duplicate line", group: "Edit", shortcut: "Ctrl+Shift+D", enabled: inEditor, run: () => ed()?.duplicateLine() },
    { id: "lineUp", label: "Move line up", group: "Edit", shortcut: "Alt+ArrowUp", enabled: inEditor, run: () => ed()?.moveLine(-1) },
    { id: "lineDown", label: "Move line down", group: "Edit", shortcut: "Alt+ArrowDown", enabled: inEditor, run: () => ed()?.moveLine(1) },
    { id: "sceneBreak", label: "Insert scene break", group: "Edit", shortcut: "Ctrl+Alt+B", enabled: inEditor, run: () => ed()?.insertLineAfter("***") },
    { id: "elementLink", label: "Insert element link", group: "Edit", shortcut: "Ctrl+K", enabled: inEditor, run: () => ed()?.insertText("[[]]", 2) },

    { id: "bold", label: "Bold", group: "Format", shortcut: "Ctrl+B", enabled: inEditor, run: () => ed()?.wrapSelection("**") },
    { id: "italic", label: "Italic", group: "Format", shortcut: "Ctrl+I", enabled: inEditor, run: () => ed()?.wrapSelection("*") },
    { id: "strike", label: "Strikethrough", group: "Format", shortcut: "Ctrl+Shift+X", enabled: inEditor, run: () => ed()?.wrapSelection("~~") },
    { id: "h1", label: "Heading 1", group: "Format", shortcut: "Ctrl+1", enabled: inEditor, run: () => ed()?.setHeading(1) },
    { id: "h2", label: "Heading 2", group: "Format", shortcut: "Ctrl+2", enabled: inEditor, run: () => ed()?.setHeading(2) },
    { id: "h3", label: "Heading 3", group: "Format", shortcut: "Ctrl+3", enabled: inEditor, run: () => ed()?.setHeading(3) },
    { id: "quote", label: "Block quote", group: "Format", shortcut: "Ctrl+Shift+Q", enabled: inEditor, run: () => ed()?.prefixLine("> ") },
    { id: "list", label: "Bulleted list", group: "Format", shortcut: "Ctrl+Shift+L", enabled: inEditor, run: () => ed()?.prefixLine("- ") },
    { id: "poetry", label: "Poetry style (paragraph)", group: "Format", shortcut: "Ctrl+Alt+P", enabled: inEditor, run: () => ed()?.togglePoetry() },
    { id: "newPoetry", label: "New poetry paragraph", group: "Format", shortcut: "Ctrl+Shift+Enter", enabled: inEditor, run: () => ed()?.insertPoetryParagraph() },
    { id: "clearFormat", label: "Clear formatting", group: "Format", enabled: inEditor, run: () => ed()?.clearFormatting() },
    { id: "autoIndent", label: "Auto-indent and smart quotes", group: "Format", shortcut: "Ctrl+Alt+I", checked: prefs.autoIndent, run: () => setPrefs({ autoIndent: !prefs.autoIndent }) },
    { id: "typography", label: "Fonts and drop caps…", group: "Format", run: () => setDialog("format") },
    { id: "dropCap", label: "Drop caps", group: "Format", checked: prefs.dropCap, run: () => setPrefs({ dropCap: !prefs.dropCap }) },

    { id: "zoomIn", label: "Zoom in", group: "View", shortcut: "Ctrl+=", alias: ["Ctrl++"], run: () => zoomBy(10) },
    { id: "zoomOut", label: "Zoom out", group: "View", shortcut: "Ctrl+-", run: () => zoomBy(-10) },
    { id: "zoomReset", label: "Reset zoom", group: "View", shortcut: "Ctrl+0", run: () => setPrefs({ zoom: 100 }) },
    { id: "sidebar", label: "Show sidebar", group: "View", shortcut: "Ctrl+\\", checked: prefs.showSidebar, run: () => setPrefs({ showSidebar: !prefs.showSidebar }) },
    { id: "statusBar", label: "Show status bar", group: "View", checked: prefs.showStatus, run: () => setPrefs({ showStatus: !prefs.showStatus }) },
    { id: "wordCount", label: "Show word count", group: "View", checked: prefs.showWordCount, run: () => setPrefs({ showWordCount: !prefs.showWordCount }) },
    { id: "focus", label: "Focus mode", group: "View", shortcut: "F9", enabled: inNovel, checked: focusMode, run: toggleFocus },
    { id: "typewriter", label: "Typewriter scrolling", group: "View", checked: prefs.typewriter, run: () => setPrefs({ typewriter: !prefs.typewriter }) },
    { id: "vim", label: "Vim keys", group: "View", shortcut: "Ctrl+Alt+V", checked: prefs.vim, run: () => setPrefs({ vim: !prefs.vim }) },
    { id: "spellcheck", label: "Check spelling", group: "View", checked: prefs.spellcheck, run: () => setPrefs({ spellcheck: !prefs.spellcheck }) },
    { id: "tabManuscript", label: "Manuscript", group: "View", shortcut: "Alt+1", enabled: inNovel, run: () => setTab("manuscript") },
    { id: "tabPlanning", label: "Planning", group: "View", shortcut: "Alt+2", enabled: inNovel, run: () => setTab("planning") },
    { id: "tabElements", label: "Elements", group: "View", shortcut: "Alt+3", enabled: inNovel, run: () => setTab("elements") },
    { id: "tabResearch", label: "Research", group: "View", shortcut: "Alt+4", enabled: inNovel, run: () => setTab("research") },
    { id: "fullscreen", label: "Full screen", group: "View", shortcut: "F11", checked: fullscreen, run: () => { windowAction("fullscreen", !fullscreen); setFullscreen(!fullscreen); } },
    { id: "shortcuts", label: "Keyboard shortcuts", group: "View", shortcut: "Ctrl+/", run: () => setDialog("shortcuts") },

    { id: "minimize", label: "Minimize", group: "Window", run: () => windowAction("minimize") },
    { id: "maximize", label: "Maximize", group: "Window", run: () => windowAction("maximize") },
    { id: "restore", label: "Restore", group: "Window", run: () => windowAction("unmaximize") },
    { id: "onTop", label: "Always on top", group: "Window", checked: alwaysOnTop, run: () => { windowAction("alwaysOnTop", !alwaysOnTop); setAlwaysOnTop(!alwaysOnTop); } },
    { id: "reload", label: "Reload", group: "Window", shortcut: "F5", run: () => window.location.reload() },
    { id: "devtools", label: "Developer tools", group: "Window", shortcut: "F12", run: () => windowAction("devtools") },
    { id: "closeWindow", label: "Close window", group: "Window", run: () => windowAction("close") },

    { id: "welcome", label: "Getting started", group: "Help", run: () => setDialog("welcome") },
    { id: "markdownGuide", label: "Markdown and formatting guide", group: "Help", run: () => setDialog("markdown") },
    { id: "about", label: "About GhoaxtWriter", group: "Help", run: () => setDialog("about") },
  ];

  const commands: Command[] = baseCommands.map((command) => {
    const override = prefs.shortcuts[command.id];
    if (override === undefined) return { ...command, defaultShortcut: command.shortcut };
    return { ...command, defaultShortcut: command.shortcut, shortcut: override || undefined, alias: [], native: false };
  });

  const commandsRef = useRef(commands);
  const vimNavRef = useRef(vimNavigate);
  vimNavRef.current = vimNavigate;
  const vimOnRef = useRef(prefs.vim);
  vimOnRef.current = prefs.vim;
  commandsRef.current = commands;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const pressed = keyCombo(event);
      const editable = (event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true]");
      const vimKeys: Record<string, "tabPrev" | "tabNext" | "nodePrev" | "nodeNext"> = { "Shift+H": "tabPrev", "Shift+L": "tabNext", "Shift+J": "nodeNext", "Shift+K": "nodePrev" };
      if (vimOnRef.current && !editable && vimKeys[pressed]) {
        event.preventDefault();
        vimNavRef.current(vimKeys[pressed]);
        return;
      }
      const command = commandsRef.current.find((c) => !c.native && (c.shortcut === pressed || c.alias?.includes(pressed)));
      if (!command || command.enabled === false) return;
      event.preventDefault();
      command.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mi = (id: string): MenuItem => {
    const command = commands.find((c) => c.id === id)!;
    return { label: command.label, shortcut: command.shortcut, run: command.run, disabled: command.enabled === false, checked: command.checked };
  };
  const sep: MenuItem = { separator: true };
  const choice = (label: string, active: boolean, run: () => void): MenuItem => ({ label, checked: active, run });

  const menus: MenuDef[] = [
    {
      label: "File",
      items: [
        mi("newScene"), mi("newChapter"), mi("newAct"), sep,
        mi("library"), mi("novelSettings"), sep,
        mi("save"), mi("goals"), sep,
        mi("exportPdf"), mi("emailDraft"), mi("importManuscript"), sep,
        {
          label: "Open novels to",
          submenu: (["manuscript", "planning", "elements", "research"] as const).map((key) => choice(key[0].toUpperCase() + key.slice(1), prefs.defaultTab === key, () => setPrefs({ defaultTab: key }))),
        },
        mi("settings"), sep,
        mi("changeWorkspace"), mi("revealWorkspace"), sep,
        mi("quit"),
      ],
    },
    {
      label: "Edit",
      items: [
        mi("undo"), mi("redo"), sep,
        mi("cut"), mi("copy"), mi("paste"), mi("selectLine"), sep,
        mi("find"), mi("replace"), sep,
        mi("deleteLine"), mi("duplicateLine"), mi("lineUp"), mi("lineDown"), sep,
        mi("sceneBreak"), mi("elementLink"),
      ],
    },
    {
      label: "Format",
      items: [
        mi("bold"), mi("italic"), mi("strike"), sep,
        mi("h1"), mi("h2"), mi("h3"), mi("quote"), mi("list"), sep,
        mi("poetry"), mi("newPoetry"), mi("clearFormat"), sep,
        mi("autoIndent"), mi("dropCap"), mi("typography"),
      ],
    },
    {
      label: "View",
      items: [
        mi("zoomIn"), mi("zoomOut"), mi("zoomReset"), sep,
        mi("sidebar"), mi("statusBar"), mi("wordCount"), sep,
        mi("focus"), mi("typewriter"), mi("vim"), mi("spellcheck"),
        {
          label: "Column width",
          submenu: (["narrow", "medium", "wide", "full"] as const).map((key) => choice(key[0].toUpperCase() + key.slice(1), prefs.columnWidth === key, () => setPrefs({ columnWidth: key }))),
        },
        sep,
        mi("tabManuscript"), mi("tabPlanning"), mi("tabElements"), mi("tabResearch"), sep,
        mi("fullscreen"), mi("shortcuts"),
      ],
    },
    { label: "Window", items: [mi("minimize"), mi("maximize"), mi("restore"), mi("fullscreen"), mi("onTop"), sep, mi("library"), sep, mi("reload"), mi("devtools"), sep, mi("closeWindow")] },
    { label: "Help", items: [mi("welcome"), mi("markdownGuide"), mi("shortcuts"), sep, mi("about")] },
  ];

  return (
    <>
      <style>{appCss}</style>
      <style>{markdownCss}</style>

      <div className={`h-screen flex flex-col ${tw.app}`} style={{ cursor: dim ? "none" : undefined }}>
        <div className={`flex items-center gap-4 px-2 py-1 border-b ${tw.header}`} style={fade}>
          <div style={{ flex: 1 }}>
            <Menubar menus={menus} />
          </div>
          <div className="flex items-center gap-3 justify-center">
            <strong style={{ fontSize: 16 }}>{novel ? novel.meta.title : "GhoaxtWriter"}</strong>
            {novel && (
              <button type="button" onClick={toggleFocus} className={`px-3 py-1 rounded-lg border ${focusMode ? "border-amber-500 font-bold" : "border-slate-700"}`}>
                Focus mode{focusMode ? " · on" : ""}
              </button>
            )}
          </div>
          <div className="flex gap-2 justify-end" style={{ flex: 1 }}>
            {!workspace && <button type="button" onClick={chooseWorkspace} className={`px-3 py-1 ${tw.button}`}>Choose workspace</button>}
            {novel && <button type="button" onClick={closeNovel} className="px-3 py-1 rounded-lg border border-slate-700">Library</button>}
          </div>
        </div>

        {!novel ? (
          workspace ? (
            <Library key={workspace} apiFetch={apiFetch} onOpen={(entry) => void openNovel(entry)} onStatus={setStatus} buttonClass={tw.button} className={`p-6 ${tw.editor}`} />
          ) : (
            <div className={`flex-1 p-6 flex flex-col items-center justify-center gap-4 ${tw.editor}`}>
              <div style={{ color: "var(--muted)" }}>Choose a folder to keep your library in. Everything is saved there as plain files.</div>
              <button type="button" onClick={chooseWorkspace} className={`px-5 py-3 ${tw.button}`}>Choose workspace</button>
            </div>
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
            showWords={prefs.showTreeWords}
            formatNodeWords={formatNodeWords}
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
          {prefs.showSidebar && (
            <aside className={`w-64 shrink-0 overflow-auto p-2 border-r ${tw.sidebar}`} style={fade}>
              <button type="button" className="w-full text-left px-2 py-1 rounded-md border border-slate-700" onClick={() => setMatterPosition("front")}>+ Add front matter</button>
              {workspace ? renderTree(tree) : <div style={{ color: "var(--muted)" }}>No workspace selected.</div>}
              <button type="button" className="w-full text-left px-2 py-1 rounded-md border border-slate-700" onClick={() => setMatterPosition("back")}>+ Add back matter</button>
            </aside>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {isFolderNotePath(selectedFile) && (
              <div className="px-4 py-2 text-xs border-b border-slate-700" style={{ color: "var(--muted)", ...fade }}>
                Folder note: {selectedFile!.split("/").slice(-2, -1)[0]}
              </div>
            )}
            {generatedContents && <div className="px-4 py-2 text-xs border-b border-slate-700" style={{ color: "var(--muted)" }}>Generated table of contents (read-only in the editor). Edit its template in Novel settings.</div>}
            <LiveEditor
              ref={editorRef}
              key={selectedFile ?? "none"}
              value={fileContent}
              onChange={editContent}
              className={tw.editor}
              disabled={!selectedFile}
              readOnly={generatedContents || splitBusy}
              onChapterSplit={canSplitChapter ? (before, after) => void splitChapter(before, after) : undefined}
              dropCap={prefs.dropCap && !isFolderNotePath(selectedFile)}
              elementNames={elementNames}
              onOpenElement={openElement}
              onHoverElement={(name, rect) => setHoverElement(name && rect ? { name, x: rect.left, y: rect.bottom } : null)}
              focusDim={dim}
              autoIndent={prefs.autoIndent}
              vim={prefs.vim}
              onVimMode={setVimMode}
              onUndo={undo}
              onRedo={redo}
              onVimNav={vimNavigate}
              onFind={() => setFind("find")}
              onError={setStatus}
              typewriter={prefs.typewriter}
              spellcheck={prefs.spellcheck}
              columnWidth={prefs.columnWidth}
              zoom={prefs.zoom}
            />
          </div>
        </div>
        )}
        </>
        )}

        {styleEditorOpen && (
          <SettingsPanel
            prefs={prefs}
            setPrefs={setPrefs}
            tw={tw}
            setTw={setTw}
            styleElements={styleElements}
            appCss={appCss}
            setAppCss={setAppCss}
            markdownCss={markdownCss}
            setMarkdownCss={setMarkdownCss}
            workspace={workspace}
            onChangeWorkspace={() => void chooseWorkspace()}
            onReveal={() => void post(apiFetch, "/api/reveal", { path: workspace })}
            onOpenShortcuts={() => setDialog("shortcuts")}
            onSave={() => void saveStyles()}
            onReset={() => void resetStyles()}
            onClose={() => setStyleEditorOpen(false)}
            panelClass={tw.panel}
            buttonClass={tw.button}
            style={fade}
          />
        )}

        {prefs.showStatus && (
          <div className={`px-4 py-2 text-xs border-t flex justify-between gap-4 ${tw.status}`} style={fade}>
            <span>{status}</span>
            <span className="flex gap-4">
              {vimMode && <strong>-- {vimMode.toUpperCase()} --</strong>}
              {novel && prefs.showWordCount && dailyPlan.words !== null && <span>Today {formatWords(todayWords, dailyPlan.words, prefs.wordFormat)}</span>}
              {novel && prefs.showWordCount && goals.overall && <span>Total {formatWords(totalWords, goals.overall.target, prefs.wordFormat)}</span>}
              {inEditor && prefs.showWordCount && <span>{sceneWords.toLocaleString()} words</span>}
            </span>
          </div>
        )}

        {find && inEditor && (
          <FindPanel
            key={find}
            initialMode={find}
            content={fileContent}
            onGoto={(line, pos) => editorRef.current?.goTo(line, pos)}
            onReplace={editContent}
            onClose={() => setFind(null)}
            searchNovel={searchManuscript}
            onOpenHit={(hit) => void openHit(hit)}
          />
        )}
        {dialog === "shortcuts" && <ShortcutsDialog commands={commands} onSet={setShortcut} onResetAll={() => { shortcutsRef.current = {}; setPrefs({ shortcuts: {} }); }} onClose={() => setDialog(null)} />}
        {dialog === "markdown" && <InfoDialog title="Markdown and formatting guide" onClose={() => setDialog(null)}><MarkdownGuide /></InfoDialog>}
        {dialog === "goals" && novel && (
          <GoalsDialog
            goals={goals}
            totalWords={totalWords}
            todayWords={todayWords}
            wordsAtStartOfToday={wordsAtStartOfToday}
            history={novel.meta.progress ?? {}}
            dateFormat={prefs.dateFormat}
            entries={goalEntries(tree)}
            onSave={(next) => { void saveMeta({ goals: next }); setDialog(null); }}
            onClose={() => setDialog(null)}
          />
        )}
        {(dialog === "export" || dialog === "email") && novel && (
          <ExportDialog
            mode={dialog === "email" ? "email" : "save"}
            defaults={{ spacing: prefs.pdfSpacing, fontSize: prefs.pdfFontSize, newPage: prefs.pdfNewPage, email: prefs.email }}
            onRun={(options) => runExport(options, dialog === "email" ? "email" : "save")}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === "import" && novel && (
          <ImportDialog
            novelPath={novel.path}
            apiFetch={apiFetch}
            onImported={(result) => {
              void fetchTree().then((next) => setTree(next.tree));
              setStatus(`Imported ${result.chapters} chapters and ${result.scenes} scenes (${result.words.toLocaleString()} words).`);
            }}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === "format" && (
          <FormatDialog markdownCss={markdownCss} setMarkdownCss={setMarkdownCss} prefs={prefs} setPrefs={setPrefs} onSave={() => void saveStyles()} onClose={() => setDialog(null)} />
        )}
        {dialog === "about" && (
          <InfoDialog title="About GhoaxtWriter" onClose={() => setDialog(null)}>
            <p>A local, novel-first writing app. Everything you write is saved as ordinary files in your workspace folder, so other programs can read it too.</p>
            <p style={{ color: "var(--muted)" }}>Version 0.0.1</p>
          </InfoDialog>
        )}
        {dialog === "welcome" && (
          <InfoDialog title="Getting started" onClose={() => setDialog(null)}>
            <p><strong>Library:</strong> pick an author, then create shelves (series) and novels.</p>
            <p><strong>Manuscript:</strong> acts and chapters are folders, scenes are files. The line you're on shows markdown; all other lines show formatted.</p>
            <p><strong>Planning, Elements, Research:</strong> arrange scenes as cards, keep characters and places you can link with [[Name]], and collect research.</p>
            <p><strong>Focus mode (F9):</strong> fades everything but the current line until you move the mouse.</p>
          </InfoDialog>
        )}

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
            { label: "Rename…", disabled: !!treeMenu.node.generatedContents, run: () => void renameNode(treeMenu.node) },
            ...(treeMenu.node.type === "dir" && !treeMenu.node.isAct ? [{ label: "Chapter settings…", disabled: false, run: () => setChapterSettings(treeMenu.node) }] : []),
            { label: "Move up", disabled: !!treeMenu.node.generatedContents || index <= 0, run: () => shiftNode(treeMenu.node, treeMenu.siblings, -1) },
            { label: "Move down", disabled: !!treeMenu.node.generatedContents || index >= treeMenu.siblings.length - 1, run: () => shiftNode(treeMenu.node, treeMenu.siblings, 1) },
            { label: "Delete", disabled: !!treeMenu.node.generatedContents, run: () => void deleteNode(treeMenu.node) },
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

        {novel && chapterSettings && (
          <ChapterDialog name={chapterSettings.name} info={chapterSettings.chapter ?? {}} roles={manuscriptSettings(novel.meta.manuscript).roles} onClose={() => setChapterSettings(null)} onSave={async (info) => {
            await post(apiFetch, "/api/manuscript/chapter", { novel: novel.path, path: chapterSettings.path, numbered: !!info.numbered, title: info.title ?? "", role: info.role ?? "" });
            setTree((await fetchTree()).tree);
            setChapterSettings(null);
            setStatus("Chapter settings saved.");
          }} />
        )}
        {novel && matterPosition && (
          <MatterDialog position={matterPosition} templates={manuscriptSettings(novel.meta.manuscript).templates} onClose={() => setMatterPosition(null)} onAdd={async (index) => {
            if (!generatedContents) await saveFile();
            const result = await post<{ path: string }>(apiFetch, "/api/manuscript/matter", { novel: novel.path, position: matterPosition, index });
            setMatterPosition(null);
            try {
              setTree((await fetchTree()).tree);
              await loadFile(result.path);
              setSelectedFolder(result.path.slice(0, result.path.lastIndexOf("/")));
              setStatus("Matter added.");
            } catch (error) {
              setStatus(`Matter added, but could not be opened: ${errorText(error)}`);
            }
          }} />
        )}

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
              void fetchTree(updated).then((result) => setTree(result.tree)).catch((error) => setStatus(`Settings saved, but the manuscript could not be refreshed: ${errorText(error)}`));
              setStatus("Novel settings saved.");
            }}
          />
        )}
      </div>
    </>
  );
}

export default App;
