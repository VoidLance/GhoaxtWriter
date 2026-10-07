import { BrowserWindow, Updater, Utils } from "electrobun/main";
import http, { createServer } from "node:http";
import https from "node:https";
import { strFromU8, unzipSync, unzlibSync } from "fflate";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const API_PORT = 4310;
const SETTINGS_DIR = ".ghoaxtwriter";
const SETTINGS_FILE = "settings.json";

const DEFAULT_APP_CSS = `
:root {
  color-scheme: dark;
  --bg: #0f172a;
  --bg-soft: #111827;
  --panel: rgba(17, 24, 39, 0.9);
  --panel-strong: #111827;
  --border: rgba(148, 163, 184, 0.18);
  --text: #e5e7eb;
  --muted: #94a3b8;
  --accent: #fbbf24;
  --accent-strong: #f59e0b;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Inter", "Segoe UI", sans-serif;
}

button, input, textarea {
  font: inherit;
}
`;

const DEFAULT_MARKDOWN_CSS = `
.markdown-body {
  font-family: "Georgia", "Iowan Old Style", serif;
  line-height: 1.7;
  color: #e5e7eb;
  letter-spacing: 0.01em;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin: 1.3em 0 0.6em;
  line-height: 1.2;
  font-weight: 700;
  color: #f8fafc;
}

.markdown-body h1 { font-size: 2.2rem; }
.markdown-body h2 { font-size: 1.8rem; }
.markdown-body h3 { font-size: 1.45rem; }
.markdown-body h4 { font-size: 1.2rem; }
.markdown-body h5 { font-size: 1.05rem; }
.markdown-body h6 { font-size: 0.95rem; }

.markdown-body p,
.markdown-body ul,
.markdown-body ol,
.markdown-body blockquote,
.markdown-body pre,
.markdown-body table {
  margin: 0.9em 0;
}

.markdown-body ul,
.markdown-body ol {
  padding-left: 1.5rem;
}

.markdown-body li {
  margin: 0.25rem 0;
}

.markdown-body a {
  color: #fbbf24;
}

.markdown-body em,
.markdown-body i,
.markdown-body span {
  font-style: italic;
  color: #f8fafc;
}

.markdown-body strong,
.markdown-body b {
  font-weight: 700;
  color: #ffffff;
}

.markdown-body code {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  padding: 0.12rem 0.38rem;
  font-family: "JetBrains Mono", "SFMono-Regular", monospace;
}

.markdown-body pre {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 10px;
  padding: 1rem;
  overflow-x: auto;
}

.markdown-body blockquote {
  border-left: 3px solid #fbbf24;
  padding-left: 1rem;
  color: #cbd5e1;
}
`;

const state = {
	workspaceRoot: null as string | null,
};

const NOVEL_FILE = ".novel.json";
// A folder's note is <Folder>/<Folder>.md; it is hidden from the tree. Elements and Research are novel-level folders used by their own tabs.
const folderNoteName = (dir: string) => `${basename(dir)}.md`;
const TAB_FOLDERS = ["Elements", "Research"];

function safeName(name: string) {
	return name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function readNovel(dir: string) {
	try {
		return JSON.parse(readFileSync(join(dir, NOVEL_FILE), "utf8"));
	} catch {
		return null;
	}
}

function listDirs(dir: string) {
	return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("."));
}

function readShelf(dir: string) {
	try {
		return JSON.parse(readFileSync(join(dir, ".shelf.json"), "utf8"));
	} catch {
		return null;
	}
}

// Layout: workspace / [shelf /] novel (has .novel.json) / chapters / scenes.md
function scanLibrary(root: string) {
	const novels: Array<{ path: string; shelf: string | null; meta: any }> = [];
	const shelves: Array<{ folder: string; name: string; author: string }> = [];
	for (const entry of listDirs(root)) {
		const full = join(root, entry.name);
		const meta = readNovel(full);
		if (meta) {
			novels.push({ path: full, shelf: null, meta });
			continue;
		}
		const shelfMeta = readShelf(full);
		const inside: Array<{ path: string; shelf: string | null; meta: any }> = [];
		for (const child of listDirs(full)) {
			const childPath = join(full, child.name);
			const childMeta = readNovel(childPath);
			if (childMeta) inside.push({ path: childPath, shelf: entry.name, meta: childMeta });
		}
		novels.push(...inside);
		// Shelves made before shelf ownership existed take their first novel's author.
		shelves.push({
			folder: entry.name,
			name: shelfMeta?.name ?? entry.name,
			author: shelfMeta?.author ?? String(inside[0]?.meta.author ?? ""),
		});
	}
	return { novels, shelves };
}

function authorsPath(root: string) {
	ensureWorkspaceSettings(root);
	return join(root, SETTINGS_DIR, "authors.json");
}

function readAuthors(root: string): string[] {
	let stored: string[] = [];
	try {
		stored = JSON.parse(readFileSync(authorsPath(root), "utf8")).authors ?? [];
	} catch {
		// No authors saved yet.
	}
	const fromNovels = scanLibrary(root).novels.map((n) => String(n.meta.author ?? "")).filter(Boolean);
	return Array.from(new Set([...stored, ...fromNovels])).sort((a, b) => a.localeCompare(b));
}

const ELEMENTS_DIR = "Elements";
const RESEARCH_DIR = "Research";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
	png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", avif: "image/avif",
	svg: "image/svg+xml", pdf: "application/pdf", txt: "text/plain", md: "text/plain", csv: "text/plain", json: "text/plain",
};
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"];
const TEXT_EXTS = ["txt", "md", "csv", "json"];
const SECTION_ABOUT = "About.md";
const SECTION_IMAGE = "Section image";

class HttpError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}

function novelDirFrom(root: string, raw: string) {
	const dir = resolve(raw);
	return isInsideRoot(root, dir) && readNovel(dir) ? dir : null;
}

function extOf(name: string) {
	const i = name.lastIndexOf(".");
	return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function stem(name: string) {
	const i = name.lastIndexOf(".");
	return i > 0 ? name.slice(0, i) : name;
}

function uniqueName(dir: string, name: string) {
	if (!existsSync(join(dir, name))) return name;
	const ext = extOf(name);
	const base = stem(name);
	for (let n = 2; ; n++) {
		const candidate = `${base} (${n})${ext ? `.${ext}` : ""}`;
		if (!existsSync(join(dir, candidate))) return candidate;
	}
}

function parseFrontmatter(text: string) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	const meta: Record<string, string> = {};
	if (!match) return { meta, body: text };
	for (const line of match[1].split(/\r?\n/)) {
		const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
		if (!pair) continue;
		let value = pair[2].trim();
		if (value.startsWith('"')) {
			try {
				value = JSON.parse(value);
			} catch {
				// Keep the raw text.
			}
		}
		meta[pair[1]] = value;
	}
	return { meta, body: text.slice(match[0].length).replace(/^\r?\n/, "") };
}

function withFrontmatter(meta: Record<string, string | undefined>, body: string) {
	const lines = Object.entries(meta).filter(([, value]) => value).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
	return lines.length ? `---\n${lines.join("\n")}\n---\n\n${body}` : body;
}

function decodeImage(dataUrl: string) {
	const match = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(dataUrl);
	if (!match) throw new HttpError(400, "Unsupported image");
	return { ext: match[1] === "jpeg" ? "jpg" : match[1], data: Buffer.from(match[2], "base64") };
}

function plainExcerpt(text: string, max = 220) {
	return text
		.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
		.replace(/<[^>]+>/g, "")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/^[#>\-*+\s]+/gm, "")
		.replace(/[*_`~]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, max);
}

function describe(file: string) {
	try {
		const text = readFileSync(file, "utf8");
		return { excerpt: plainExcerpt(text), words: (text.match(/\S+/g) ?? []).length };
	} catch {
		return { excerpt: "", words: 0 };
	}
}

function collectExcerpts(dir: string, out: Record<string, { excerpt: string; words: number }>) {
	for (const entry of sortedEntries(dir)) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out[full] = describe(join(full, folderNoteName(full)));
			collectExcerpts(full, out);
		} else if (entry.name.toLowerCase().endsWith(".md")) {
			out[full] = describe(full);
		}
	}
}

function decodeEntities(text: string) {
	return text
		.replace(/&nbsp;/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;|&#39;/g, "'")
		.replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&amp;/g, "&");
}

// ---- Short text excerpts of imported documents, for Research previews ----

const DOCUMENT_EXTS = ["docx", "odt", "pptx", "rtf", "epub", "pdf"];
const documentTextCache = new Map<string, string>();

function xmlParagraphsToText(xml: string, paragraphEnd: RegExp) {
	return decodeEntities(xml.replace(paragraphEnd, "\n").replace(/<[^>]+>/g, ""));
}

function readZipEntries(file: string, pick: (name: string) => boolean) {
	return unzipSync(new Uint8Array(readFileSync(file)), { filter: (entry) => pick(entry.name) });
}

const RTF_SKIPPED_GROUPS = new Set(["fonttbl", "colortbl", "stylesheet", "info", "listtable", "listoverridetable", "rsidtbl", "generator", "pict", "header", "footer", "themedata", "colorschememapping", "datastore", "latentstyles", "xmlnstbl", "fldinst", "private"]);

function rtfToText(raw: string) {
	let out = "";
	let skipping = false;
	const stack: boolean[] = [];
	for (let i = 0; i < raw.length; ) {
		const char = raw[i];
		if (char === "{") {
			stack.push(skipping);
			i++;
			const destination = /^\\(\*)?\\?([a-z]+)?/.exec(raw.slice(i, i + 40));
			if (destination?.[1] || (destination?.[2] && RTF_SKIPPED_GROUPS.has(destination[2]))) skipping = true;
		} else if (char === "}") {
			skipping = stack.pop() ?? false;
			i++;
		} else if (char === "\\") {
			const next = raw[i + 1];
			if (next === "'") {
				if (!skipping) out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 4), 16));
				i += 4;
			} else if (next !== undefined && /[a-z]/i.test(next)) {
				const word = /^\\([a-z]+)(-?\d+)? ?/i.exec(raw.slice(i, i + 40));
				i += word ? word[0].length : 1;
				if (!skipping && word) {
					if (word[1] === "par" || word[1] === "line") out += "\n";
					else if (word[1] === "tab") out += " ";
					else if (word[1] === "u" && word[2]) {
						out += String.fromCharCode(Number(word[2]) < 0 ? Number(word[2]) + 65536 : Number(word[2]));
						i++; // Skip the ANSI fallback character.
					}
				}
			} else {
				if (!skipping && next !== undefined && "\\{}".includes(next)) out += next;
				else if (!skipping && next === "~") out += " ";
				i += 2;
			}
		} else {
			if (!skipping && char !== "\r" && char !== "\n") out += char;
			i++;
		}
	}
	return out;
}

function pdfContentToText(content: string) {
	const unescape = (value: string) =>
		value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_match, code: string) => {
			if (/^[0-7]+$/.test(code)) return String.fromCharCode(parseInt(code, 8));
			return ({ n: "\n", r: "", t: " ", b: "", f: "", "(": "(", ")": ")", "\\": "\\" } as Record<string, string>)[code] ?? "";
		});
	let out = "";
	const token = /\[((?:\\.|[^\]\\])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")|\b(T\*|ET|Td|TD|Tm)\b/g;
	for (const match of content.matchAll(token)) {
		if (match[1] !== undefined) {
			for (const part of match[1].matchAll(/\(((?:\\.|[^\\)])*)\)|(-?\d+(?:\.\d+)?)/g)) {
				if (part[1] !== undefined) out += unescape(part[1]);
				else if (Number(part[2]) < -200) out += " ";
			}
		} else if (match[2] !== undefined) {
			out += `${unescape(match[2])} `;
		} else {
			out += match[3] === "ET" || match[3] === "T*" ? "\n" : " ";
		}
	}
	return out;
}

// Best effort: only PDFs whose text is stored as plain strings give a readable excerpt.
function pdfToText(data: Buffer) {
	const raw = data.toString("latin1");
	let out = "";
	let pos = 0;
	while (out.length < 4000 && (pos = raw.indexOf("stream", pos)) !== -1) {
		if (raw.slice(pos - 3, pos) === "end") {
			pos += 6;
			continue;
		}
		let start = pos + 6;
		if (raw[start] === "\r") start++;
		if (raw[start] === "\n") start++;
		const end = raw.indexOf("endstream", start);
		if (end === -1) break;
		const dict = raw.slice(Math.max(0, raw.lastIndexOf("<<", pos)), pos);
		pos = end + 9;
		let bytes: Uint8Array = data.subarray(start, end);
		if (/FlateDecode/.test(dict)) {
			try {
				bytes = unzlibSync(bytes);
			} catch {
				continue;
			}
		} else if (/\/Filter/.test(dict)) {
			continue;
		}
		const content = Buffer.from(bytes).toString("latin1");
		if (/\bBT\b/.test(content)) out += `${pdfContentToText(content)}\n`;
	}
	const printable = (out.match(/[\x20-\x7e\u00a0-\uffff\n]/g) ?? []).length;
	return out.length > 0 && printable / out.length >= 0.9 && /[A-Za-z]{3,}/.test(out) ? out : "";
}

function extractDocumentText(file: string, ext: string) {
	switch (ext) {
		case "docx":
			return xmlParagraphsToText(strFromU8(readZipEntries(file, (name) => name === "word/document.xml")["word/document.xml"] ?? new Uint8Array()).replace(/<w:tab\/>/g, " ").replace(/<w:br[^>]*\/>/g, "\n"), /<\/w:p>/g);
		case "odt":
			return xmlParagraphsToText(strFromU8(readZipEntries(file, (name) => name === "content.xml")["content.xml"] ?? new Uint8Array()).replace(/<text:tab\/>|<text:s\/>/g, " "), /<\/text:[ph]>/g);
		case "pptx": {
			const slides = readZipEntries(file, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
			return Object.keys(slides)
				.sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]))
				.slice(0, 5)
				.map((name) => xmlParagraphsToText(strFromU8(slides[name]), /<\/a:p>/g))
				.join("\n");
		}
		case "epub": {
			const pages = readZipEntries(file, (name) => /\.(xhtml|html|htm)$/i.test(name));
			let out = "";
			for (const name of Object.keys(pages).sort()) {
				const text = decodeEntities(strFromU8(pages[name]).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|div|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
				if (text.length > 200) out += `${text}\n`;
				if (out.length > 1500) break;
			}
			return out;
		}
		case "rtf":
			return rtfToText(readFileSync(file, "latin1"));
		case "pdf":
			return pdfToText(readFileSync(file));
		default:
			return "";
	}
}

function documentText(file: string, ext: string, mtime: number, size: number) {
	const isText = TEXT_EXTS.includes(ext);
	if (!isText && !DOCUMENT_EXTS.includes(ext)) return undefined;
	const key = `${file}:${mtime}`;
	let text = documentTextCache.get(key);
	if (text === undefined) {
		try {
			text = isText ? readFileSync(file, "utf8").slice(0, 4000) : size > 40 * 1024 * 1024 ? "" : extractDocumentText(file, ext);
		} catch {
			text = "";
		}
		text = text.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, 1500);
		documentTextCache.set(key, text);
	}
	return text || undefined;
}

type TagAttributes = Record<string, string>;

// Parses each tag on its own so one pass stays linear on large pages.
function parseTags(html: string, tag: string) {
	const tags: TagAttributes[] = [];
	for (const match of html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))) {
		const attributes: TagAttributes = {};
		for (const pair of match[0].matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attributes[pair[1].toLowerCase()] = pair[2] ?? pair[3] ?? "";
		tags.push(attributes);
	}
	return tags;
}

function metaContent(metas: TagAttributes[], names: string[]) {
	for (const name of names) {
		const found = metas.find((meta) => meta.content?.trim() && (meta.property?.toLowerCase() === name || meta.name?.toLowerCase() === name));
		if (found) return decodeEntities(found.content).trim();
	}
	return "";
}

function linkHref(links: TagAttributes[], rels: string[]) {
	for (const rel of rels) {
		const found = links.find((link) => link.href?.trim() && link.rel?.toLowerCase().split(/\s+/).includes(rel));
		if (found) return decodeEntities(found.href).trim();
	}
	return "";
}

function htmlToPage(html: string) {
	const headEnd = html.search(/<\/head>/i);
	const head = html.slice(0, headEnd > 0 ? headEnd : 300000);
	const metas = parseTags(head, "meta");
	const links = parseTags(head, "link");
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "";
	const text = decodeEntities(
		html
			.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
			.replace(/<[^>]+>/g, " "),
	)
		.replace(/\s+/g, " ")
		.trim();
	return {
		title: decodeEntities(metaContent(metas, ["og:title", "twitter:title"]) || title).replace(/\s+/g, " ").trim(),
		description: metaContent(metas, ["og:description", "twitter:description", "description"]),
		// Same order link unfurlers like Discord use: Open Graph, then Twitter cards, then plain hints.
		image: metaContent(metas, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]) || linkHref(links, ["image_src", "apple-touch-icon", "icon"]),
		text: text.slice(0, 20000),
	};
}

// The app's fetch can't verify TLS certificates or reuse connections reliably, so requests go through node:https with the system CA bundle.
const CA_BUNDLES = ["/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt", "/etc/ssl/ca-bundle.pem", "/etc/ssl/cert.pem"];
let systemCa: string | null | undefined;

function loadSystemCa() {
	if (systemCa === undefined) {
		const found = CA_BUNDLES.find((path) => existsSync(path));
		systemCa = found ? readFileSync(found, "utf8") : null;
	}
	return systemCa ?? undefined;
}

// Sites serve link previews to the bots of chat apps, so introduce ourselves as one.
const PREVIEW_USER_AGENT = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";

function httpGet(rawUrl: string, options: { maxBytes: number; redirects?: number; timeoutMs?: number }): Promise<{ status: number; type: string; url: URL; body: Buffer }> {
	return new Promise((resolvePromise, reject) => {
		const target = new URL(rawUrl);
		const secure = target.protocol === "https:";
		const client = secure ? https : http;
		const request = client.get(
			target,
			{
				headers: { "User-Agent": PREVIEW_USER_AGENT, "Accept-Encoding": "identity", Accept: "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.8", "Accept-Language": "en" },
				...(secure ? { ca: loadSystemCa() } : {}),
			},
			(response) => {
				const status = response.statusCode ?? 0;
				const location = response.headers.location;
				if ([301, 302, 303, 307, 308].includes(status) && location) {
					response.resume();
					if ((options.redirects ?? 5) <= 0) reject(new Error("Too many redirects"));
					else resolvePromise(httpGet(new URL(location, target).toString(), { ...options, redirects: (options.redirects ?? 5) - 1 }));
					return;
				}
				const encoding = String(response.headers["content-encoding"] ?? "identity").toLowerCase();
				if (encoding !== "identity") {
					response.resume();
					reject(new Error(`The site sent a ${encoding}-compressed response`));
					return;
				}
				const chunks: Buffer[] = [];
				let size = 0;
				response.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > options.maxBytes) {
						request.destroy(new Error("Response too large"));
						return;
					}
					chunks.push(Buffer.from(chunk));
				});
				response.on("end", () => resolvePromise({ status, type: String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase(), url: target, body: Buffer.concat(chunks) }));
				response.on("error", reject);
			},
		);
		const timer = setTimeout(() => request.destroy(new Error("Timed out")), options.timeoutMs ?? 20000);
		request.on("error", reject);
		request.on("close", () => clearTimeout(timer));
	});
}

function imageExtFor(type: string, url: URL, body: Buffer) {
	const fromType = Object.entries(MIME_BY_EXT).find(([key, mime]) => mime === type && IMAGE_EXTS.includes(key))?.[0];
	if (fromType) return fromType;
	const head = body.subarray(0, 12);
	if (head[0] === 0x89 && head[1] === 0x50) return "png";
	if (head[0] === 0xff && head[1] === 0xd8) return "jpg";
	if (head.subarray(0, 3).toString("latin1") === "GIF") return "gif";
	if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
	const fromUrl = extOf(url.pathname);
	return IMAGE_EXTS.includes(fromUrl) ? fromUrl : null;
}

async function downloadPreview(imageSrc: string, pageUrl: URL, dir: string, baseName: string) {
	try {
		const imageUrl = new URL(imageSrc, pageUrl);
		if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") return undefined;
		const image = await httpGet(imageUrl.toString(), { maxBytes: 8 * 1024 * 1024, timeoutMs: 15000 });
		const ext = image.status === 200 ? imageExtFor(image.type, imageUrl, image.body) : null;
		if (!ext) return undefined;
		for (const file of readdirSync(dir)) {
			if (file.startsWith(`${baseName}.preview.`)) rmSync(join(dir, file), { force: true });
		}
		const name = `${baseName}.preview.${ext}`;
		writeFileSync(join(dir, name), image.body);
		return name;
	} catch {
		// A missing preview image isn't worth failing the link.
		return undefined;
	}
}

// ---- Elements: Elements/<Name>.md with frontmatter, plus an optional image beside it ----

function readElements(novelDir: string) {
	const dir = join(novelDir, ELEMENTS_DIR);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((file) => file.toLowerCase().endsWith(".md"))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		.map((file) => {
			const { meta, body } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
			const imagePath = meta.image ? join(dir, meta.image) : "";
			const hasImage = !!meta.image && existsSync(imagePath);
			return {
				id: stem(file),
				name: stem(file),
				type: meta.type || "Other",
				notes: body,
				image: hasImage ? `${ELEMENTS_DIR}/${meta.image}` : null,
				imageVersion: hasImage ? statSync(imagePath).mtimeMs : 0,
			};
		});
}

function saveElement(novelDir: string, payload: any) {
	const name = safeName(String(payload.name ?? ""));
	if (!name) throw new HttpError(400, "Name required");
	const previous = payload.previousName ? safeName(String(payload.previousName)) : "";
	const dir = join(novelDir, ELEMENTS_DIR);
	mkdirSync(dir, { recursive: true });

	const oldPath = join(dir, `${previous || name}.md`);
	const existing = existsSync(oldPath) ? parseFrontmatter(readFileSync(oldPath, "utf8")).meta : {};
	let imageFile: string | undefined = existing.image && existsSync(join(dir, existing.image)) ? existing.image : undefined;

	if (previous && previous !== name) {
		if (existsSync(join(dir, `${name}.md`))) throw new HttpError(409, "An element with that name already exists");
		renameSync(oldPath, join(dir, `${name}.md`));
		if (imageFile) {
			const renamed = `${name}.${extOf(imageFile)}`;
			renameSync(join(dir, imageFile), join(dir, renamed));
			imageFile = renamed;
		}
	} else if (!previous && existsSync(oldPath)) {
		throw new HttpError(409, "An element with that name already exists");
	}

	if (payload.image === null && imageFile) {
		rmSync(join(dir, imageFile), { force: true });
		imageFile = undefined;
	} else if (typeof payload.image === "string") {
		const { ext, data } = decodeImage(payload.image);
		if (imageFile) rmSync(join(dir, imageFile), { force: true });
		imageFile = `${name}.${ext}`;
		writeFileSync(join(dir, imageFile), data);
	}

	writeFileSync(join(dir, `${name}.md`), withFrontmatter({ type: String(payload.type ?? "Other"), image: imageFile }, String(payload.notes ?? "")), "utf8");
	return readElements(novelDir).find((element) => element.name === name);
}

function deleteElement(novelDir: string, rawName: string) {
	const dir = join(novelDir, ELEMENTS_DIR);
	const file = join(dir, `${safeName(rawName)}.md`);
	if (!existsSync(file)) return;
	const { meta } = parseFrontmatter(readFileSync(file, "utf8"));
	if (meta.image) rmSync(join(dir, basename(meta.image)), { force: true });
	rmSync(file, { force: true });
}

// ---- Research: Research/[Section/]<Title>.md or the file itself; sections are plain folders ----

type ResearchEntry = {
	id: string;
	kind: "note" | "link" | "image" | "document";
	title: string;
	section: string | null;
	description: string;
	url?: string;
	text?: string;
	file?: string;
	preview: string | null;
	version: number;
	size: number;
};

function researchRoot(novelDir: string) {
	return join(novelDir, RESEARCH_DIR);
}

function scanResearchDir(dir: string, section: string | null, items: ResearchEntry[]) {
	const files = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && !entry.name.startsWith("."));
	const present = new Set(files.map((entry) => entry.name));
	const prefix = `${RESEARCH_DIR}/${section ? `${section}/` : ""}`;

	for (const entry of files) {
		const name = entry.name;
		if (section !== null && (name === SECTION_ABOUT || stem(name) === SECTION_IMAGE)) continue;
		if (/\.preview\.[a-z0-9]+$/i.test(name)) continue;
		const full = join(dir, name);
		const info = statSync(full);

		if (extOf(name) === "md") {
			const base = stem(name);
			if (extOf(base) && present.has(base)) continue; // Sidecar description of another file.
			const { meta, body } = parseFrontmatter(readFileSync(full, "utf8"));
			const preview = meta.preview && present.has(meta.preview) ? `${prefix}${meta.preview}` : null;
			items.push({ id: `${prefix}${name}`, kind: meta.url ? "link" : "note", title: base, section, description: meta.description ?? "", url: meta.url, text: body.slice(0, 20000), preview, version: info.mtimeMs, size: info.size });
			continue;
		}

		const ext = extOf(name);
		const sidecar = present.has(`${name}.md`) ? readFileSync(join(dir, `${name}.md`), "utf8").trim() : "";
		items.push({
			id: `${prefix}${name}`,
			kind: IMAGE_EXTS.includes(ext) ? "image" : "document",
			title: stem(name),
			section,
			description: sidecar,
			file: `${prefix}${name}`,
			text: documentText(full, ext, info.mtimeMs, info.size),
			preview: null,
			version: info.mtimeMs,
			size: info.size,
		});
	}
}

function readResearch(novelDir: string) {
	const root = researchRoot(novelDir);
	const items: ResearchEntry[] = [];
	const sections: Array<{ name: string; description: string; image: string | null; version: number }> = [];
	if (!existsSync(root)) return { sections, items };

	scanResearchDir(root, null, items);
	for (const folder of listDirs(root)) {
		const dir = join(root, folder.name);
		const about = existsSync(join(dir, SECTION_ABOUT)) ? parseFrontmatter(readFileSync(join(dir, SECTION_ABOUT), "utf8")) : { meta: {} as Record<string, string>, body: "" };
		const imagePath = about.meta.image ? join(dir, about.meta.image) : "";
		const hasImage = !!about.meta.image && existsSync(imagePath);
		sections.push({ name: folder.name, description: about.body.trim(), image: hasImage ? `${RESEARCH_DIR}/${folder.name}/${about.meta.image}` : null, version: hasImage ? statSync(imagePath).mtimeMs : 0 });
		scanResearchDir(dir, folder.name, items);
	}
	items.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
	return { sections, items };
}

function researchFile(novelDir: string, id: string) {
	const full = resolve(novelDir, id);
	if (!isInsideRoot(researchRoot(novelDir), full) || full === resolve(researchRoot(novelDir)) || !existsSync(full) || !statSync(full).isFile()) {
		throw new HttpError(404, "Item not found");
	}
	return full;
}

function sectionDir(novelDir: string, section: string | null | undefined) {
	const root = researchRoot(novelDir);
	mkdirSync(root, { recursive: true });
	if (!section) return root;
	const dir = join(root, safeName(section));
	if (!existsSync(dir)) throw new HttpError(404, "Section not found");
	return dir;
}

// Moves/renames an item together with its sidecar description or preview images.
function relocateItem(novelDir: string, id: string, section: string | null | undefined, title?: string) {
	const source = researchFile(novelDir, id);
	const sourceName = basename(source);
	const ext = extOf(sourceName);
	const destDir = sectionDir(novelDir, section);
	const wantedTitle = title ? safeName(title) : stem(sourceName);
	let destName = `${wantedTitle || stem(sourceName)}${ext ? `.${ext}` : ""}`;
	let dest = join(destDir, destName);

	if (dest !== source) {
		if (existsSync(dest)) {
			if (title && safeName(title) !== stem(sourceName)) throw new HttpError(409, "An item with that name already exists there");
			destName = uniqueName(destDir, destName);
			dest = join(destDir, destName);
		}
		const sourceDir = dirname(source);
		const oldStem = stem(sourceName);
		const newStem = stem(destName);
		const moveCompanion = (from: string, to: string) => {
			if (existsSync(join(sourceDir, from))) renameSync(join(sourceDir, from), join(destDir, to));
		};
		renameSync(source, dest);
		if (ext === "md") {
			for (const file of readdirSync(sourceDir)) {
				const preview = new RegExp(`^${oldStem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.preview\\.([a-z0-9]+)$`, "i").exec(file);
				if (preview) {
					moveCompanion(file, `${newStem}.preview.${preview[1]}`);
					const parsed = parseFrontmatter(readFileSync(dest, "utf8"));
					writeFileSync(dest, withFrontmatter({ ...parsed.meta, preview: `${newStem}.preview.${preview[1]}` }, parsed.body), "utf8");
				}
			}
		} else {
			moveCompanion(`${sourceName}.md`, `${destName}.md`);
		}
	}
	return `${RESEARCH_DIR}/${section ? `${safeName(section)}/` : ""}${basename(dest)}`;
}

function saveResearchItem(novelDir: string, payload: any) {
	const description = String(payload.description ?? "");
	const section = payload.section ? String(payload.section) : null;

	if (!payload.id) {
		const kind = payload.kind === "link" ? "link" : "note";
		const dir = sectionDir(novelDir, section);
		const name = uniqueName(dir, `${safeName(String(payload.title ?? "")) || "Untitled note"}.md`);
		writeFileSync(join(dir, name), withFrontmatter({ description, url: kind === "link" ? String(payload.url ?? "") : undefined }, String(payload.text ?? "")), "utf8");
		return `${RESEARCH_DIR}/${section ? `${safeName(section)}/` : ""}${name}`;
	}

	const newId = relocateItem(novelDir, String(payload.id), section, String(payload.title ?? ""));
	const full = researchFile(novelDir, newId);
	if (extOf(full) === "md") {
		const parsed = parseFrontmatter(readFileSync(full, "utf8"));
		const url = parsed.meta.url !== undefined ? String(payload.url ?? parsed.meta.url) : undefined;
		writeFileSync(full, withFrontmatter({ ...parsed.meta, description, url }, payload.text !== undefined ? String(payload.text) : parsed.body), "utf8");
	} else {
		const sidecar = `${full}.md`;
		if (description.trim()) writeFileSync(sidecar, description, "utf8");
		else rmSync(sidecar, { force: true });
	}
	return newId;
}

function deleteResearchItem(novelDir: string, id: string) {
	const full = researchFile(novelDir, id);
	const dir = dirname(full);
	const name = basename(full);
	if (extOf(name) === "md") {
		for (const file of readdirSync(dir)) {
			if (file.startsWith(`${stem(name)}.preview.`)) rmSync(join(dir, file), { force: true });
		}
	} else {
		rmSync(`${full}.md`, { force: true });
	}
	rmSync(full, { force: true });
}

async function addResearchLink(novelDir: string, rawUrl: string, section: string | null) {
	const target = new URL(rawUrl);
	if (target.protocol !== "http:" && target.protocol !== "https:") throw new HttpError(400, "Only http(s) links are supported");
	const dir = sectionDir(novelDir, section);
	const prefix = `${RESEARCH_DIR}/${section ? `${safeName(section)}/` : ""}`;
	const fallbackTitle = `${target.hostname}${target.pathname === "/" ? "" : target.pathname}`.slice(0, 80);

	let response: Awaited<ReturnType<typeof httpGet>>;
	try {
		response = await httpGet(target.toString(), { maxBytes: MAX_FILE_BYTES });
		if (response.status < 200 || response.status >= 300) throw new Error(`the site answered ${response.status}`);
	} catch (error) {
		const name = uniqueName(dir, `${safeName(fallbackTitle) || "Link"}.md`);
		writeFileSync(join(dir, name), withFrontmatter({ url: target.toString() }, ""), "utf8");
		return { id: `${prefix}${name}`, warning: `Saved the link, but couldn't fetch a preview: ${error instanceof Error ? error.message : "request failed"}` };
	}

	if (response.type === "text/html" || response.type === "application/xhtml+xml") {
		const page = htmlToPage(response.body.toString("utf8"));
		const name = uniqueName(dir, `${safeName(page.title) || safeName(fallbackTitle) || "Link"}.md`);
		const previewName = page.image ? await downloadPreview(page.image, response.url, dir, stem(name)) : undefined;
		writeFileSync(join(dir, name), withFrontmatter({ url: target.toString(), description: page.description || undefined, preview: previewName }, page.text), "utf8");
		return { id: `${prefix}${name}`, warning: previewName ? undefined : "Saved the link, but the page didn't offer a preview image." };
	}

	const ext = Object.entries(MIME_BY_EXT).find(([, mime]) => mime === response.type)?.[0] ?? extOf(basename(target.pathname)) ?? "bin";
	const display = safeName(decodeURIComponent(basename(target.pathname))) || `Download.${ext}`;
	const name = uniqueName(dir, extOf(display) ? display : `${display}.${ext}`);
	writeFileSync(join(dir, name), response.body);
	return { id: `${prefix}${name}` };
}

// Re-fetches a saved link's preview image, description and saved text.
async function refreshResearchLink(novelDir: string, id: string) {
	const full = researchFile(novelDir, id);
	if (extOf(full) !== "md") throw new HttpError(400, "Only links have previews");
	const parsed = parseFrontmatter(readFileSync(full, "utf8"));
	if (!parsed.meta.url) throw new HttpError(400, "That item isn't a link");
	const target = new URL(parsed.meta.url);

	const response = await httpGet(target.toString(), { maxBytes: MAX_FILE_BYTES });
	if (response.status < 200 || response.status >= 300) throw new HttpError(502, `The site answered ${response.status}`);
	if (response.type !== "text/html" && response.type !== "application/xhtml+xml") throw new HttpError(400, "That link isn't a web page");

	const page = htmlToPage(response.body.toString("utf8"));
	const previewName = page.image ? await downloadPreview(page.image, response.url, dirname(full), stem(basename(full))) : parsed.meta.preview;
	writeFileSync(
		full,
		withFrontmatter({ ...parsed.meta, description: parsed.meta.description || page.description || undefined, preview: previewName }, parsed.body.trim() ? parsed.body : page.text),
		"utf8",
	);
	// A link saved while offline was named after its address; give it the page's title now.
	const fallback = safeName(`${target.hostname}${target.pathname === "/" ? "" : target.pathname}`.slice(0, 80));
	if (page.title && stem(basename(full)) === fallback) {
		const parentDir = dirname(full);
		const section = parentDir === resolve(researchRoot(novelDir)) ? null : basename(parentDir);
		try {
			return { preview: !!previewName, id: relocateItem(novelDir, id, section, page.title) };
		} catch {
			// Keep the old name if the title is already taken.
		}
	}
	return { preview: !!previewName, id };
}

function saveSection(novelDir: string, payload: any) {
	const name = safeName(String(payload.name ?? ""));
	if (!name) throw new HttpError(400, "Name required");
	const previous = payload.previousName ? safeName(String(payload.previousName)) : "";
	const root = researchRoot(novelDir);
	mkdirSync(root, { recursive: true });
	const dir = join(root, name);

	if (previous && previous !== name) {
		if (existsSync(dir)) throw new HttpError(409, "A section with that name already exists");
		renameSync(join(root, previous), dir);
	} else if (!previous && existsSync(dir)) {
		throw new HttpError(409, "A section with that name already exists");
	}
	mkdirSync(dir, { recursive: true });

	const about = existsSync(join(dir, SECTION_ABOUT)) ? parseFrontmatter(readFileSync(join(dir, SECTION_ABOUT), "utf8")).meta : {};
	let image: string | undefined = about.image && existsSync(join(dir, about.image)) ? about.image : undefined;
	if (payload.image === null && image) {
		rmSync(join(dir, image), { force: true });
		image = undefined;
	} else if (typeof payload.image === "string") {
		const { ext, data } = decodeImage(payload.image);
		if (image) rmSync(join(dir, image), { force: true });
		image = `${SECTION_IMAGE}.${ext}`;
		writeFileSync(join(dir, image), data);
	}
	writeFileSync(join(dir, SECTION_ABOUT), withFrontmatter({ image }, String(payload.description ?? "")), "utf8");
}

function deleteSection(novelDir: string, rawName: string) {
	const root = researchRoot(novelDir);
	const dir = join(root, safeName(rawName));
	if (!existsSync(dir) || !isInsideRoot(root, dir) || dir === resolve(root)) return;
	// Items stay in the dashboard: move them out to the Research folder.
	for (const file of readdirSync(dir, { withFileTypes: true })) {
		if (!file.isFile() || file.name === SECTION_ABOUT || stem(file.name) === SECTION_IMAGE) continue;
		renameSync(join(dir, file.name), join(root, uniqueName(root, file.name)));
	}
	rmSync(dir, { recursive: true, force: true });
}

function addAuthor(root: string, name: string) {
	const authors = readAuthors(root);
	if (!authors.includes(name)) authors.push(name);
	writeFileSync(authorsPath(root), JSON.stringify({ authors }, null, 2));
}

function makeDefaultSettings() {
	return {
		appCss: DEFAULT_APP_CSS,
		markdownCss: DEFAULT_MARKDOWN_CSS,
		tailwindClasses: "min-h-screen bg-slate-950 text-slate-100",
	};
}

function ensureWorkspaceSettings(workspaceRoot: string) {
	const hiddenDir = join(workspaceRoot, SETTINGS_DIR);
	const settingsPath = join(hiddenDir, SETTINGS_FILE);
	if (!existsSync(hiddenDir)) mkdirSync(hiddenDir, { recursive: true });
	if (!existsSync(settingsPath)) {
		writeFileSync(settingsPath, JSON.stringify(makeDefaultSettings(), null, 2));
	}
	return settingsPath;
}

function readSettings(workspaceRoot: string) {
	const settingsPath = ensureWorkspaceSettings(workspaceRoot);
	try {
		return JSON.parse(readFileSync(settingsPath, "utf8"));
	} catch {
		const defaults = makeDefaultSettings();
		writeFileSync(settingsPath, JSON.stringify(defaults, null, 2));
		return defaults;
	}
}

function saveSettings(workspaceRoot: string, nextSettings: Record<string, string>) {
	const settingsPath = ensureWorkspaceSettings(workspaceRoot);
	writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2));
}

function isInsideRoot(root: string, target: string) {
	const rootResolved = resolve(root);
	const targetResolved = resolve(target);
	return targetResolved === rootResolved || targetResolved.startsWith(`${rootResolved}${sep}`);
}

function readOrder(dir: string): string[] {
	try {
		return JSON.parse(readFileSync(join(dir, ".order.json"), "utf8"));
	} catch {
		return [];
	}
}

// Manual order from .order.json first, then folders before files, then natural name order.
function sortedEntries(dir: string) {
	const order = readOrder(dir);
	const legacyNote = join(dir, "_index.md");
	if (existsSync(legacyNote) && !existsSync(join(dir, folderNoteName(dir)))) renameSync(legacyNote, join(dir, folderNoteName(dir)));
	const isNovelRoot = existsSync(join(dir, NOVEL_FILE));
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => !entry.name.startsWith(".") && entry.name !== folderNoteName(dir) && !(isNovelRoot && TAB_FOLDERS.includes(entry.name)))
		.sort((a, b) => {
			const ia = order.indexOf(a.name);
			const ib = order.indexOf(b.name);
			if (ia !== -1 || ib !== -1) {
				if (ia === -1) return 1;
				if (ib === -1) return -1;
				return ia - ib;
			}
			if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { numeric: true });
		});
}

function listTree(root: string): Array<{ name: string; path: string; type: "file" | "dir"; children?: Array<any> }> {
	const entries = sortedEntries(root);

	return entries.map((entry) => {
		const fullPath = join(root, entry.name);
		if (entry.isDirectory()) {
			return {
				name: entry.name,
				path: fullPath,
				type: "dir",
				children: listTree(fullPath),
			};
		}
		return {
			name: entry.name,
			path: fullPath,
			type: "file",
		};
	});
}

function parseJsonBody(req: any): Promise<any> {
	return new Promise((resolve, reject) => {
		let raw = "";
		req.on("data", (chunk: Buffer) => {
			raw += chunk.toString();
		});
		req.on("end", () => {
			if (!raw.trim()) return resolve({});
			try {
				resolve(JSON.parse(raw));
			} catch (error) {
				reject(new Error("Invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}

function applyCorsHeaders(res: any) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: any, payload: any, status = 200) {
	applyCorsHeaders(res);
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(payload));
}

async function handleApiRequest(req: any, res: any) {
	applyCorsHeaders(res);
	if (req.method === "OPTIONS") {
		res.writeHead(200);
		res.end();
		return;
	}

	const url = new URL(req.url, `http://localhost:${API_PORT}`);
	const pathname = url.pathname;

	if (pathname === "/api/workspace") {
		if (!state.workspaceRoot) {
			sendJson(res, { workspace: null, settings: makeDefaultSettings() }, 200);
			return;
		}
		sendJson(res, {
			workspace: state.workspaceRoot,
			settings: readSettings(state.workspaceRoot),
		});
		return;
	}

	if (pathname === "/api/select-workspace") {
		const folders = await Utils.openFileDialog({
			startingFolder: join(homedir(), "Desktop"),
			canChooseFiles: false,
			canChooseDirectory: true,
			allowsMultipleSelection: false,
		});
		const chosen = folders[0];
		if (!chosen) {
			sendJson(res, { workspace: null, message: "No folder selected" }, 200);
			return;
		}
		state.workspaceRoot = chosen;
		ensuredDirectory: ensureWorkspaceSettings(chosen);
		sendJson(res, {
			workspace: chosen,
			settings: readSettings(chosen),
		});
		return;
	}

	if (state.workspaceRoot && pathname === "/api/excerpts") {
		const scope = resolve(state.workspaceRoot, url.searchParams.get("root") ?? "");
		if (!isInsideRoot(state.workspaceRoot, scope) || !existsSync(scope)) return sendJson(res, { error: "Invalid root" }, 400);
		const excerpts: Record<string, { excerpt: string; words: number }> = {};
		collectExcerpts(scope, excerpts);
		return sendJson(res, { excerpts });
	}

	if (state.workspaceRoot && pathname === "/api/novel/file" && req.method === "GET") {
		const novelDir = novelDirFrom(state.workspaceRoot, url.searchParams.get("novel") ?? "");
		const rel = url.searchParams.get("path") ?? "";
		const full = novelDir ? resolve(novelDir, rel) : "";
		const allowed = novelDir && [ELEMENTS_DIR, RESEARCH_DIR].some((folder) => isInsideRoot(join(novelDir, folder), full) && full !== resolve(join(novelDir, folder)));
		if (!novelDir || !allowed || !existsSync(full) || !statSync(full).isFile()) return sendJson(res, { error: "Not found" }, 404);
		res.writeHead(200, { "Content-Type": MIME_BY_EXT[extOf(full)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
		res.end(readFileSync(full));
		return;
	}

	if (state.workspaceRoot && pathname === "/api/elements" && req.method === "GET") {
		const novelDir = novelDirFrom(state.workspaceRoot, url.searchParams.get("novel") ?? "");
		if (!novelDir) return sendJson(res, { error: "Invalid novel" }, 400);
		return sendJson(res, { items: readElements(novelDir) });
	}

	if (state.workspaceRoot && pathname === "/api/research" && req.method === "GET") {
		const novelDir = novelDirFrom(state.workspaceRoot, url.searchParams.get("novel") ?? "");
		if (!novelDir) return sendJson(res, { error: "Invalid novel" }, 400);
		return sendJson(res, readResearch(novelDir));
	}

	const RESEARCH_POSTS = ["/api/elements/save", "/api/elements/delete", "/api/research/save", "/api/research/delete", "/api/research/move", "/api/research/link", "/api/research/refresh", "/api/research/import", "/api/research/section", "/api/research/section/delete", "/api/open"];
	if (state.workspaceRoot && req.method === "POST" && RESEARCH_POSTS.includes(pathname)) {
		const root = state.workspaceRoot;
		const payload = await parseJsonBody(req);
		const novelDir = novelDirFrom(root, String(payload.novel ?? ""));
		if (!novelDir) return sendJson(res, { error: "Invalid novel" }, 400);

		try {
			switch (pathname) {
				case "/api/elements/save":
					return sendJson(res, { item: saveElement(novelDir, payload) });
				case "/api/elements/delete":
					deleteElement(novelDir, String(payload.name ?? ""));
					return sendJson(res, { ok: true });
				case "/api/research/save":
					return sendJson(res, { id: saveResearchItem(novelDir, payload) });
				case "/api/research/delete":
					deleteResearchItem(novelDir, String(payload.id ?? ""));
					return sendJson(res, { ok: true });
				case "/api/research/move":
					return sendJson(res, { id: relocateItem(novelDir, String(payload.id ?? ""), payload.section ? String(payload.section) : null) });
				case "/api/research/link":
					return sendJson(res, await addResearchLink(novelDir, String(payload.url ?? ""), payload.section ? String(payload.section) : null));
				case "/api/research/refresh":
					return sendJson(res, await refreshResearchLink(novelDir, String(payload.id ?? "")));
				case "/api/research/import": {
					const picked = await Utils.openFileDialog({ startingFolder: homedir(), canChooseFiles: true, canChooseDirectory: false, allowsMultipleSelection: false });
					const source = picked[0];
					if (!source || !existsSync(source)) return sendJson(res, { id: null });
					if (statSync(source).size > MAX_FILE_BYTES) throw new HttpError(413, "That file is too large");
					const dir = sectionDir(novelDir, payload.section ? String(payload.section) : null);
					const name = uniqueName(dir, safeName(basename(source)) || "File");
					copyFileSync(source, join(dir, name));
					return sendJson(res, { id: `${RESEARCH_DIR}/${payload.section ? `${safeName(String(payload.section))}/` : ""}${name}` });
				}
				case "/api/research/section":
					saveSection(novelDir, payload);
					return sendJson(res, { ok: true });
				case "/api/research/section/delete":
					deleteSection(novelDir, String(payload.name ?? ""));
					return sendJson(res, { ok: true });
				default: {
					// /api/open: a web link, or a file inside Elements/Research.
					if (typeof payload.url === "string") {
						const target = new URL(payload.url);
						if (target.protocol === "http:" || target.protocol === "https:") Utils.openExternal(target.toString());
						return sendJson(res, { ok: true });
					}
					const full = resolve(novelDir, String(payload.file ?? ""));
					const allowed = [ELEMENTS_DIR, RESEARCH_DIR].some((folder) => isInsideRoot(join(novelDir, folder), full));
					if (!allowed || !existsSync(full)) return sendJson(res, { error: "Nothing to open" }, 400);
					Utils.openPath(full);
					return sendJson(res, { ok: true });
				}
			}
		} catch (error) {
			const status = error instanceof HttpError ? error.status : 502;
			return sendJson(res, { error: error instanceof Error ? error.message : "Request failed" }, status);
		}
	}

	if (pathname === "/api/pick-image" && req.method === "POST") {
		// Unclear whether the native dialog wants bare extensions or globs, so send both, in both cases.
		const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];
		const allowedFileTypes = imageExts.flatMap((e) => [e, e.toUpperCase(), `*.${e}`, `*.${e.toUpperCase()}`]).join(",");
		const picked = await Utils.openFileDialog({
			startingFolder: homedir(),
			allowedFileTypes,
			canChooseFiles: true,
			canChooseDirectory: false,
			allowsMultipleSelection: false,
		});
		const file = picked[0];
		const ext = file ? file.split(".").pop()?.toLowerCase() ?? "" : "";
		const mime = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", avif: "image/avif" } as Record<string, string>)[ext];
		if (!file || !mime || statSync(file).size > 25 * 1024 * 1024) {
			sendJson(res, { dataUrl: null });
			return;
		}
		sendJson(res, { dataUrl: `data:${mime};base64,${readFileSync(file).toString("base64")}` });
		return;
	}

	if (pathname === "/api/tree" && state.workspaceRoot) {
		const scope = resolve(state.workspaceRoot, url.searchParams.get("root") ?? "");
		if (!isInsideRoot(state.workspaceRoot, scope) || !existsSync(scope)) {
			sendJson(res, { error: "Invalid root" }, 400);
			return;
		}
		sendJson(res, { tree: listTree(scope), workspace: state.workspaceRoot });
		return;
	}

	if (state.workspaceRoot && pathname === "/api/library") {
		const root = state.workspaceRoot;
		const { novels, shelves } = scanLibrary(root);
		sendJson(res, { novels, shelves, authors: readAuthors(root) });
		return;
	}

	if (state.workspaceRoot && req.method === "POST" && ["/api/authors", "/api/shelf", "/api/novel", "/api/novel/meta", "/api/folder", "/api/rename", "/api/move", "/api/shelf/rename"].includes(pathname)) {
		const root = state.workspaceRoot;
		const payload = await parseJsonBody(req);

		if (pathname === "/api/authors") {
			const name = safeName(String(payload.name ?? ""));
			if (!name) return sendJson(res, { error: "Name required" }, 400);
			addAuthor(root, name);
			return sendJson(res, { authors: readAuthors(root) });
		}

		if (pathname === "/api/shelf") {
			const name = safeName(String(payload.name ?? ""));
			const author = safeName(String(payload.author ?? ""));
			if (!name || !author) return sendJson(res, { error: "Name and author required" }, 400);
			// Another author may already own a shelf with this name, so disambiguate the folder.
			let folder = name;
			const existing = readShelf(join(root, folder));
			if (existsSync(join(root, folder)) && (existing?.author ?? author) !== author) folder = `${name} (${author})`;
			mkdirSync(join(root, folder), { recursive: true });
			writeFileSync(join(root, folder, ".shelf.json"), JSON.stringify({ name, author }, null, 2));
			return sendJson(res, { ok: true, folder });
		}

		if (pathname === "/api/shelf/rename") {
			const source = join(root, safeName(String(payload.folder ?? "")));
			const name = safeName(String(payload.name ?? ""));
			if (!name || !existsSync(source) || readNovel(source)) return sendJson(res, { error: "Invalid shelf" }, 400);
			const target = join(root, name);
			if (target !== source) {
				if (existsSync(target)) return sendJson(res, { error: "A shelf or novel with that name already exists" }, 409);
				renameSync(source, target);
			}
			const shelfMeta = readShelf(target);
			writeFileSync(join(target, ".shelf.json"), JSON.stringify({ ...(shelfMeta ?? {}), name }, null, 2));
			return sendJson(res, { ok: true, folder: name });
		}

		if (pathname === "/api/rename") {
			const source = resolve(root, String(payload.path ?? ""));
			if (!isInsideRoot(root, source) || source === resolve(root) || !existsSync(source)) return sendJson(res, { error: "Invalid path" }, 400);
			let name = safeName(String(payload.name ?? ""));
			if (!name) return sendJson(res, { error: "Name required" }, 400);
			if (statSync(source).isFile() && !name.toLowerCase().endsWith(".md")) name += ".md";
			const target = join(dirname(source), name);
			if (target !== source) {
				if (existsSync(target)) return sendJson(res, { error: "That name is already used here" }, 409);
				const parent = dirname(source);
				const names = sortedEntries(parent).map((e) => e.name);
				renameSync(source, target);
				// A folder's note carries the folder's name.
				const oldNote = join(target, `${basename(source)}.md`);
				if (statSync(target).isDirectory() && existsSync(oldNote)) renameSync(oldNote, join(target, `${name}.md`));
				writeFileSync(join(parent, ".order.json"), JSON.stringify(names.map((n) => (n === basename(source) ? name : n)), null, 2));
			}
			return sendJson(res, { path: target });
		}

		if (pathname === "/api/move") {
			const source = resolve(root, String(payload.path ?? ""));
			const destDir = resolve(root, String(payload.toDir ?? ""));
			const before = typeof payload.before === "string" ? payload.before : null;
			const valid = isInsideRoot(root, source) && source !== resolve(root) && existsSync(source) && isInsideRoot(root, destDir) && existsSync(destDir);
			if (!valid || destDir === source || destDir.startsWith(`${source}${sep}`)) return sendJson(res, { error: "Invalid move" }, 400);
			const name = basename(source);
			const target = join(destDir, name);
			const oldParent = dirname(source);
			const oldNames = sortedEntries(oldParent).map((e) => e.name);
			if (target !== source) {
				if (existsSync(target)) return sendJson(res, { error: "That name is already used there" }, 409);
				renameSync(source, target);
				writeFileSync(join(oldParent, ".order.json"), JSON.stringify(oldNames.filter((n) => n !== name), null, 2));
			}
			const siblings = sortedEntries(destDir).map((e) => e.name).filter((n) => n !== name);
			const index = before ? siblings.indexOf(before) : -1;
			siblings.splice(index === -1 ? siblings.length : index, 0, name);
			writeFileSync(join(destDir, ".order.json"), JSON.stringify(siblings, null, 2));
			return sendJson(res, { path: target });
		}

		if (pathname === "/api/folder") {
			const target = resolve(root, String(payload.path ?? ""));
			if (!isInsideRoot(root, target) || target === resolve(root)) return sendJson(res, { error: "Invalid path" }, 400);
			mkdirSync(target, { recursive: true });
			return sendJson(res, { ok: true });
		}

		if (pathname === "/api/novel") {
			const title = safeName(String(payload.title ?? ""));
			const shelf = safeName(String(payload.shelf ?? ""));
			const author = safeName(String(payload.author ?? ""));
			if (!title) return sendJson(res, { error: "Title required" }, 400);
			const dir = join(root, shelf, title);
			if (existsSync(dir)) return sendJson(res, { error: "A novel with that title already exists here" }, 409);
			mkdirSync(join(dir, "Chapter 1"), { recursive: true });
			writeFileSync(join(dir, "Chapter 1", "Scene 1.md"), "", "utf8");
			const meta = {
				title,
				subtitle: String(payload.subtitle ?? ""),
				author,
				genre: "",
				description: "",
				cover: { seed: Math.floor(Math.random() * 1_000_000), image: null },
				createdAt: new Date().toISOString(),
			};
			writeFileSync(join(dir, NOVEL_FILE), JSON.stringify(meta, null, 2));
			if (author) addAuthor(root, author);
			return sendJson(res, { path: dir, shelf: shelf || null, meta });
		}

		// /api/novel/meta
		let dir = resolve(String(payload.path ?? ""));
		const existing = isInsideRoot(root, dir) ? readNovel(dir) : null;
		if (!existing) return sendJson(res, { error: "Not a novel folder" }, 400);
		const meta = { ...existing, ...(payload.meta ?? {}) };
		// A new title renames the novel's folder too.
		const folderName = typeof payload.meta?.title === "string" ? safeName(payload.meta.title) : "";
		if (folderName && folderName !== basename(dir)) {
			const renamed = join(dirname(dir), folderName);
			if (existsSync(renamed)) return sendJson(res, { error: "A novel with that title already exists here" }, 409);
			renameSync(dir, renamed);
			dir = renamed;
		}
		writeFileSync(join(dir, NOVEL_FILE), JSON.stringify(meta, null, 2));
		if (meta.author) addAuthor(root, String(meta.author));
		return sendJson(res, { meta, path: dir });
	}

	if (pathname === "/api/settings" && state.workspaceRoot) {
		if (req.method === "GET") {
			sendJson(res, { settings: readSettings(state.workspaceRoot) });
			return;
		}
		if (req.method === "POST") {
			const payload = await parseJsonBody(req);
			saveSettings(state.workspaceRoot, {
				appCss: String(payload.appCss ?? DEFAULT_APP_CSS),
				markdownCss: String(payload.markdownCss ?? DEFAULT_MARKDOWN_CSS),
				tailwindClasses: String(payload.tailwindClasses ?? "min-h-screen bg-slate-950 text-slate-100"),
			});
			sendJson(res, { saved: true, settings: readSettings(state.workspaceRoot) });
			return;
		}
	}

	if (pathname === "/api/file") {
		const targetDir = state.workspaceRoot;
		if (!targetDir) {
			sendJson(res, { error: "No workspace selected" }, 400);
			return;
		}
		if (req.method === "POST") {
			const payload = await parseJsonBody(req);
			const targetPath = typeof payload.path === "string" ? payload.path : "";
			const resolved = resolve(targetDir, targetPath);
			if (!isInsideRoot(targetDir, resolved)) {
				sendJson(res, { error: "Invalid file path" }, 400);
				return;
			}
			const outDir = dirname(resolved);
			mkdirSync(outDir, { recursive: true });
			writeFileSync(resolved, String(payload.content ?? ""), "utf8");
			sendJson(res, { ok: true, path: resolved, size: statSync(resolved).size });
			return;
		}
		if (req.method === "GET") {
			const requestedPath = url.searchParams.get("path") ?? "";
			const resolved = resolve(targetDir, requestedPath);
			if (!isInsideRoot(targetDir, resolved)) {
				sendJson(res, { error: "Invalid file path" }, 400);
				return;
			}
			if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
				sendJson(res, { error: "File not found" }, 404);
				return;
			}
			sendJson(res, { path: resolved, content: readFileSync(resolved, "utf8") });
			return;
		}
	}

	if (pathname === "/api/file/delete") {
		if (!state.workspaceRoot) {
			sendJson(res, { error: "No workspace selected" }, 400);
			return;
		}
		if (req.method === "POST") {
			const payload = await parseJsonBody(req);
			const targetPath = typeof payload.path === "string" ? payload.path : "";
			const resolved = resolve(state.workspaceRoot, targetPath);
			if (!isInsideRoot(state.workspaceRoot, resolved) || resolved === resolve(state.workspaceRoot)) {
				sendJson(res, { error: "Invalid path" }, 400);
				return;
			}
			if (existsSync(resolved)) rmSync(resolved, { recursive: true, force: true });
			sendJson(res, { ok: true });
			return;
		}
	}

	applyCorsHeaders(res);
	res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify({ error: "Not found" }));
}

const apiServer = createServer((req, res) => {
	void handleApiRequest(req, res);
});

apiServer.listen(API_PORT, "127.0.0.1", () => {
	console.log(`GhoaxtWriter local file API listening on http://localhost:${API_PORT}`);
});

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log("Vite dev server not running. Run 'hutch run dev:hmr' for HMR support.");
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
	title: "GhoaxtWriter",
	url,
	renderer: "cef",
	frame: {
		width: 1200,
		height: 780,
		x: 180,
		y: 120,
	},
});

console.log("GhoaxtWriter window started!");
