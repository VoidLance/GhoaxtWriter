import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFileSync } from "node:fs";

const packageInfo = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => server.close());
const { InstallationDetails } = await server.ssrLoadModule("/src/mainview/InstallationDetails.tsx");
const render = (info, error = "") => renderToStaticMarkup(React.createElement(InstallationDetails, { version: packageInfo.version, info, error }));

test("installation details identify the editor and backend versions", () => {
  const html = render({ version: packageInfo.version, packaging: "Flatpak" });
  assert.match(html, new RegExp(`Version ${packageInfo.version.replaceAll(".", "\\.")}`));
  assert.match(html, /Installation: Flatpak/);
  assert.doesNotMatch(html, /different versions/);
});

test("installation details warn about mismatched or unavailable backends", () => {
  assert.match(render({ version: "0.0.0", packaging: "native" }), /different versions/);
  assert.match(render(null, "Installation details unavailable."), /Installation details unavailable/);
});
