import { useEffect, useRef, useState } from "react";
import { type ApiFetch } from "./api";

export type PlanNode = { name: string; path: string; type: "file" | "dir"; children?: PlanNode[] };

type Props = {
  tree: PlanNode[];
  novelPath: string;
  novelRel: string;
  apiFetch: ApiFetch;
  onMove: (node: PlanNode, toDir: string, before?: string) => Promise<void>;
  onOpenFile: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onCreateScene: (dir: string) => void;
  onCreateFolder: (parent: string, kind: "Act" | "Chapter") => void;
};

type Info = { excerpt: string; words: number };

function findNode(nodes: PlanNode[], path: string): PlanNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const inner = node.children ? findNode(node.children, path) : null;
    if (inner) return inner;
  }
  return null;
}

function totalWords(node: PlanNode, info: Record<string, Info>): number {
  if (node.type === "file") return info[node.path]?.words ?? 0;
  return (node.children ?? []).reduce((sum, child) => sum + totalWords(child, info), 0);
}

function Planning({ tree, novelPath, novelRel, apiFetch, onMove, onOpenFile, onOpenFolder, onCreateScene, onCreateFolder }: Props) {
  const [info, setInfo] = useState<Record<string, Info>>({});
  const [over, setOver] = useState<string | null>(null);
  const dragging = useRef<string | null>(null);

  useEffect(() => {
    apiFetch<{ excerpts: Record<string, Info> }>(`/api/excerpts?root=${encodeURIComponent(novelRel)}`)
      .then((result) => setInfo(result.excerpts))
      .catch(() => undefined);
  }, [tree]);

  function drop(toDir: string, before?: string) {
    const dragged = dragging.current ? findNode(tree, dragging.current) : null;
    dragging.current = null;
    setOver(null);
    if (!dragged || dragged.name === before) return;
    void onMove(dragged, toDir, before);
  }

  function dragProps(node: PlanNode) {
    return {
      draggable: true,
      onDragStart: (event: React.DragEvent) => {
        event.stopPropagation();
        event.dataTransfer.setData("text/plain", node.path);
        event.dataTransfer.effectAllowed = "move";
        dragging.current = node.path;
      },
      onDragEnd: () => {
        dragging.current = null;
        setOver(null);
      },
    };
  }

  function slot(dir: string, before: string | undefined, horizontal: boolean, empty = false) {
    const key = `slot:${dir}:${before ?? "end"}`;
    const active = over === key;
    return (
      <div
        key={key}
        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setOver(key); }}
        onDragLeave={() => setOver((prev) => (prev === key ? null : prev))}
        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); drop(dir, before); }}
        style={{
          flexShrink: 0,
          width: horizontal ? (active ? 40 : 14) : "100%",
          height: horizontal ? "auto" : empty ? 48 : active ? 40 : 10,
          minHeight: horizontal ? 60 : undefined,
          alignSelf: horizontal ? "stretch" : undefined,
          borderRadius: 8,
          border: active || empty ? "2px dashed #f59e0b" : "2px dashed transparent",
          color: "var(--muted)",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.12s",
        }}
      >
        {empty && !active ? "Drop scenes here" : null}
      </div>
    );
  }

  function card(node: PlanNode, root: boolean): JSX.Element {
    if (node.type === "file") {
      const details = info[node.path];
      return (
        <div
          key={node.path}
          {...dragProps(node)}
          onClick={() => onOpenFile(node.path)}
          className="rounded-lg border border-slate-700 bg-slate-900 text-slate-100 p-3 cursor-pointer"
          style={{ width: root ? 240 : "100%" }}
        >
          <div className="flex justify-between gap-2">
            <strong style={{ fontSize: 14 }}>{node.name.replace(/\.md$/i, "")}</strong>
            <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{details?.words ?? 0} words</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {details?.excerpt || "Empty scene"}
          </div>
        </div>
      );
    }

    const children = node.children ?? [];
    const intoKey = `into:${node.path}`;
    return (
      <div
        key={node.path}
        {...dragProps(node)}
        className="rounded-xl border border-slate-600 bg-slate-800 text-slate-100 p-3"
        style={{ width: root ? 320 : "100%", outline: over === intoKey ? "2px solid #f59e0b" : undefined }}
      >
        <div
          className="flex justify-between items-start gap-2 mb-2 cursor-pointer"
          onClick={() => onOpenFolder(node.path)}
          onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setOver(intoKey); }}
          onDragLeave={() => setOver((prev) => (prev === intoKey ? null : prev))}
          onDrop={(event) => { event.preventDefault(); event.stopPropagation(); drop(node.path); }}
        >
          <div>
            <strong>📁 {node.name}</strong>
            {info[node.path]?.excerpt && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{info[node.path].excerpt}</div>}
          </div>
          <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{totalWords(node, info)} words</span>
        </div>
        <div className="flex flex-col">
          {children.flatMap((child) => [slot(node.path, child.name, false), card(child, false)])}
          {slot(node.path, undefined, false, children.length === 0)}
        </div>
        <div className="flex gap-2 mt-2">
          <button type="button" className="px-2 py-1 rounded-md border border-slate-600 text-xs" onClick={() => onCreateFolder(node.path, "Chapter")}>+ Chapter</button>
          <button type="button" className="px-2 py-1 rounded-md border border-slate-600 text-xs" onClick={() => onCreateScene(node.path)}>+ Scene</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); drop(novelPath); }}>
      <div className="flex gap-2 items-center mb-3">
        <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => onCreateFolder(novelPath, "Act")}>+ Act</button>
        <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => onCreateScene(novelPath)}>+ Scene</button>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          Drag cards to reorder. Drop a card on a folder's title, or between its cards, to attach it; drag it out to the board to detach it.
        </div>
      </div>
      <div className="flex flex-wrap items-start">
        {tree.flatMap((node) => [slot(novelPath, node.name, true), card(node, true)])}
        {slot(novelPath, undefined, true, tree.length === 0)}
      </div>
    </div>
  );
}

export default Planning;
