import { useId } from "react";

type CoverProps = {
  title: string;
  subtitle?: string;
  author: string;
  seed: number;
  image: string | null;
  template?: string | null;
  palette?: number | null;
  width?: number;
};

type Palette = { name: string; bg: string; bg2: string; accent: string; ink: string };

// bg/bg2 are the background tones, accent the highlight, ink the text colour.
export const COVER_PALETTES: Palette[] = [
  { name: "Midnight", bg: "#0b1226", bg2: "#1e2a5a", accent: "#e5c07b", ink: "#f8f5ec" },
  { name: "Burgundy", bg: "#3b0a1a", bg2: "#7a1f3d", accent: "#f2d6a2", ink: "#fff7ea" },
  { name: "Forest", bg: "#0f2a1d", bg2: "#2f5d3a", accent: "#d9c28a", ink: "#f4efe0" },
  { name: "Charcoal", bg: "#15171c", bg2: "#2c3038", accent: "#ff7a3d", ink: "#f3f3f3" },
  { name: "Teal", bg: "#06323a", bg2: "#0f7380", accent: "#ff8a6b", ink: "#f2fbfb" },
  { name: "Plum", bg: "#2a1233", bg2: "#6a2c70", accent: "#f7a8c4", ink: "#fdf4fa" },
  { name: "Noir", bg: "#0a0a0a", bg2: "#232323", accent: "#d4af37", ink: "#fafafa" },
  { name: "Blood", bg: "#120000", bg2: "#3a0000", accent: "#e11d2e", ink: "#fafafa" },
  { name: "Parchment", bg: "#f3ead7", bg2: "#e4d3b0", accent: "#7a3b1d", ink: "#2a1d12" },
  { name: "Sky", bg: "#e8f1fb", bg2: "#bcd6f0", accent: "#1f3b6b", ink: "#14213d" },
  { name: "Sage", bg: "#e6ece1", bg2: "#b7c9b0", accent: "#3f5d45", ink: "#1d2b21" },
  { name: "Rose", bg: "#fbe9e7", bg2: "#f4c2c2", accent: "#8a2a3b", ink: "#3b1018" },
];

export const COVER_TEMPLATES = [
  { id: "classic", label: "Classic" },
  { id: "modern", label: "Modern" },
  { id: "minimal", label: "Minimal" },
  { id: "noir", label: "Noir" },
  { id: "fantasy", label: "Fantasy" },
  { id: "scifi", label: "Sci-fi" },
  { id: "romance", label: "Romance" },
  { id: "thriller", label: "Thriller" },
  { id: "literary", label: "Literary" },
  { id: "pattern", label: "Pattern" },
] as const;

export function templateFor(seed: number, template?: string | null) {
  return COVER_TEMPLATES.find((entry) => entry.id === template)?.id ?? COVER_TEMPLATES[Math.abs(seed) % COVER_TEMPLATES.length].id;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(text: string, max: number, maxLines = 5) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
  return kept;
}

// Largest size (up to base) at which the longest line still fits the box; factor is the average glyph width per point.
function fit(lines: string[], box: number, base: number, factor: number) {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  return Math.max(14, Math.min(base, box / (longest * factor)));
}

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const HEAVY = "Impact, 'Arial Narrow Bold', 'Helvetica Neue', sans-serif";

type TextProps = { lines: string[]; x: number; y: number; size: number; fill: string; family?: string; anchor?: "start" | "middle" | "end"; weight?: number | string; spacing?: number; italic?: boolean; lh?: number; opacity?: number; box?: number };

function Lines({ lines, x, y, size, fill, family = SERIF, anchor = "middle", weight = 700, spacing = 0, italic = false, lh = 1.15, opacity = 1, box }: TextProps) {
  if (box) {
    const longest = Math.max(1, ...lines.map((line) => line.length));
    size = Math.max(8, Math.min(size, (box - longest * spacing) / (longest * 0.72)));
  }
  return (
    <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontFamily={family} fontWeight={weight} letterSpacing={spacing} fontStyle={italic ? "italic" : "normal"} opacity={opacity}>
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 0 : size * lh}>{line}</tspan>
      ))}
    </text>
  );
}

// Top y so that a block of lines is centred on `middle`.
const centred = (middle: number, count: number, size: number, lh = 1.15) => middle - ((count - 1) * size * lh) / 2 + size * 0.35;

type Ctx = { title: string; subtitle: string; author: string; rand: () => number; p: Palette; uid: string };

function Classic({ title, subtitle, author, p, uid }: Ctx) {
  const lines = wrap(title.toUpperCase(), 12);
  const size = fit(lines, 210, 34, 0.78);
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.bg} /><stop offset="1" stopColor={p.bg2} /></linearGradient>
      </defs>
      <rect width="300" height="450" fill={`url(#${uid}-bg)`} />
      <rect x="16" y="16" width="268" height="418" fill="none" stroke={p.accent} strokeWidth="2" />
      <rect x="24" y="24" width="252" height="402" fill="none" stroke={p.accent} strokeWidth="0.8" />
      <g stroke={p.accent} strokeWidth="1.2" fill={p.accent}>
        <line x1="86" y1="92" x2="136" y2="92" />
        <line x1="164" y1="92" x2="214" y2="92" />
        <polygon points="150,84 158,92 150,100 142,92" />
      </g>
      <Lines lines={lines} x={150} y={centred(205, lines.length, size)} size={size} fill={p.ink} spacing={2} />
      {subtitle && <Lines lines={wrap(subtitle, 28, 2)} x={150} y={centred(205, lines.length, size) + lines.length * size * 1.15 + 14} size={14} fill={p.accent} italic weight={400} />}
      <line x1="100" y1="372" x2="200" y2="372" stroke={p.accent} strokeWidth="0.8" />
      <Lines lines={[author.toUpperCase()]} box={252} x={150} y={398} size={14} fill={p.ink} family={SERIF} weight={400} spacing={4} />
    </>
  );
}

function Modern({ title, subtitle, author, p }: Ctx) {
  const lines = wrap(title.toUpperCase(), 11);
  const size = fit(lines, 244, 46, 0.76);
  return (
    <>
      <rect width="300" height="450" fill={p.bg} />
      <rect width="300" height="300" fill={p.bg2} />
      <polygon points="0,300 300,228 300,300" fill={p.accent} />
      <Lines lines={lines} x={28} y={78} size={size} fill={p.ink} family={SANS} anchor="start" weight={800} lh={1.05} />
      <rect x="28" y={78 + lines.length * size * 1.05 + 4} width="56" height="5" fill={p.accent} />
      {subtitle && <Lines lines={wrap(subtitle, 30, 2)} x={28} y={338} size={13} fill={p.ink} family={SANS} anchor="start" weight={400} opacity={0.85} />}
      <Lines lines={[author.toUpperCase()]} box={252} x={28} y={410} size={15} fill={p.ink} family={SANS} anchor="start" weight={600} spacing={3} />
    </>
  );
}

function Minimal({ title, subtitle, author, p }: Ctx) {
  const lines = wrap(title, 14);
  const size = fit(lines, 220, 36, 0.52);
  const initial = (title.trim()[0] ?? "A").toUpperCase();
  return (
    <>
      <rect width="300" height="450" fill={p.bg} />
      <text x="150" y="380" fontSize="440" fontFamily={SERIF} textAnchor="middle" fill={p.accent} opacity="0.12">{initial}</text>
      <line x1="120" y1="118" x2="180" y2="118" stroke={p.ink} strokeWidth="1" />
      <Lines lines={lines} x={150} y={centred(200, lines.length, size)} size={size} fill={p.ink} weight={400} />
      {subtitle && <Lines lines={wrap(subtitle, 30, 2)} x={150} y={centred(200, lines.length, size) + lines.length * size * 1.15 + 6} size={13} fill={p.ink} italic weight={400} opacity={0.7} />}
      <line x1="120" y1="332" x2="180" y2="332" stroke={p.ink} strokeWidth="1" />
      <Lines lines={[author.toUpperCase()]} box={252} x={150} y={400} size={12} fill={p.ink} family={SANS} weight={500} spacing={6} />
    </>
  );
}

function Noir({ title, subtitle, author, p, uid }: Ctx) {
  const lines = wrap(title.toUpperCase(), 9);
  const size = fit(lines, 248, 62, 0.64);
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-bg`} cx="0.5" cy="0.35" r="0.8"><stop offset="0" stopColor={p.bg2} /><stop offset="1" stopColor={p.bg} /></radialGradient>
      </defs>
      <rect width="300" height="450" fill={`url(#${uid}-bg)`} />
      <g stroke={p.accent} strokeWidth="1" opacity="0.35">
        <line x1="-20" y1="420" x2="220" y2="-20" /><line x1="40" y1="470" x2="300" y2="-10" /><line x1="140" y1="480" x2="330" y2="110" />
      </g>
      <rect x="26" y={106 - size * 0.9} width="64" height="8" fill={p.accent} />
      <Lines lines={lines} x={26} y={106} size={size} fill={p.ink} family={HEAVY} anchor="start" weight={400} lh={1.0} spacing={1} />
      {subtitle && <Lines lines={wrap(subtitle, 28, 2)} x={26} y={106 + lines.length * size + 10} size={13} fill={p.ink} family={SANS} anchor="start" weight={400} opacity={0.75} />}
      <Lines lines={[author.toUpperCase()]} box={252} x={274} y={418} size={14} fill={p.accent} family={SANS} anchor="end" weight={600} spacing={5} />
    </>
  );
}

function Fantasy({ title, subtitle, author, rand, p, uid }: Ctx) {
  const lines = wrap(title, 13, 4);
  const size = fit(lines, 230, 34, 0.55);
  const stars = Array.from({ length: 46 }, (_, i) => <circle key={i} cx={rand() * 300} cy={rand() * 330} r={0.5 + rand() * 1.3} fill={p.ink} opacity={0.25 + rand() * 0.7} />);
  const ridge = (base: number, spread: number) => {
    const points = ["0,450"];
    for (let x = 0; x <= 300; x += 25) points.push(`${x},${base - rand() * spread}`);
    points.push("300,450");
    return points.join(" ");
  };
  const moonX = 90 + rand() * 120;
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.bg} /><stop offset="1" stopColor={p.bg2} /></linearGradient>
      </defs>
      <rect width="300" height="450" fill={`url(#${uid}-bg)`} />
      {stars}
      <circle cx={moonX} cy="262" r="34" fill={p.ink} opacity="0.92" />
      <circle cx={moonX + 12} cy="254" r="30" fill={p.bg2} opacity="0.55" />
      <polygon points={ridge(360, 70)} fill={p.bg} opacity="0.65" />
      <polygon points={ridge(395, 55)} fill={p.bg} />
      <Lines lines={lines} x={150} y={centred(88, lines.length, size)} size={size} fill={p.accent} weight={700} spacing={1} />
      {subtitle && <Lines lines={wrap(subtitle, 30, 2)} x={150} y={centred(88, lines.length, size) + lines.length * size * 1.15 + 6} size={13} fill={p.ink} italic weight={400} opacity={0.85} />}
      <Lines lines={[author.toUpperCase()]} box={252} x={150} y={430} size={14} fill={p.ink} weight={400} spacing={5} />
    </>
  );
}

function SciFi({ title, subtitle, author, rand, p, uid }: Ctx) {
  const lines = wrap(title.toUpperCase(), 14);
  const size = fit(lines, 240, 28, 0.86);
  const px = 120 + rand() * 60;
  const tilt = -10 - rand() * 18;
  const grid = Array.from({ length: 15 }, (_, i) => <line key={i} x1="0" y1={i * 30} x2="300" y2={i * 30} stroke={p.accent} strokeWidth="0.5" opacity="0.1" />);
  const stars = Array.from({ length: 30 }, (_, i) => <circle key={i} cx={rand() * 300} cy={rand() * 450} r={0.4 + rand() * 1.1} fill={p.ink} opacity={0.3 + rand() * 0.6} />);
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-bg`} cx="0.5" cy="0.7" r="0.9"><stop offset="0" stopColor={p.bg2} /><stop offset="1" stopColor={p.bg} /></radialGradient>
        <radialGradient id={`${uid}-planet`} cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor={p.accent} /><stop offset="1" stopColor={p.bg2} /></radialGradient>
      </defs>
      <rect width="300" height="450" fill={`url(#${uid}-bg)`} />
      {grid}
      {stars}
      <circle cx={px} cy="290" r="82" fill={`url(#${uid}-planet)`} />
      <ellipse cx={px} cy="290" rx="150" ry="28" fill="none" stroke={p.ink} strokeWidth="2" opacity="0.8" transform={`rotate(${tilt} ${px} 290)`} />
      <ellipse cx={px} cy="290" rx="190" ry="40" fill="none" stroke={p.accent} strokeWidth="1" opacity="0.5" transform={`rotate(${tilt} ${px} 290)`} />
      <Lines lines={lines} x={150} y={centred(76, lines.length, size)} size={size} fill={p.ink} family={SANS} weight={700} spacing={6} />
      {subtitle && <Lines lines={wrap(subtitle, 30, 2)} x={150} y={centred(76, lines.length, size) + lines.length * size * 1.15 + 6} size={11} fill={p.accent} family={SANS} weight={500} spacing={3} />}
      <Lines lines={[author.toUpperCase()]} box={252} x={150} y={430} size={12} fill={p.ink} family={SANS} weight={500} spacing={8} />
    </>
  );
}

function Romance({ title, subtitle, author, rand, p, uid }: Ctx) {
  const lines = wrap(title, 11);
  const size = fit(lines, 232, 44, 0.5);
  const bokeh = Array.from({ length: 11 }, (_, i) => <circle key={i} cx={rand() * 300} cy={rand() * 450} r={18 + rand() * 56} fill={rand() < 0.5 ? p.accent : p.ink} opacity={0.12 + rand() * 0.22} />);
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={p.bg} /><stop offset="1" stopColor={p.bg2} /></linearGradient>
      </defs>
      <rect width="300" height="450" fill={`url(#${uid}-bg)`} />
      {bokeh}
      <Lines lines={lines} x={150} y={centred(205, lines.length, size, 1.1)} size={size} fill={p.ink} italic weight={400} lh={1.1} />
      {subtitle && <Lines lines={wrap(subtitle, 28, 2)} x={150} y={centred(205, lines.length, size, 1.1) + lines.length * size * 1.1 + 6} size={14} fill={p.ink} italic weight={400} opacity={0.85} />}
      <Lines lines={[author]} box={252} x={150} y={410} size={18} fill={p.ink} italic weight={400} spacing={2} />
    </>
  );
}

function Thriller({ title, subtitle, author, rand, p }: Ctx) {
  const lines = wrap(title.toUpperCase(), 8);
  const size = fit(lines, 250, 58, 0.7);
  const bars = Array.from({ length: 6 }, (_, i) => <rect key={i} x={-60 + i * 70 + rand() * 10} y="-80" width={22 + rand() * 30} height="640" fill={p.bg2} opacity="0.6" />);
  return (
    <>
      <rect width="300" height="450" fill={p.bg} />
      <g transform="rotate(-18 150 225)">{bars}</g>
      <rect y="318" width="300" height="12" fill={p.accent} />
      <Lines lines={lines} x={24} y={96} size={size} fill={p.ink} family={HEAVY} anchor="start" weight={400} lh={1.0} spacing={1} />
      {subtitle && <Lines lines={wrap(subtitle, 30, 2)} x={24} y={352} size={13} fill={p.ink} family={SANS} anchor="start" weight={500} opacity={0.85} />}
      <Lines lines={[author.toUpperCase()]} box={252} x={24} y={420} size={15} fill={p.accent} family={SANS} anchor="start" weight={700} spacing={6} />
    </>
  );
}

function Literary({ title, subtitle, author, rand, p }: Ctx) {
  const lines = wrap(title, 14);
  const size = fit(lines, 230, 34, 0.6);
  const cx = 150 + rand() * 60;
  return (
    <>
      <rect width="300" height="450" fill={p.bg} />
      <circle cx={cx} cy="132" r="84" fill={p.accent} />
      <rect x="26" y="70" width="120" height="120" fill={p.bg2} />
      <path d="M26 190 A60 60 0 0 1 146 190 Z" fill={p.ink} opacity="0.9" />
      <polygon points={`${cx - 70},232 ${cx + 70},232 ${cx},170`} fill={p.bg2} opacity="0.75" />
      <line x1="26" y1="258" x2="274" y2="258" stroke={p.ink} strokeWidth="1.2" />
      <Lines lines={lines} x={26} y={298} size={size} fill={p.ink} anchor="start" weight={700} lh={1.1} />
      {subtitle && <Lines lines={wrap(subtitle, 32, 2)} x={26} y={298 + lines.length * size * 1.1 + 4} size={13} fill={p.ink} italic weight={400} anchor="start" opacity={0.75} />}
      <Lines lines={[author.toUpperCase()]} box={252} x={26} y={422} size={12} fill={p.ink} family={SANS} anchor="start" weight={600} spacing={5} />
    </>
  );
}

function Pattern({ title, subtitle, author, p, uid }: Ctx) {
  const lines = wrap(title.toUpperCase(), 12, 4);
  const size = fit(lines, 200, 30, 0.76);
  return (
    <>
      <defs>
        <pattern id={`${uid}-tile`} width="30" height="30" patternUnits="userSpaceOnUse"><path d="M15 2 L28 15 L15 28 L2 15 Z" fill="none" stroke={p.accent} strokeWidth="1.4" opacity="0.55" /></pattern>
      </defs>
      <rect width="300" height="450" fill={p.bg} />
      <rect width="300" height="450" fill={`url(#${uid}-tile)`} />
      <rect x="30" y="120" width="240" height="190" fill={p.bg2} stroke={p.accent} strokeWidth="2" />
      <rect x="38" y="128" width="224" height="174" fill="none" stroke={p.accent} strokeWidth="0.8" />
      <Lines lines={lines} x={150} y={centred(205, lines.length, size)} size={size} fill={p.ink} spacing={2} />
      {subtitle && <Lines lines={wrap(subtitle, 26, 1)} x={150} y={centred(205, lines.length, size) + lines.length * size * 1.15 + 6} size={11} fill={p.accent} italic weight={400} />}
      <rect y="372" width="300" height="78" fill={p.accent} />
      <Lines lines={[author.toUpperCase()]} box={252} x={150} y={418} size={15} fill={p.bg} family={SANS} weight={700} spacing={4} />
    </>
  );
}

const RENDERERS: Record<string, (ctx: Ctx) => JSX.Element> = {
  classic: Classic, modern: Modern, minimal: Minimal, noir: Noir, fantasy: Fantasy, scifi: SciFi, romance: Romance, thriller: Thriller, literary: Literary, pattern: Pattern,
};

export function paletteFor(seed: number, palette?: number | null) {
  if (palette !== null && palette !== undefined && COVER_PALETTES[palette]) return palette;
  return Math.floor(rng(seed + 7)() * COVER_PALETTES.length);
}

// The same template, palette and seed always give the same cover.
function NovelCover({ title, subtitle = "", author, seed, image, template, palette, width = 160 }: CoverProps) {
  const uid = useId().replace(/:/g, "");
  const height = (width * 3) / 2;

  if (image) {
    return <img src={image} alt={title} style={{ width, height, objectFit: "cover", display: "block", borderRadius: 8 }} />;
  }

  const Render = RENDERERS[templateFor(seed, template)];
  const ctx: Ctx = { title: title || "Untitled", subtitle, author, rand: rng(seed), p: COVER_PALETTES[paletteFor(seed, palette)], uid };
  return (
    <svg viewBox="0 0 300 450" width={width} height={height} style={{ display: "block", borderRadius: 8 }} role="img" aria-label={title}>
      <Render {...ctx} />
    </svg>
  );
}

// The native dialog (via the backend) gives one "images" filter; the browser's accept filter didn't list images here.
export async function pickCoverImage(apiFetch: <T>(path: string, options?: RequestInit) => Promise<T>) {
  const { dataUrl } = await apiFetch<{ dataUrl: string | null }>("/api/pick-image", { method: "POST" });
  if (!dataUrl) return null;

  // Downscale so the data URL stored in .novel.json stays small.
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, 600 / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default NovelCover;
