import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
after(() => server.close());
const { insertPoetryParagraph } = await server.ssrLoadModule("/src/mainview/poetry.ts");

test("a new poetry paragraph preserves text on both sides of the caret", () => {
  assert.deepEqual(insertPoetryParagraph(["before after", "next"], 0, 7, 7), {
    lines: ["before ", "::: poetry", "after", ":::", "next"],
    line: 2,
  });
});

test("a selection is replaced and the new paragraph is inside the block", () => {
  assert.deepEqual(insertPoetryParagraph(["abcXYZdef"], 0, 3, 6), {
    lines: ["abc", "::: poetry", "def", ":::"],
    line: 2,
  });
});

test("a new paragraph inside poetry does not nest markers", () => {
  assert.deepEqual(insertPoetryParagraph(["::: poetry", "one two", ":::"], 1, 4, 4), {
    lines: ["::: poetry", "one ", "two", ":::"],
    line: 2,
  });
});

test("poetry markers stay intact when starting on a marker", () => {
  assert.deepEqual(insertPoetryParagraph(["::: poetry", "one", ":::"], 0, 10, 10), {
    lines: ["::: poetry", "", "one", ":::"],
    line: 1,
  });
  assert.deepEqual(insertPoetryParagraph(["::: poetry", "one", ":::"], 2, 3, 3), {
    lines: ["::: poetry", "one", ":::", "::: poetry", "", ":::"],
    line: 4,
  });
});

test("code fences cannot be accidentally changed into poetry", () => {
  assert.equal(insertPoetryParagraph(["```", "code", "```"], 1, 4, 4), null);
});
