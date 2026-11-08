import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
after(() => server.close());
const { DATE_FORMATS, DEFAULT_DATE_FORMAT, formatDate, parseDate, localDateKey } = await server.ssrLoadModule("/src/shared/dates.ts");
const { defaultPrefs } = await server.ssrLoadModule("/src/mainview/prefs.ts");

test("all date formats round-trip without reversing days and months", () => {
  const expected = ["09/11/2026", "11/09/2026", "2026/11/09", "2026/09/11"];
  assert.equal(DEFAULT_DATE_FORMAT, "DD/MM/YYYY");
  assert.equal(defaultPrefs.dateFormat, "DD/MM/YYYY");
  DATE_FORMATS.forEach((format, index) => {
    assert.equal(formatDate("2026-11-09", format), expected[index]);
    assert.equal(parseDate(expected[index], format), "2026-11-09");
  });
  assert.equal(localDateKey(new Date(2026, 10, 9)), "2026-11-09");
});

test("invalid dates and incomplete dates are rejected, including leap-year errors", () => {
  for (const date of ["31/04/2026", "29/02/2025", "00/01/2026", "01/13/2026", "1/01/2026", "01/01/0000", ""]) {
    assert.equal(parseDate(date, "DD/MM/YYYY"), null);
  }
  assert.equal(parseDate("29/02/2024", "DD/MM/YYYY"), "2024-02-29");
  assert.equal(parseDate("29/02/1900", "DD/MM/YYYY"), null);
});
