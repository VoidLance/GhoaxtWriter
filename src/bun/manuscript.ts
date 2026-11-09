import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, relative, sep } from "node:path";
import { chapterLabel, isNumberedChapter, manuscriptSettings, type ChapterInfo, type ManuscriptSettings, type MatterTemplate } from "../shared/manuscript";

export type ManuscriptNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: ManuscriptNode[];
  chapter?: ChapterInfo;
  displayName?: string;
  isAct?: boolean;
  generatedContents?: boolean;
};

const START = "<!-- ghoaxtwriter:toc:start -->";
const END = "<!-- ghoaxtwriter:toc:end -->";

export function readChapter(dir: string): ChapterInfo {
  const file = join(dir, ".chapter.json");
  if (!existsSync(file)) return {};
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Invalid chapter metadata: ${file}`);
  return data;
}

export function writeChapter(dir: string, info: ChapterInfo) {
  writeFileSync(join(dir, ".chapter.json"), JSON.stringify(info, null, 2));
}

export function decorateManuscript(nodes: ManuscriptNode[], raw?: Partial<ManuscriptSettings>) {
  const settings = manuscriptSettings(raw);
  let number = 0;
  function walk(items: ManuscriptNode[]) {
    for (const node of items) {
      if (node.type !== "dir") continue;
      node.chapter = readChapter(node.path);
      node.isAct = node.chapter.kind === "act" || (node.children ?? []).some((child) => child.type === "dir") ||
        (node.chapter.kind !== "chapter" && /^act(?:\s+\d+)?$/i.test(node.name));
      if (!node.isAct) {
        if (isNumberedChapter(node.name, node.chapter)) number++;
        node.displayName = chapterLabel(node.name, node.chapter, number, settings);
      } else {
        node.displayName = node.chapter.role || node.name;
      }
      if (node.chapter.contents) {
        let found = false;
        for (const child of node.children ?? []) {
          if (child.type === "file" && child.name === (node.chapter.contentsFile ?? "Contents.md")) {
            child.generatedContents = true;
            found = true;
          }
        }
        if (!found) throw new Error(`Generated table of contents file is missing in ${node.path}`);
      }
      walk(node.children ?? []);
    }
  }
  walk(nodes);
  return nodes;
}

export function updateContents(nodes: ManuscriptNode[]) {
  const chapters: ManuscriptNode[] = [];
  function walk(items: ManuscriptNode[]) {
    for (const node of items) {
      if (node.type !== "dir") continue;
      if (!node.isAct && !node.chapter?.contents && node.displayName) chapters.push(node);
      walk(node.children ?? []);
    }
  }
  walk(nodes);
  function update(items: ManuscriptNode[]) {
    for (const node of items) {
      if (node.generatedContents) {
        const content = readFileSync(node.path, "utf8");
        const start = content.indexOf(START);
        const end = content.indexOf(END);
        if (start < 0 || end < start || content.indexOf(START, start + START.length) >= 0 || content.indexOf(END, end + END.length) >= 0) {
          throw new Error(`Cannot update table of contents: markers missing or duplicated in ${node.path}`);
        }
        const links = chapters.map((chapter) => {
          const label = chapter.displayName!.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
          const scene = chapter.children?.find((child) => child.type === "file" && child.name.toLowerCase().endsWith(".md"));
          const target = relative(dirname(node.path), scene?.path ?? chapter.path).split(sep).map(encodeURIComponent).join("/");
          return `- [${label}](${target}${scene ? "" : "/"})`;
        }).join("\n");
        const next = `${content.slice(0, start)}${START}\n${links}${links ? "\n" : ""}${content.slice(end)}`;
        if (next !== content) writeAtomic(node.path, next);
      }
      update(node.children ?? []);
    }
  }
  update(nodes);
}

export function contentsBlock() {
  return `${START}\n${END}`;
}

export function templateContent(content: string, meta: { title?: string; author?: string }, year: number) {
  return content.replace(/\{\{(title|author|year)\}\}/g, (_match, key: string) =>
    key === "year" ? String(year) : key === "title" ? meta.title ?? "" : meta.author ?? "");
}

export function chapterName(parent: string) {
  let n = 1;
  while (existsSync(join(parent, `Chapter ${n}`))) n++;
  return `Chapter ${n}`;
}

export function nextOrder(names: string[], name: string, after?: string) {
  const result = names.filter((item) => item !== name);
  const index = after === undefined ? -1 : result.indexOf(after);
  result.splice(index < 0 ? result.length : index + 1, 0, name);
  return result;
}

function writeAtomic(file: string, content: string | Buffer) {
  const temp = join(dirname(file), `.ghoaxtwriter-${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, content, { flag: "wx", mode: existsSync(file) ? statSync(file).mode : 0o666 });
    renameSync(temp, file);
  } finally {
    if (existsSync(temp)) rmSync(temp);
  }
}

export function createMatter(novelDir: string, folder: string, template: MatterTemplate, meta: { title?: string; author?: string }, position: "front" | "back", names: string[]) {
  const dir = join(novelDir, folder);
  const contentsFile = folder.toLowerCase() === "contents" ? "Generated contents.md" : "Contents.md";
  mkdirSync(dir);
  try {
    writeChapter(dir, { kind: "chapter", role: template.role.trim(), numbered: false, contents: !!template.contents, ...(template.contents ? { contentsFile } : {}) });
    const body = templateContent(template.content, meta, new Date().getFullYear());
    const file = join(dir, template.contents ? contentsFile : "Scene 1.md");
    writeFileSync(file, template.contents ? `${body}${body ? "\n\n" : ""}${contentsBlock()}\n` : body, { flag: "wx" });
    writeAtomic(join(novelDir, ".order.json"), JSON.stringify(position === "front" ? [folder, ...names] : [...names, folder], null, 2));
    return file;
  } catch (error) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (cleanup) {
      throw new Error(`Could not add matter: ${String(error)}. Cleanup also failed: ${String(cleanup)}`);
    }
    throw error;
  }
}

export function splitScene(source: string, expected: string, before: string, after: string, names: string[]) {
  if (readFileSync(source, "utf8") !== expected) throw new Error("The scene changed on disk; reload it before splitting.");
  const dir = dirname(source);
  const parent = dirname(dir);
  const name = chapterName(parent);
  const target = join(parent, name);
  const order = join(parent, ".order.json");
  const oldOrder = existsSync(order) ? readFileSync(order) : null;
  const temp = join(dir, `.ghoaxtwriter-split-${randomUUID()}.tmp`);
  mkdirSync(target);
  try {
    writeChapter(target, { numbered: true });
    const file = join(target, "Scene 1.md");
    writeFileSync(file, after, { flag: "wx" });
    writeFileSync(temp, before, { flag: "wx", mode: statSync(source).mode });
    writeAtomic(order, JSON.stringify(nextOrder(names, name, basename(dir)), null, 2));
    renameSync(temp, source);
    return { path: file, folder: target };
  } catch (error) {
    try {
      if (oldOrder) writeAtomic(order, oldOrder);
      else if (existsSync(order)) rmSync(order);
      if (existsSync(temp)) rmSync(temp);
      rmSync(target, { recursive: true, force: true });
    } catch (rollback) {
      throw new Error(`Chapter split failed: ${String(error)}. Cleanup also failed: ${String(rollback)}`);
    }
    throw error;
  }
}
