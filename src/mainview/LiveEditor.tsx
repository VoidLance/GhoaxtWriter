import { marked } from "marked";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ColumnWidth } from "./prefs";

export type VimMode = "normal" | "insert";

export type EditorHandle = {
  wrapSelection: (before: string, after?: string) => void;
  setHeading: (level: number) => void;
  prefixLine: (prefix: string) => void;
  insertText: (text: string, caretBack?: number) => void;
  insertLineAfter: (text: string) => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  selectLine: () => void;
  deleteLine: () => void;
  duplicateLine: () => void;
  moveLine: (delta: -1 | 1) => void;
  togglePoetry: () => void;
  clearFormatting: () => void;
  goTo: (line: number, pos?: number) => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  className: string;
  disabled: boolean;
  dropCap?: boolean;
  elementNames?: string[];
  onOpenElement?: (name: string) => void;
  onHoverElement?: (name: string | null, rect?: DOMRect) => void;
  focusDim?: boolean;
  autoIndent?: boolean;
  vim?: boolean;
  onVimMode?: (mode: VimMode | null) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onVimNav?: (action: "tabPrev" | "tabNext" | "nodePrev" | "nodeNext") => void;
  onFind?: () => void;
  typewriter?: boolean;
  spellcheck?: boolean;
  columnWidth?: ColumnWidth;
  zoom?: number;
};

const WIDTHS: Record<ColumnWidth, number> = { narrow: 620, medium: 780, wide: 980, full: 100000 };
const isMarker = (line: string) => line.trim() === "::: poetry" || line.trim() === ":::";

// One editing surface: the active line is raw markdown, every other line is rendered.
export const LiveEditor = forwardRef<EditorHandle, Props>(function LiveEditor(props, ref) {
  const { value, onChange, className, disabled, dropCap = true, elementNames = [], onOpenElement, onHoverElement, focusDim = false, autoIndent = false, vim = false, onVimMode, onUndo, onRedo, onVimNav, onFind, typewriter = false, spellcheck = true, columnWidth = "full", zoom = 100 } = props;

  const lines = useMemo(() => value.split("\n"), [value]);
  const [active, setActive] = useState(0);
  const pending = useRef<{ line: number; pos: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const current = Math.min(active, lines.length - 1);
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const [vimMode, setVimMode] = useState<VimMode>(vim ? "normal" : "insert");
  const vimPending = useRef("");
  const register = useRef<{ text: string; line: boolean } | null>(null);
  const vimCount = useRef("");

  useEffect(() => setVimMode(vim ? "normal" : "insert"), [vim]);
  useEffect(() => {
    if (vim && !disabled) focusLine(0, 0);
  }, []);
  useEffect(() => onVimMode?.(vim ? vimMode : null), [vim, vimMode]);

  // Typing [[ offers matching elements to link to.
  const linkMatch = !disabled && lines[current] !== undefined ? /\[\[([^\]\n]*)$/.exec(lines[current].slice(0, caret)) : null;
  const suggestions = linkMatch ? elementNames.filter((name) => name.toLowerCase().includes(linkMatch[1].toLowerCase())).slice(0, 6) : [];

  const rendered = useMemo(() => {
    let inFence = false;
    let inPoetry = false;
    // A page starts at the top of the file and after each horizontal rule.
    let pageStart = dropCap;
    // Publishers don't indent the first paragraph after a heading or scene break.
    let afterBreak = true;
    const known = new Set(elementNames.map((name) => name.toLowerCase()));
    const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const link = (text: string) =>
      text.replace(/\[\[([^\]\n]+)\]\]/g, (_match, name: string) => {
        const trimmed = name.trim();
        return `<a class="element-link${known.has(trimmed.toLowerCase()) ? "" : " missing"}" data-element="${escape(trimmed)}">${escape(trimmed)}</a>`;
      });

    return lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        inFence = !inFence;
        return { kind: "fence" as const, html: "", indent: false, poetry: false };
      }
      if (inFence) return { kind: "code" as const, html: "", indent: false, poetry: false };
      if (trimmed === "::: poetry" && !inPoetry) {
        inPoetry = true;
        return { kind: "marker" as const, html: "", indent: false, poetry: false };
      }
      if (trimmed === ":::" && inPoetry) {
        inPoetry = false;
        afterBreak = true;
        return { kind: "marker" as const, html: "", indent: false, poetry: false };
      }
      if (!trimmed) return { kind: "blank" as const, html: "", indent: false, poetry: false };

      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        pageStart = dropCap;
        afterBreak = true;
        return { kind: "md" as const, html: marked.parse(line, { gfm: true }) as string, indent: false, poetry: false };
      }
      if (inPoetry) return { kind: "md" as const, html: marked.parse(link(line), { gfm: true }) as string, indent: false, poetry: true };

      const plain = !/^\s*(#|>|[-*+]\s|\d+[.)]\s|<|\||!\[)/.test(line);
      let source = line;
      if (pageStart && plain) {
        source = line.replace(/^(\s*["“'‘]?)(\p{L})/u, '$1<span class="DropCap">$2</span>');
        pageStart = false;
      } else if (!/^\s*#/.test(line)) {
        pageStart = false;
      }
      const indent = autoIndent && plain && !afterBreak;
      if (/^\s*#/.test(line)) afterBreak = true;
      else if (plain) afterBreak = false;
      return { kind: "md" as const, html: marked.parse(link(source), { gfm: true }) as string, indent, poetry: false };
    });
  }, [lines, dropCap, elementNames, autoIndent]);

  function update(next: string[]) {
    onChange(next.join("\n"));
  }

  function focusLine(line: number, pos: number) {
    pending.current = { line, pos };
    setActive(line);
  }

  function replaceCurrent(text: string, pos: number) {
    const next = [...lines];
    next[current] = text;
    update(next);
    setCaret(pos);
    focusLine(current, pos);
  }

  function removeLine(index: number) {
    const next = lines.length === 1 ? [""] : lines.filter((_, i) => i !== index);
    update(next);
    focusLine(Math.min(index, next.length - 1), 0);
  }

  function insertMultiline(text: string) {
    const el = inputRef.current;
    const line = lines[current];
    const start = el?.selectionStart ?? line.length;
    const end = el?.selectionEnd ?? start;
    const parts = text.replace(/\r/g, "").split("\n");
    const before = line.slice(0, start);
    const after = line.slice(end);
    if (parts.length === 1) {
      replaceCurrent(before + parts[0] + after, start + parts[0].length);
      return;
    }
    const next = [...lines];
    next.splice(current, 1, before + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + after);
    update(next);
    focusLine(current + parts.length - 1, parts[parts.length - 1].length);
  }

  function applySuggestion(name: string) {
    if (!linkMatch) return;
    const line = lines[current];
    const before = line.slice(0, linkMatch.index);
    const after = line.slice(caret);
    const pos = before.length + name.length + 4;
    setSel(0);
    replaceCurrent(`${before}[[${name}]]${after.startsWith("]]") ? after.slice(2) : after}`, pos);
  }

  useImperativeHandle(ref, () => ({
    wrapSelection(before, after = before) {
      const el = inputRef.current;
      if (!el) return;
      const line = lines[current];
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = line.slice(start, end);
      if (start >= before.length && line.slice(start - before.length, start) === before && line.slice(end, end + after.length) === after) {
        replaceCurrent(line.slice(0, start - before.length) + selected + line.slice(end + after.length), end - before.length);
      } else {
        replaceCurrent(line.slice(0, start) + before + selected + after + line.slice(end), selected ? end + before.length + after.length : start + before.length);
      }
    },
    setHeading(level) {
      const line = lines[current];
      const existing = /^(#{1,6})\s+/.exec(line)?.[1].length ?? 0;
      const stripped = line.replace(/^#{1,6}\s+/, "");
      replaceCurrent(existing === level ? stripped : `${"#".repeat(level)} ${stripped}`, 0);
    },
    prefixLine(prefix) {
      const line = lines[current];
      replaceCurrent(line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line.replace(/^(#{1,6}\s+|>\s+|[-*+]\s+)/, ""), 0);
    },
    insertText(text, caretBack = 0) {
      const el = inputRef.current;
      const line = lines[current];
      const start = el?.selectionStart ?? line.length;
      const end = el?.selectionEnd ?? start;
      replaceCurrent(line.slice(0, start) + text + line.slice(end), start + text.length - caretBack);
      if (caretBack) setCaret(start + text.length - caretBack);
    },
    insertLineAfter(text) {
      const next = [...lines];
      next.splice(current + 1, 0, text);
      update(next);
      focusLine(current + 1, text.length);
    },
    copy() {
      const el = inputRef.current;
      const line = lines[current];
      const text = el && el.selectionEnd > el.selectionStart ? line.slice(el.selectionStart, el.selectionEnd) : line;
      void navigator.clipboard?.writeText(text);
    },
    cut() {
      const el = inputRef.current;
      const line = lines[current];
      if (el && el.selectionEnd > el.selectionStart) {
        void navigator.clipboard?.writeText(line.slice(el.selectionStart, el.selectionEnd));
        replaceCurrent(line.slice(0, el.selectionStart) + line.slice(el.selectionEnd), el.selectionStart);
      } else {
        void navigator.clipboard?.writeText(line);
        removeLine(current);
      }
    },
    paste() {
      navigator.clipboard
        ?.readText()
        .then(insertMultiline)
        .catch(() => document.execCommand("paste"));
    },
    selectLine() {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(0, lines[current].length);
    },
    deleteLine: () => removeLine(current),
    duplicateLine() {
      const next = [...lines];
      next.splice(current + 1, 0, lines[current]);
      update(next);
      focusLine(current + 1, lines[current].length);
    },
    moveLine(delta) {
      const target = current + delta;
      if (target < 0 || target >= lines.length) return;
      const next = [...lines];
      [next[current], next[target]] = [next[target], next[current]];
      update(next);
      focusLine(target, inputRef.current?.selectionStart ?? 0);
    },
    togglePoetry() {
      if (isMarker(lines[current])) return;
      let start = current;
      let end = current;
      while (start > 0 && lines[start - 1].trim() && !isMarker(lines[start - 1])) start--;
      while (end < lines.length - 1 && lines[end + 1].trim() && !isMarker(lines[end + 1])) end++;
      const next = [...lines];
      if (lines[start - 1]?.trim() === "::: poetry" && lines[end + 1]?.trim() === ":::") {
        next.splice(end + 1, 1);
        next.splice(start - 1, 1);
        update(next);
        focusLine(current - 1, 0);
      } else {
        next.splice(end + 1, 0, ":::");
        next.splice(start, 0, "::: poetry");
        update(next);
        focusLine(current + 1, 0);
      }
    },
    clearFormatting() {
      const line = lines[current];
      replaceCurrent(line.replace(/^(#{1,6}\s+|>\s+|[-*+]\s+)/, "").replace(/(\*\*|__|~~|\*|_|`)/g, ""), 0);
    },
    goTo(line, pos = 0) {
      focusLine(Math.max(0, Math.min(line, lines.length - 1)), pos);
    },
  }));

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (pending.current && pending.current.line === current) {
      el.focus();
      const pos = Math.min(pending.current.pos, el.value.length);
      const block = vim && vimMode === "normal" && pos < el.value.length;
      el.setSelectionRange(pos, block ? pos + 1 : pos);
      pending.current = null;
    }
  });

  useEffect(() => {
    if (typewriter) inputRef.current?.scrollIntoView({ block: "center" });
  }, [typewriter, current, value]);

  // Returns true when the key was consumed by vim normal mode.
  function handleVim(event: React.KeyboardEvent<HTMLTextAreaElement>, el: HTMLTextAreaElement) {
    const key = event.key;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      if (event.ctrlKey && key === "r") {
        event.preventDefault();
        onRedo?.();
        return true;
      }
      if (event.ctrlKey && (key === "d" || key === "u")) {
        event.preventDefault();
        focusLine(Math.max(0, Math.min(lines.length - 1, current + (key === "d" ? 10 : -10))), 0);
        return true;
      }
      return false;
    }
    if (key.length > 1 && !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace", "Delete", "Enter"].includes(key)) return false;
    event.preventDefault();

    const line = lines[current];
    const last = Math.max(0, line.length - 1);
    const col = Math.min(el.selectionStart, last);
    const previous = vimPending.current;
    vimPending.current = "";

    // A numeric prefix such as 3j or 2dd.
    if (/^[1-9]$/.test(key) || (key === "0" && vimCount.current)) {
      vimCount.current += key;
      vimPending.current = previous;
      return true;
    }
    const hadCount = vimCount.current !== "";
    const count = Math.max(1, parseInt(vimCount.current || "1", 10));
    vimCount.current = "";

    const setCol = (target: number) => {
      const pos = Math.max(0, Math.min(target, last));
      el.setSelectionRange(pos, Math.min(pos + 1, line.length));
    };
    const enterInsert = (pos: number) => {
      setVimMode("insert");
      focusLine(current, Math.max(0, Math.min(pos, line.length)));
    };
    const insertBlank = (at: number) => {
      const next = [...lines];
      next.splice(at, 0, "");
      update(next);
      setVimMode("insert");
      focusLine(at, 0);
    };
    const nextWord = (from: number) => {
      const match = /^\S*\s+(?=\S)/.exec(line.slice(from));
      return match ? from + match[0].length : line.length;
    };
    const wordEnd = (from: number) => {
      const match = /^\s*\S+/.exec(line.slice(from + 1));
      return match ? from + match[0].length : last;
    };
    const wordBack = (from: number) => {
      const match = /\S+\s*$/.exec(line.slice(0, from));
      return match ? match.index : 0;
    };
    const times = (step: (from: number) => number, from: number) => {
      let at = from;
      for (let i = 0; i < count; i++) at = step(at);
      return at;
    };

    if (previous === "d" || previous === "c" || previous === "y") {
      if (key === previous) {
        const end = Math.min(lines.length, current + count);
        register.current = { text: lines.slice(current, end).join("\n"), line: true };
        if (previous === "d") {
          const next = lines.filter((_, i) => i < current || i >= end);
          update(next.length ? next : [""]);
          focusLine(Math.min(current, Math.max(0, next.length - 1)), 0);
        } else if (previous === "c") {
          replaceCurrent("", 0);
          setVimMode("insert");
        }
        return true;
      }
      let from = col;
      let to = col;
      if (key === "w") to = previous === "c" ? col + (/^\s*\S*/.exec(line.slice(col))?.[0].length ?? 0) : times(nextWord, col);
      else if (key === "$") to = line.length;
      else if (key === "0") from = 0;
      else return true;
      register.current = { text: line.slice(from, to), line: false };
      if (previous !== "y") {
        replaceCurrent(line.slice(0, from) + line.slice(to), from);
        if (previous === "c") setVimMode("insert");
      }
      return true;
    }
    if (previous === "g") {
      if (key === "g") focusLine(hadCount ? Math.min(count, lines.length) - 1 : 0, 0);
      return true;
    }
    if (previous === "z") {
      if (key === "z") inputRef.current?.scrollIntoView({ block: "center" });
      return true;
    }
    if (previous === "r") {
      if (key.length === 1 && line.length) replaceCurrent(line.slice(0, col) + key + line.slice(col + 1), col);
      return true;
    }

    switch (key) {
      case "h": case "ArrowLeft": case "Backspace": setCol(col - count); break;
      case "l": case "ArrowRight": setCol(col + count); break;
      case "0": setCol(0); break;
      case "^": setCol(Math.max(0, line.search(/\S/))); break;
      case "$": setCol(last); break;
      case "w": setCol(Math.min(times(nextWord, col), last)); break;
      case "e": setCol(times(wordEnd, col)); break;
      case "b": setCol(times(wordBack, col)); break;
      case "j": case "ArrowDown": case "Enter":
        if (current < lines.length - 1) focusLine(Math.min(lines.length - 1, current + count), col);
        break;
      case "k": case "ArrowUp":
        if (current > 0) focusLine(Math.max(0, current - count), col);
        break;
      case "G": focusLine(hadCount ? Math.min(count, lines.length) - 1 : lines.length - 1, 0); break;
      case "}": {
        let i = current + 1;
        while (i < lines.length && lines[i].trim()) i++;
        focusLine(Math.min(i, lines.length - 1), 0);
        break;
      }
      case "{": {
        let i = current - 1;
        while (i > 0 && lines[i].trim()) i--;
        focusLine(Math.max(i, 0), 0);
        break;
      }
      case "g": case "d": case "c": case "y": case "r": case "z": vimPending.current = key; break;
      case "i": enterInsert(col); break;
      case "a": enterInsert(col + 1); break;
      case "I": enterInsert(Math.max(0, line.search(/\S/))); break;
      case "A": enterInsert(line.length); break;
      case "o": insertBlank(current + 1); break;
      case "O": insertBlank(current); break;
      case "x": case "Delete":
        if (line.length) {
          register.current = { text: line.slice(col, col + count), line: false };
          replaceCurrent(line.slice(0, col) + line.slice(col + count), Math.min(col, Math.max(0, line.length - count - 1)));
        }
        break;
      case "s":
        register.current = { text: line.slice(col, col + count), line: false };
        replaceCurrent(line.slice(0, col) + line.slice(col + count), col);
        setVimMode("insert");
        break;
      case "S": replaceCurrent("", 0); setVimMode("insert"); break;
      case "D": register.current = { text: line.slice(col), line: false }; replaceCurrent(line.slice(0, col), Math.max(0, col - 1)); break;
      case "C": register.current = { text: line.slice(col), line: false }; replaceCurrent(line.slice(0, col), col); setVimMode("insert"); break;
      case "~": {
        const ch = line[col] ?? "";
        replaceCurrent(line.slice(0, col) + (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()) + line.slice(col + 1), Math.min(col + 1, last));
        break;
      }
      case "p": case "P": {
        const reg = register.current;
        if (!reg) break;
        if (reg.line) {
          const next = [...lines];
          const at = key === "p" ? current + 1 : current;
          next.splice(at, 0, ...reg.text.split("\n"));
          update(next);
          focusLine(at, 0);
        } else {
          const at = key === "p" ? Math.min(col + 1, line.length) : col;
          replaceCurrent(line.slice(0, at) + reg.text + line.slice(at), Math.max(0, at + reg.text.length - 1));
        }
        break;
      }
      case "u": onUndo?.(); break;
      case "/": onFind?.(); break;
      // Shift+H/L switch tabs; Shift+J/K step through chapters, acts and scenes.
      case "H": onVimNav?.("tabPrev"); break;
      case "L": onVimNav?.("tabNext"); break;
      case "J": onVimNav?.("nodeNext"); break;
      case "K": onVimNav?.("nodePrev"); break;
    }
    return true;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    const pos = el.selectionStart;
    const end = el.selectionEnd;
    const line = lines[current];

    if (vim) {
      if (event.key === "Escape") {
        event.preventDefault();
        vimPending.current = "";
        if (vimMode === "insert") {
          setVimMode("normal");
          focusLine(current, Math.max(0, pos - 1));
        }
        return;
      }
      if (vimMode === "normal" && handleVim(event, el)) return;
    }

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

    // Publisher typography: curly quotes and em dashes.
    if (autoIndent && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === '"' || event.key === "'") {
        event.preventDefault();
        const prev = line.slice(0, pos).slice(-1);
        const opening = prev === "" || /[\s(\[{—–“‘]/.test(prev);
        const quote = event.key === '"' ? (opening ? "“" : "”") : opening ? "‘" : "’";
        replaceCurrent(line.slice(0, pos) + quote + line.slice(end), pos + 1);
        return;
      }
      if (event.key === "-" && pos === end && line[pos - 1] === "-") {
        event.preventDefault();
        replaceCurrent(`${line.slice(0, pos - 1)}—${line.slice(end)}`, pos);
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const next = [...lines];
      next.splice(current, 1, line.slice(0, pos), line.slice(end));
      update(next);
      focusLine(current + 1, 0);
    } else if (event.key === "Backspace" && pos === 0 && end === 0 && current > 0) {
      event.preventDefault();
      const next = [...lines];
      const joinAt = lines[current - 1].length;
      next.splice(current - 1, 2, lines[current - 1] + line);
      update(next);
      focusLine(current - 1, joinAt);
    } else if (event.key === "ArrowUp" && current > 0 && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      focusLine(current - 1, Math.min(pos, lines[current - 1].length));
    } else if (event.key === "ArrowDown" && current < lines.length - 1 && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      focusLine(current + 1, Math.min(pos, lines[current + 1].length));
    } else if (event.key === "ArrowLeft" && pos === 0 && end === 0 && current > 0) {
      event.preventDefault();
      focusLine(current - 1, lines[current - 1].length);
    } else if (event.key === "ArrowRight" && pos === line.length && current < lines.length - 1) {
      event.preventDefault();
      focusLine(current + 1, 0);
    }
  }

  if (disabled) {
    return <div className={`flex-1 overflow-auto ${className}`} style={{ color: "var(--muted)" }}>Choose a workspace and open or create a file to start writing.</div>;
  }

  return (
    <div className={`flex-1 overflow-auto ${className}`}>
      <style>{`.markdown-body.live-line > :first-child{margin-top:0}.markdown-body.live-line > :last-child{margin-bottom:0}.element-link{color:#38bdf8;border-bottom:1px dotted #38bdf8;cursor:pointer}.element-link.missing{color:#f87171;border-bottom-color:#f87171}.focus-lines > *{transition:opacity 1.2s ease}.focus-lines.focus-dim > *:not(.active-line){opacity:0.06}.live-line.indented > p{text-indent:1.5em}.live-line.poetry-line{padding-left:2.5em;font-style:italic}.live-line.poetry-line > p{margin:0}.markdown-body ul{list-style:disc outside;padding-left:1.6rem}.markdown-body ol{list-style:decimal outside;padding-left:1.6rem}.markdown-body li{display:list-item}`}</style>
      <div style={{ maxWidth: WIDTHS[columnWidth], margin: "0 auto", zoom: zoom / 100 }}>
        <div
          className={`markdown-body focus-lines${focusDim ? " focus-dim" : ""}`}
          onMouseOver={(event) => {
            const target = (event.target as HTMLElement).closest?.("[data-element]");
            if (target) onHoverElement?.(target.getAttribute("data-element"), target.getBoundingClientRect());
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
                    spellCheck={spellcheck}
                    onChange={(event) => {
                      const next = [...lines];
                      next[index] = event.target.value.replace(/\n/g, " ");
                      update(next);
                      setCaret(event.target.selectionStart ?? 0);
                      setSel(0);
                    }}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData("text");
                      if (text.includes("\n")) {
                        event.preventDefault();
                        insertMultiline(text);
                      }
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
                const target = (event.target as HTMLElement).closest?.("[data-element]");
                if (target && onOpenElement) {
                  onOpenElement(target.getAttribute("data-element") ?? "");
                  return;
                }
                focusLine(index, line.length);
              },
            };
            if (item.kind === "marker") return <div {...common} style={{ height: 0, overflow: "hidden" }} />;
            if (item.kind === "blank") return <div {...common} style={{ minHeight: autoIndent ? 6 : "1.75em" }} />;
            if (item.kind === "md") return <div {...common} className={`markdown-body live-line${item.indent ? " indented" : ""}${item.poetry ? " poetry-line" : ""}`} dangerouslySetInnerHTML={{ __html: item.html }} />;
            return (
              <div {...common} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, whiteSpace: "pre-wrap", background: "rgba(15, 23, 42, 0.8)", padding: "0 0.75rem", minHeight: "1.75em" }}>
                {line}
              </div>
            );
          })}
          <div style={{ minHeight: 160 }} onMouseDown={(event) => { event.preventDefault(); focusLine(lines.length - 1, lines[lines.length - 1].length); }} />
        </div>
      </div>
    </div>
  );
});
