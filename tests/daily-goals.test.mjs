import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
after(() => server.close());

const { dailyTarget, addDays, todayKey } = await server.ssrLoadModule("/src/mainview/goals.ts");
const { GoalsDialog } = await server.ssrLoadModule("/src/mainview/GoalsDialog.tsx");

test("automatic daily goal subtracts existing manuscript words and includes today and the deadline", () => {
  const goals = { overall: { target: 80000, start: "2026-01-01", end: "2026-11-17" } };
  assert.deepEqual(dailyTarget(goals, 30000, "2026-11-08"), { words: 5000, auto: true, daysLeft: 10 });
  assert.equal(dailyTarget(goals, 79999, "2026-11-17").words, 1);
  assert.equal(dailyTarget(goals, 80000, "2026-11-17").words, 0);
  assert.equal(dailyTarget(goals, 90000, "2026-11-18").words, 0);
  assert.equal(dailyTarget({ ...goals, daily: 1000 }, 30000, "2026-11-08").words, 1000);
});

test("dialog accounts for words written today without changing today's target", () => {
  const today = todayKey();
  const html = renderToStaticMarkup(React.createElement(GoalsDialog, {
    goals: { overall: { target: 80000, start: today, end: addDays(today, 9) } },
    totalWords: 31200,
    todayWords: 1200,
    wordsAtStartOfToday: 30000,
    history: {},
    dateFormat: "DD/MM/YYYY",
    entries: [],
    onSave: () => {},
    onClose: () => {},
  }));
  assert.match(html, /5,000 words a day/);
  assert.match(html, /48,800 words left in the novel/);
  assert.match(html, /3,800 left towards today&#x27;s goal/);
});
