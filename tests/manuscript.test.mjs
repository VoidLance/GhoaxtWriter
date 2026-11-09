import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => server.close());
const { multiEnter, insideSpecialBlock } = await server.ssrLoadModule("/src/mainview/multiEnter.ts");
const { createMatter, decorateManuscript, updateContents, writeChapter, contentsBlock, splitScene, templateContent } = await server.ssrLoadModule("/src/bun/manuscript.ts");

test("three consecutive enters preserve trailing lines and replace the break with a chapter split", () => {
  const first = multiEnter("Hello world\nlast", 0, 6, 6, null);
  assert.equal(first.value, "Hello \nworld\nlast");
  const second = multiEnter(first.value, first.line, 0, 0, first.sequence);
  assert.equal(second.value, "Hello \n***\nworld\nlast");
  assert.deepEqual(multiEnter(second.value, second.line, 0, 0, second.sequence), {
    kind: "split", before: "Hello ", after: "world\nlast",
  });
  const reset = multiEnter(first.value, first.line, 1, 1, first.sequence);
  assert.equal(reset.value, "Hello \nw\norld\nlast");
});

test("multi-enter does not apply within poetry or code fences", () => {
  assert.equal(insideSpecialBlock(["::: poetry", "text", ":::"], 1), true);
  assert.equal(insideSpecialBlock(["```", "::: poetry", "```", "text"], 3), false);
  assert.equal(insideSpecialBlock(["```", "code", "```"], 1), true);
  assert.equal(insideSpecialBlock(["text"], 0), false);
});

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "ghoaxt-manuscript-test-"));
  try { return run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function node(root, name, children = []) {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  return { name, path, type: "dir", children };
}

test("chapter numbers follow manuscript order across acts, roles and named chapters", () => fixture((root) => {
  const first = node(root, "Chapter 7");
  const act = node(root, "Act 1");
  const second = node(act.path, "Chapter 2");
  const named = node(act.path, "Named chapter");
  const role = node(root, "Prologue");
  writeChapter(first.path, { title: "Opening" });
  writeChapter(role.path, { role: "Prologue" });
  act.children = [second, named];
  const nodes = [role, first, act];
  decorateManuscript(nodes);
  assert.equal(role.displayName, "Prologue");
  assert.equal(first.displayName, "Chapter 1 — Opening");
  assert.equal(second.displayName, "Chapter 2");
  assert.equal(named.displayName, "Named chapter");
  decorateManuscript([act, role, first], { showNumbers: true, showTitles: false });
  assert.equal(second.displayName, "Chapter 1");
  assert.equal(first.displayName, "Chapter 2");
  decorateManuscript(nodes, { showNumbers: false, showTitles: true });
  assert.equal(first.displayName, "Opening");
  assert.equal(second.displayName, "");
  assert.equal(named.displayName, "Named chapter");
}));

test("contents regenerate links in order, preserving surrounding user text", () => fixture((root) => {
  const contents = node(root, "Contents");
  const one = node(root, "Chapter 1");
  const two = node(root, "Chapter 2");
  const scene = join(one.path, "A scene.md");
  writeFileSync(scene, "Text");
  one.children = [{ name: "A scene.md", path: scene, type: "file" }];
  writeChapter(contents.path, { role: "Contents", contents: true, contentsFile: "Generated contents.md" });
  writeChapter(one.path, { title: "First" });
  const file = join(contents.path, "Generated contents.md");
  writeFileSync(file, `Introduction\n\n${contentsBlock()}\n\nNotes\n`);
  contents.children = [{ name: "Generated contents.md", path: file, type: "file" }];
  const nodes = decorateManuscript([contents, one, two]);
  updateContents(nodes);
  const text = readFileSync(file, "utf8");
  assert.match(text, /^Introduction\n\n<!-- ghoaxtwriter:toc:start -->/);
  assert.match(text, /\[Chapter 1 — First\]\(\.\.\/Chapter%201\/A%20scene\.md\)/);
  assert.match(text, /\[Chapter 2\]/);
  assert.match(text, /<!-- ghoaxtwriter:toc:end -->\n\nNotes\n$/);
  updateContents(decorateManuscript([contents, two, one]));
  const reordered = readFileSync(file, "utf8");
  assert.ok(reordered.indexOf("Chapter%202") < reordered.indexOf("Chapter%201"));
  assert.match(reordered, /Chapter 2 — First/);
  writeFileSync(file, "User removed the markers");
  assert.throws(() => updateContents(nodes), /markers missing/);
  assert.equal(readFileSync(file, "utf8"), "User removed the markers");
}));

test("splitting a scene persists both sides and inserts the chapter after the original", () => fixture((root) => {
  const chapter = node(root, "Chapter 1");
  node(root, "Chapter 2");
  const source = join(chapter.path, "Scene 1.md");
  writeFileSync(source, "before\n***\nafter");
  const result = splitScene(source, "before\n***\nafter", "before", "after", ["Chapter 1", "Chapter 2"]);
  assert.equal(readFileSync(source, "utf8"), "before");
  assert.equal(readFileSync(result.path, "utf8"), "after");
  assert.deepEqual(JSON.parse(readFileSync(join(root, ".order.json"), "utf8")), ["Chapter 1", "Chapter 3", "Chapter 2"]);
  assert.deepEqual(JSON.parse(readFileSync(join(result.folder, ".chapter.json"), "utf8")), { numbered: true });
}));

test("a stale split is rejected without modifying the manuscript", () => fixture((root) => {
  const chapter = node(root, "Chapter 1");
  const source = join(chapter.path, "Scene 1.md");
  writeFileSync(source, "external change");
  assert.throws(() => splitScene(source, "old", "a", "b", ["Chapter 1"]), /changed on disk/);
  assert.equal(readFileSync(source, "utf8"), "external change");
  assert.throws(() => readFileSync(join(root, "Chapter 2", "Scene 1.md")));
}));

test("matter placeholders use novel details without evaluating template content", () => {
  assert.equal(templateContent("{{title}} / {{author}} / {{year}} / {{other}}", { title: "Book", author: "Writer" }, 2026), "Book / Writer / 2026 / {{other}}");
});

test("matter templates create editable scenes in the requested order", () => fixture((root) => {
  const file = createMatter(root, "Epilogue", { name: "Epilogue", role: "Epilogue", content: "For {{author}}" }, { author: "Writer" }, "back", ["Chapter 1"]);
  assert.equal(readFileSync(file, "utf8"), "For Writer");
  assert.deepEqual(JSON.parse(readFileSync(join(root, ".order.json"), "utf8")), ["Chapter 1", "Epilogue"]);
  const metadata = JSON.parse(readFileSync(join(root, "Epilogue", ".chapter.json"), "utf8"));
  assert.equal(metadata.role, "Epilogue");
  const contents = createMatter(root, "Contents", { name: "Contents", role: "Contents", content: "Custom introduction", contents: true }, {}, "front", ["Chapter 1", "Epilogue"]);
  assert.equal(contents, join(root, "Contents", "Generated contents.md"));
  assert.match(readFileSync(contents, "utf8"), /^Custom introduction\n\n<!-- ghoaxtwriter:toc:start -->/);
  assert.deepEqual(JSON.parse(readFileSync(join(root, ".order.json"), "utf8")), ["Contents", "Chapter 1", "Epilogue"]);
}));

test("empty explicitly marked acts are not counted as chapters", () => fixture((root) => {
  const act = node(root, "A custom act");
  writeChapter(act.path, { kind: "act" });
  const chapter = node(root, "Chapter 9");
  decorateManuscript([act, chapter]);
  assert.equal(act.isAct, true);
  assert.equal(chapter.displayName, "Chapter 1");
}));

test("matter creation cleans up its new folder if ordering cannot be saved", () => fixture((root) => {
  mkdirSync(join(root, ".order.json"));
  assert.throws(() => createMatter(root, "Prologue", { name: "Prologue", role: "Prologue", content: "" }, {}, "front", []));
  assert.throws(() => readFileSync(join(root, "Prologue", "Scene 1.md")));
}));
