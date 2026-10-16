import { Check, field, Row, Section } from "./controls";
import type { Prefs } from "./prefs";
import { defaultTypography, FONT_CHOICES, readTypography, type Typography, withTypography } from "./typography";

type Props = {
  markdownCss: string;
  setMarkdownCss: (css: string) => void;
  prefs: Prefs;
  setPrefs: (change: Partial<Prefs>) => void;
};

const option = (value: string, label: string) => <option key={label} value={value} style={{ color: "#111827" }}>{label}</option>;

// Edits are written into a marked block of the workspace's markdown CSS.
export function TypographyControls({ markdownCss, setMarkdownCss, prefs, setPrefs }: Props) {
  const t = readTypography(markdownCss) ?? defaultTypography;
  const set = (change: Partial<Typography>) => setMarkdownCss(withTypography(markdownCss, { ...t, ...change }));
  const num = (value: string, fallback: number) => (Number.isFinite(parseFloat(value)) ? parseFloat(value) : fallback);
  const knownFont = FONT_CHOICES.some((choice) => choice.value === t.bodyFont);
  const narrow = { width: 80 };

  return (
    <>
      <Section title="Text">
        <Row label="Body font">
          <select className={field} value={knownFont ? t.bodyFont : "custom"} onChange={(event) => event.target.value !== "custom" && set({ bodyFont: event.target.value })}>
            {FONT_CHOICES.map((choice) => option(choice.value, choice.label))}
            {!knownFont && option("custom", "Custom")}
          </select>
        </Row>
        <Row label="Heading font">
          <select className={field} value={t.headingFont} onChange={(event) => set({ headingFont: event.target.value })}>
            {option("inherit", "Same as body")}
            {FONT_CHOICES.map((choice) => option(choice.value, choice.label))}
          </select>
        </Row>
        <Row label="Font size (px)"><input type="number" className={field} style={narrow} min={10} max={40} value={t.fontSize} onChange={(event) => set({ fontSize: num(event.target.value, 17) })} /></Row>
        <Row label="Line height"><input type="number" className={field} style={narrow} min={1} max={3} step={0.05} value={t.lineHeight} onChange={(event) => set({ lineHeight: num(event.target.value, 1.75) })} /></Row>
        <Row label="First-line indent (em)"><input type="number" className={field} style={narrow} min={0} max={5} step={0.25} value={t.indent} onChange={(event) => set({ indent: num(event.target.value, 1.5) })} /></Row>
        <Check label="Auto-indent paragraphs" hint="Indents every paragraph except the first after a heading or scene break" checked={prefs.autoIndent} onChange={(autoIndent) => setPrefs({ autoIndent })} />
      </Section>

      <Section title="Drop cap">
        <Check label="Drop cap on the first paragraph of each page" checked={prefs.dropCap} onChange={(dropCap) => setPrefs({ dropCap })} />
        <Row label="Size (em)"><input type="number" className={field} style={narrow} min={1} max={10} step={0.2} value={t.dropCapSize} onChange={(event) => set({ dropCapSize: num(event.target.value, 4.2) })} /></Row>
        <Check label="Sink into the paragraph" hint="Off keeps it inline with the first line" checked={t.dropCapFloat} onChange={(dropCapFloat) => set({ dropCapFloat })} />
        <Row label="Weight">
          <select className={field} value={t.dropCapWeight} onChange={(event) => set({ dropCapWeight: event.target.value })}>
            {option("400", "Regular")}
            {option("700", "Bold")}
          </select>
        </Row>
        <Row label="Font">
          <select className={field} value={t.dropCapFont} onChange={(event) => set({ dropCapFont: event.target.value })}>
            {option("inherit", "Same as body")}
            {FONT_CHOICES.map((choice) => option(choice.value, choice.label))}
          </select>
        </Row>
        <Row label="Colour"><input className={field} style={{ width: 110 }} placeholder="e.g. #f59e0b" value={t.dropCapColor} onChange={(event) => set({ dropCapColor: event.target.value })} /></Row>
      </Section>

      <Section title="Poetry">
        <Row label="Indent (em)"><input type="number" className={field} style={narrow} min={0} max={10} step={0.5} value={t.poetryIndent} onChange={(event) => set({ poetryIndent: num(event.target.value, 2.5) })} /></Row>
        <Check label="Italic" checked={t.poetryItalic} onChange={(poetryItalic) => set({ poetryItalic })} />
      </Section>
    </>
  );
}
