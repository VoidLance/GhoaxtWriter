import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
after(() => server.close());

const { GoalsDialog } = await server.ssrLoadModule("/src/mainview/GoalsDialog.tsx");
const { remapGoalPaths } = await server.ssrLoadModule("/src/mainview/goals.ts");

test("goal dates use the selected display format without a calendar indicator", () => {
  const html = renderToStaticMarkup(React.createElement(GoalsDialog, {
    goals: { overall: { target: 1000, start: "2026-01-02", end: "2026-12-31" } },
    totalWords: 0,
    todayWords: 0,
    wordsAtStartOfToday: 0,
    history: {},
    dateFormat: "DD/MM/YYYY",
    entries: [],
    onSave: () => {},
    onClose: () => {},
  }));
  const dates = html.match(/<input type="text"[^>]*>/g) ?? [];
  assert.equal(dates.length, 2);
  assert.match(dates[0], /value="02\/01\/2026"/);
  assert.match(dates[1], /value="31\/12\/2026"/);
  assert.match(html, /Enter dates in DD\/MM\/YYYY format/);
  assert.match(html, /To finish by 31\/12\/2026/);
});

test("goal dates and projections use an alternate selected format", () => {
  const html = renderToStaticMarkup(React.createElement(GoalsDialog, {
    goals: { overall: { target: 1000, start: "2026-01-02", end: "2030-12-31" } },
    totalWords: 0,
    todayWords: 0,
    wordsAtStartOfToday: 0,
    history: {},
    dateFormat: "YYYY/DD/MM",
    entries: [],
    onSave: () => {},
    onClose: () => {},
  }));
  assert.match(html, /value="2026\/02\/01"/);
  assert.match(html, /value="2030\/31\/12"/);
  assert.match(html, /To finish by 2030\/31\/12/);
});

test("the goals dialog shows stored chapter and scene targets", () => {
  const html = renderToStaticMarkup(React.createElement(GoalsDialog, {
    goals: { chapters: { Chapter: 5000, "Chapter/Scene.md": 800 } },
    totalWords: 120,
    todayWords: 0,
    wordsAtStartOfToday: 120,
    history: {},
    dateFormat: "DD/MM/YYYY",
    entries: [
      { path: "Chapter", name: "Chapter", words: 120, depth: 0, type: "dir" },
      { path: "Chapter/Scene.md", name: "Scene.md", words: 120, depth: 1, type: "file" },
    ],
    onSave: () => {},
    onClose: () => {},
  }));
  assert.match(html, /aria-label="Word goal for Chapter"[^>]*value="5000"/);
  assert.match(html, /aria-label="Word goal for Chapter\/Scene.md"[^>]*value="800"/);
});

test("renaming, moving and deleting entries maintains scene and folder goal paths", () => {
  const goals = { chapters: { "Chapter": 5000, "Chapter/Scene.md": 800, "Chapter 2/Scene.md": 300 } };
  assert.deepEqual(remapGoalPaths(goals, "Chapter/Scene.md", "Chapter 2/Scene.md").chapters, {
    "Chapter": 5000, "Chapter 2/Scene.md": 800,
  });
  assert.deepEqual(remapGoalPaths(goals, "Chapter", "Act/Chapter").chapters, {
    "Act/Chapter": 5000, "Act/Chapter/Scene.md": 800, "Chapter 2/Scene.md": 300,
  });
  assert.deepEqual(remapGoalPaths(goals, "Chapter", null).chapters, { "Chapter 2/Scene.md": 300 });
  assert.equal(remapGoalPaths(goals, "Other", null), goals);
});
