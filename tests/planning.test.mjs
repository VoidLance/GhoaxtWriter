import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
after(() => server.close());

const { default: Planning } = await server.ssrLoadModule("/src/mainview/Planning.tsx");
const { formatWords } = await server.ssrLoadModule("/src/mainview/prefs.ts");

const tree = [{
  name: "Act",
  path: "/novel/Act",
  type: "dir",
  children: [{
    name: "Chapter",
    path: "/novel/Act/Chapter",
    type: "dir",
    children: [{ name: "Scene.md", path: "/novel/Act/Chapter/Scene.md", type: "file" }],
  }],
}];

function renderPlanning(showWords, format) {
  const goals = { "/novel/Act/Chapter": 1000 };
  return renderToStaticMarkup(React.createElement(Planning, {
    tree,
    novelPath: "/novel",
    novelRel: "novel",
    apiFetch: () => { throw new Error("Effects do not run during server rendering"); },
    showWords,
    formatNodeWords: (node, words) => formatWords(words, goals[node.path], format),
    onMove: async () => {},
    onOpenFile: () => {},
    onOpenFolder: () => {},
    onCreateScene: () => {},
    onCreateFolder: () => {},
  }));
}

test("planning cards use the selected goal display and retain plain counts without a goal", () => {
  const percent = renderPlanning(true, { count: false, ofGoal: false, percent: true });
  assert.match(percent, />0%<\/span>/);
  assert.equal((percent.match(/>0<\/span>/g) ?? []).length, 2);

  const combined = renderPlanning(true, { count: true, ofGoal: true, percent: true });
  assert.match(combined, />0\/1,000 · 0%<\/span>/);

  const count = renderPlanning(true, { count: true, ofGoal: false, percent: false });
  assert.equal((count.match(/>0<\/span>/g) ?? []).length, 3);
});

test("word formats handle nonzero counts, exceeded goals and unset goals", () => {
  assert.equal(formatWords(1250, 1000, { count: false, ofGoal: true, percent: true }), "1,250/1,000 · 125%");
  assert.equal(formatWords(250, 1000, { count: false, ofGoal: false, percent: true }), "25%");
  assert.equal(formatWords(250, undefined, { count: false, ofGoal: false, percent: true }), "250");
});

test("planning hides scene and folder word counts when the display setting is disabled", () => {
  const html = renderPlanning(false, { count: true, ofGoal: true, percent: true });
  assert.doesNotMatch(html, />0(?:\/1,000|%|<\/span>)/);
  assert.match(html, /Scene/);
  assert.match(html, /Chapter/);
});
