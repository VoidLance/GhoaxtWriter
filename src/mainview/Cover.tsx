type CoverProps = {
  title: string;
  subtitle?: string;
  author: string;
  seed: number;
  image: string | null;
  width?: number;
};

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

function wrapText(text: string, max: number) {
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
  return lines.slice(0, 5);
}

// Same seed, title and author always produce the same cover.
function NovelCover({ title, subtitle, author, seed, image, width = 160 }: CoverProps) {
  const height = (width * 3) / 2;

  if (image) {
    return <img src={image} alt={title} style={{ width, height, objectFit: "cover", display: "block", borderRadius: 8 }} />;
  }

  const random = rng(seed);
  const hue = Math.floor(random() * 360);
  const hue2 = (hue + 30 + Math.floor(random() * 90)) % 360;
  const bgTop = `hsl(${hue}, 45%, ${14 + random() * 8}%)`;
  const bgBottom = `hsl(${hue2}, 50%, ${22 + random() * 10}%)`;

  const shapes = Array.from({ length: 4 + Math.floor(random() * 3) }, (_, index) => {
    const kind = Math.floor(random() * 3);
    const x = random() * 300;
    const y = random() * 450;
    const size = 40 + random() * 140;
    const fill = `hsl(${random() < 0.5 ? hue : hue2}, ${50 + random() * 30}%, ${40 + random() * 30}%)`;
    const opacity = 0.12 + random() * 0.25;
    if (kind === 0) return <circle key={index} cx={x} cy={y} r={size / 2} fill={fill} opacity={opacity} />;
    if (kind === 1) return <rect key={index} x={x - size / 2} y={y - size / 2} width={size} height={size * (0.5 + random())} fill={fill} opacity={opacity} transform={`rotate(${Math.floor(random() * 90)} ${x} ${y})`} />;
    return <polygon key={index} points={`${x},${y - size / 2} ${x + size / 2},${y + size / 2} ${x - size / 2},${y + size / 2}`} fill={fill} opacity={opacity} />;
  });

  const titleLines = wrapText(title, 12);
  const fontSize = titleLines.some((line) => line.length > 10) ? 34 : 40;
  const gradientId = `cover-${seed}`;

  return (
    <svg viewBox="0 0 300 450" width={width} height={height} style={{ display: "block", borderRadius: 8 }} role="img" aria-label={title}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bgTop} />
          <stop offset="1" stopColor={bgBottom} />
        </linearGradient>
      </defs>
      <rect width="300" height="450" fill={`url(#${gradientId})`} />
      {shapes}
      <rect x="24" y="24" width="252" height="402" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <g fill="#f8fafc" textAnchor="middle" fontFamily="Georgia, serif">
        {titleLines.map((line, index) => (
          <text key={index} x="150" y={110 + index * (fontSize + 6)} fontSize={fontSize} fontWeight="700">{line}</text>
        ))}
        {subtitle && <text x="150" y={120 + titleLines.length * (fontSize + 6)} fontSize="16" fontStyle="italic" opacity="0.85">{subtitle.slice(0, 32)}</text>}
        <text x="150" y="395" fontSize="20" letterSpacing="3" opacity="0.9">{author.toUpperCase()}</text>
      </g>
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
