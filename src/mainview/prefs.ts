import { useCallback, useState } from "react";

export type ColumnWidth = "narrow" | "medium" | "wide" | "full";
export type Tab = "manuscript" | "planning" | "elements" | "research";

export type WordFormat = { count: boolean; ofGoal: boolean; percent: boolean };

export type Prefs = {
  confirmDelete: boolean;
  defaultTab: Tab;
  vim: boolean;
  typewriter: boolean;
  spellcheck: boolean;
  autoIndent: boolean;
  dropCap: boolean;
  zoom: number;
  columnWidth: ColumnWidth;
  showSidebar: boolean;
  showStatus: boolean;
  showWordCount: boolean;
  showTreeWords: boolean;
  wordFormat: WordFormat;
  autosaveMs: number;
  shortcuts: Record<string, string>;
  email: string;
  pdfSpacing: number;
  pdfFontSize: number;
  pdfNewPage: boolean;
};

export const defaultPrefs: Prefs = {
  confirmDelete: true,
  defaultTab: "manuscript",
  vim: false,
  typewriter: false,
  spellcheck: true,
  autoIndent: false,
  dropCap: true,
  zoom: 100,
  columnWidth: "full",
  showSidebar: true,
  showStatus: true,
  showWordCount: true,
  showTreeWords: true,
  wordFormat: { count: true, ofGoal: true, percent: false },
  autosaveMs: 350,
  shortcuts: {},
  email: "",
  pdfSpacing: 2,
  pdfFontSize: 12,
  pdfNewPage: true,
};

const KEY = "ghoaxtwriter.prefs";

function load(): Prefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const legacy = localStorage.getItem("ghoaxtwriter.confirmDelete");
    return {
      ...defaultPrefs,
      ...(legacy !== null ? { confirmDelete: legacy !== "false" } : {}),
      ...stored,
      wordFormat: { ...defaultPrefs.wordFormat, ...stored.wordFormat },
      shortcuts: { ...stored.shortcuts },
    };
  } catch {
    return defaultPrefs;
  }
}

export function usePrefs() {
  const [prefs, setState] = useState<Prefs>(load);
  const setPrefs = useCallback((change: Partial<Prefs>) => {
    setState((prev) => {
      const next = { ...prev, ...change };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return [prefs, setPrefs] as const;
}

// Shows a word count as a plain count, count/goal, a percentage, or a mix; without a goal it is always the plain count.
export function formatWords(words: number, goal: number | undefined, format: WordFormat) {
  if (!goal) return words.toLocaleString();
  const parts: string[] = [];
  if (format.ofGoal) parts.push(`${words.toLocaleString()}/${goal.toLocaleString()}`);
  else if (format.count) parts.push(words.toLocaleString());
  if (format.percent) parts.push(`${Math.round((words / goal) * 100)}%`);
  return parts.length ? parts.join(" · ") : words.toLocaleString();
}
