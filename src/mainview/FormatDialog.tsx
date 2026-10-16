import { Modal } from "./Dialogs";
import type { Prefs } from "./prefs";
import { TypographyControls } from "./TypographyControls";

type Props = {
  markdownCss: string;
  setMarkdownCss: (css: string) => void;
  prefs: Prefs;
  setPrefs: (change: Partial<Prefs>) => void;
  onSave: () => void;
  onClose: () => void;
};

const SAMPLE = [
  { className: "markdown-body live-line", html: '<p><span class="DropCap">T</span>he rain had not stopped for three days, and the village had begun to smell of wet stone and woodsmoke. Maren stood at the window and watched the road, which was no longer a road but a brown river.</p>' },
  { className: "markdown-body live-line indented", html: "<p>\u201cYou\u2019ll catch your death standing there,\u201d her mother said from the fire.</p>" },
  { className: "markdown-body live-line poetry-line", html: "<p>Rain on the thatch, rain on the stone,<br>rain on the road that led her home.</p>" },
];

// The app's own CSS is live, so the preview shows changes as they are made.
export function FormatDialog({ markdownCss, setMarkdownCss, prefs, setPrefs, onSave, onClose }: Props) {
  return (
    <Modal onClose={onClose} width={620}>
      <strong style={{ fontSize: 18 }}>Fonts and drop caps</strong>
      <div className="rounded-lg border border-slate-700 p-4" style={{ background: "rgba(0,0,0,0.25)" }}>
        {SAMPLE.map((item, index) => (
          <div key={index} className={item.className} dangerouslySetInnerHTML={{ __html: item.html }} />
        ))}
      </div>
      <div style={{ maxHeight: "42vh", overflow: "auto" }}>
        <TypographyControls markdownCss={markdownCss} setMarkdownCss={setMarkdownCss} prefs={prefs} setPrefs={setPrefs} />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onClose}>Close</button>
        <button type="button" className="px-3 py-2 rounded-lg bg-amber-500 text-slate-900" onClick={() => { onSave(); onClose(); }}>Save to workspace</button>
      </div>
    </Modal>
  );
}
