import { useState } from "react";
import { defaultPrefs, type ColumnWidth, type Prefs, type Tab } from "./prefs";
import { Check, field, ghost, Row, Section } from "./controls";
import { TypographyControls } from "./TypographyControls";

type StyleElement = { key: string; label: string; fallback: string };

type Props = {
  prefs: Prefs;
  setPrefs: (change: Partial<Prefs>) => void;
  tw: Record<string, string>;
  setTw: (next: any) => void;
  styleElements: ReadonlyArray<StyleElement>;
  appCss: string;
  setAppCss: (css: string) => void;
  markdownCss: string;
  setMarkdownCss: (css: string) => void;
  workspace: string | null;
  onChangeWorkspace: () => void;
  onReveal: () => void;
  onOpenShortcuts: () => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
  panelClass: string;
  buttonClass: string;
  style: React.CSSProperties;
};

export function SettingsPanel(props: Props) {
  const { prefs, setPrefs, tw, setTw, styleElements, appCss, setAppCss, markdownCss, setMarkdownCss, workspace } = props;
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  return (
    <aside className={`fixed top-0 right-0 bottom-0 w-96 overflow-auto p-4 border-l shadow-2xl ${props.panelClass}`} style={{ zIndex: 40, ...props.style }} onClick={(event) => event.stopPropagation()}>
      <div className="flex justify-between items-center mb-4">
        <strong style={{ fontSize: 18 }}>Settings</strong>
        <button type="button" onClick={props.onClose} className={ghost}>Close</button>
      </div>

      <Section title="General">
        <div style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all" }}>Workspace: {workspace ?? "none chosen"}</div>
        <div className="flex gap-2">
          <button type="button" className={ghost} onClick={props.onChangeWorkspace}>{workspace ? "Change…" : "Choose…"}</button>
          {workspace && <button type="button" className={ghost} onClick={props.onReveal}>Show in file manager</button>}
        </div>
        <Check label="Ask before deleting" checked={prefs.confirmDelete} onChange={(confirmDelete) => setPrefs({ confirmDelete })} />
        <Row label="Open novels to">
          <select className={field} value={prefs.defaultTab} onChange={(event) => setPrefs({ defaultTab: event.target.value as Tab })}>
            {["manuscript", "planning", "elements", "research"].map((tab) => <option key={tab} value={tab} style={{ color: "#111827" }}>{tab[0].toUpperCase() + tab.slice(1)}</option>)}
          </select>
        </Row>
        <Row label="Autosave after">
          <select className={field} value={prefs.autosaveMs} onChange={(event) => setPrefs({ autosaveMs: Number(event.target.value) })}>
            {[[350, "0.35 s"], [1000, "1 s"], [3000, "3 s"], [10000, "10 s"]].map(([ms, label]) => <option key={ms} value={ms} style={{ color: "#111827" }}>{label}</option>)}
          </select>
        </Row>
      </Section>

      <Section title="Writing">
        <Check label="Auto-indent and smart quotes" hint="Publisher-style indents, curly quotes, em dashes" checked={prefs.autoIndent} onChange={(autoIndent) => setPrefs({ autoIndent })} />
        <Check label="Drop caps on new pages" checked={prefs.dropCap} onChange={(dropCap) => setPrefs({ dropCap })} />
        <Check label="Typewriter scrolling" hint="Keeps the current line centred" checked={prefs.typewriter} onChange={(typewriter) => setPrefs({ typewriter })} />
        <Check label="Vim keys" checked={prefs.vim} onChange={(vim) => setPrefs({ vim })} />
        <Check label="Check spelling" checked={prefs.spellcheck} onChange={(spellcheck) => setPrefs({ spellcheck })} />
        <Row label="Column width">
          <select className={field} value={prefs.columnWidth} onChange={(event) => setPrefs({ columnWidth: event.target.value as ColumnWidth })}>
            {["narrow", "medium", "wide", "full"].map((width) => <option key={width} value={width} style={{ color: "#111827" }}>{width[0].toUpperCase() + width.slice(1)}</option>)}
          </select>
        </Row>
        <Row label={`Zoom ${prefs.zoom}%`}>
          <input type="range" min={60} max={220} step={10} value={prefs.zoom} onChange={(event) => setPrefs({ zoom: Number(event.target.value) })} />
        </Row>
      </Section>

      <Section title="Display">
        <Check label="Show sidebar" checked={prefs.showSidebar} onChange={(showSidebar) => setPrefs({ showSidebar })} />
        <Check label="Show status bar" checked={prefs.showStatus} onChange={(showStatus) => setPrefs({ showStatus })} />
        <Check label="Word count in status bar" checked={prefs.showWordCount} onChange={(showWordCount) => setPrefs({ showWordCount })} />
        <Check label="Word counts beside files and folders" checked={prefs.showTreeWords} onChange={(showTreeWords) => setPrefs({ showTreeWords })} />
        <div style={{ fontSize: 12, color: "var(--muted)" }}>When a goal is set, show word counts as:</div>
        <Check label="Number" checked={prefs.wordFormat.count} onChange={(count) => setPrefs({ wordFormat: { ...prefs.wordFormat, count } })} />
        <Check label="Number / goal" checked={prefs.wordFormat.ofGoal} onChange={(ofGoal) => setPrefs({ wordFormat: { ...prefs.wordFormat, ofGoal } })} />
        <Check label="Percentage of goal" checked={prefs.wordFormat.percent} onChange={(percent) => setPrefs({ wordFormat: { ...prefs.wordFormat, percent } })} />
      </Section>

      <Section title="Keyboard">
        <button type="button" className={ghost} onClick={props.onOpenShortcuts}>Customize shortcuts…</button>
      </Section>

      <div className="flex justify-between items-center mb-3">
        <strong>Appearance</strong>
        <div className="flex gap-2">
          <button type="button" onClick={props.onReset} className={ghost}>Reset</button>
          <button type="button" onClick={props.onSave} className={`px-3 py-1 ${props.buttonClass}`}>Save</button>
        </div>
      </div>

      <TypographyControls markdownCss={markdownCss} setMarkdownCss={setMarkdownCss} prefs={prefs} setPrefs={setPrefs} />

      <Section title="App colours (Tailwind classes)">
        {styleElements.map((element) => (
          <div key={element.key}>
            <button type="button" onClick={() => setOpenStyle(openStyle === element.key ? null : element.key)} className={`w-full text-left px-3 py-2 rounded-lg border ${openStyle === element.key ? "border-amber-500" : "border-slate-700"}`}>
              {element.label}
            </button>
            {openStyle === element.key && (
              <input autoFocus className={`${field} w-full mt-2`} value={tw[element.key]} placeholder={element.fallback} onChange={(event) => setTw({ ...tw, [element.key]: event.target.value })} />
            )}
          </div>
        ))}
      </Section>

      <Section title="Custom CSS">
        {([["markdown", "Markdown formatting", markdownCss, setMarkdownCss, 260], ["appcss", "App CSS", appCss, setAppCss, 180]] as const).map(([key, label, value, setter, height]) => (
          <div key={key}>
            <button type="button" onClick={() => setOpenStyle(openStyle === key ? null : key)} className={`w-full text-left px-3 py-2 rounded-lg border ${openStyle === key ? "border-amber-500" : "border-slate-700"}`}>
              {label}
            </button>
            {openStyle === key && <textarea className={`${field} w-full mt-2`} style={{ minHeight: height, fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }} value={value} onChange={(event) => setter(event.target.value)} />}
          </div>
        ))}
      </Section>

      <button type="button" className={ghost} onClick={() => confirm("Reset all preferences, including custom shortcuts?") && setPrefs({ ...defaultPrefs })}>Reset preferences</button>
    </aside>
  );
}
