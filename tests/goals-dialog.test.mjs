import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
after(() => server.close());

const { GoalsDialog } = await server.ssrLoadModule("/src/mainview/GoalsDialog.tsx");

test("goal dates remain editable date fields without a misleading calendar indicator", async () => {
  const html = renderToStaticMarkup(React.createElement(GoalsDialog, {
    goals: { overall: { target: 1000, start: "2026-01-02", end: "2026-12-31" } },
    totalWords: 0,
    todayWords: 0,
    wordsAtStartOfToday: 0,
    history: {},
    chapters: [],
    onSave: () => {},
    onClose: () => {},
  }));
  const dates = html.match(/<input type="date"[^>]*>/g) ?? [];
  assert.equal(dates.length, 2);
  assert.ok(dates.every((input) => input.includes("goal-date")));
  assert.match(dates[0], /value="2026-01-02"/);
  assert.match(dates[1], /value="2026-12-31"/);
  assert.match(html, /Enter dates using the keyboard/);

  const css = await readFile(new URL("../src/mainview/index.css", import.meta.url), "utf8");
  assert.match(css, /\.goal-date::-webkit-calendar-picker-indicator\s*\{\s*display:\s*none\s*;/);
});
