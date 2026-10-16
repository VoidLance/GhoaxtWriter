export type Typography = {
  bodyFont: string;
  fontSize: number;
  lineHeight: number;
  indent: number;
  headingFont: string;
  dropCapSize: number;
  dropCapFloat: boolean;
  dropCapWeight: string;
  dropCapFont: string;
  dropCapColor: string;
  poetryIndent: number;
  poetryItalic: boolean;
};

export const defaultTypography: Typography = {
  bodyFont: '"Georgia", "Iowan Old Style", serif',
  fontSize: 17,
  lineHeight: 1.75,
  indent: 1.5,
  headingFont: "inherit",
  dropCapSize: 4.2,
  dropCapFloat: true,
  dropCapWeight: "700",
  dropCapFont: "inherit",
  dropCapColor: "",
  poetryIndent: 2.5,
  poetryItalic: true,
};

export const FONT_CHOICES: Array<{ label: string; value: string }> = [
  { label: "Georgia", value: '"Georgia", "Iowan Old Style", serif' },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Garamond", value: 'Garamond, "EB Garamond", "Times New Roman", serif' },
  { label: "Palatino", value: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  { label: "Baskerville", value: 'Baskerville, "Libre Baskerville", Georgia, serif' },
  { label: "Sans serif", value: '"Inter", "Segoe UI", sans-serif' },
  { label: "Monospace", value: '"JetBrains Mono", "SFMono-Regular", monospace' },
];

const START = "/* ghoaxt:typography:start";
const END = "/* ghoaxt:typography:end */";

export function typographyCss(t: Typography) {
  const dropCap = t.dropCapFloat
    ? `float: left; font-size: ${t.dropCapSize}em; line-height: 0.85; padding: 0.05em 0.1em 0 0;`
    : `float: none; font-size: ${t.dropCapSize}em; line-height: 1; padding: 0;`;
  return `${START} ${JSON.stringify(t)} */
.markdown-body { font-family: ${t.bodyFont}; font-size: ${t.fontSize}px; line-height: ${t.lineHeight}; }
${t.headingFont !== "inherit" ? `.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { font-family: ${t.headingFont}; }\n` : ""}.live-line.indented > p { text-indent: ${t.indent}em; }
.DropCap { ${dropCap} font-weight: ${t.dropCapWeight}; font-style: normal; font-family: ${t.dropCapFont}; ${t.dropCapColor ? `color: ${t.dropCapColor};` : ""} }
.live-line:has(.DropCap) { display: flow-root; }
.live-line.poetry-line { padding-left: ${t.poetryIndent}em; font-style: ${t.poetryItalic ? "italic" : "normal"}; }
.live-line.poetry-line > p { margin: 0; }
${END}`;
}

export function readTypography(css: string): Typography | null {
  const start = css.indexOf(START);
  if (start === -1) return null;
  const json = css.slice(start + START.length, css.indexOf("*/", start)).trim();
  try {
    return { ...defaultTypography, ...JSON.parse(json) };
  } catch {
    return null;
  }
}

export function withTypography(css: string, t: Typography) {
  const block = typographyCss(t);
  const start = css.indexOf(START);
  const end = css.indexOf(END);
  if (start !== -1 && end !== -1) return css.slice(0, start) + block + css.slice(end + END.length);
  return `${css.trimEnd()}\n\n${block}\n`;
}

// Workspaces saved before typography existed get the defaults without being rewritten.
export function ensureTypography(css: string) {
  return readTypography(css) ? css : withTypography(css, defaultTypography);
}
