import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const helper = resolve("scripts/install-flatpak.sh");
const newCommit = "a".repeat(64);
const oldCommit = "b".repeat(64);

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "ghoaxt-flatpak-test-"));
  try {
    copyFileSync(helper, join(dir, "install-flatpak.sh"));
    const bundle = "test bundle";
    writeFileSync(join(dir, "GhoaxtWriter-1.2.0-x86_64.flatpak"), bundle);
    const digest = createHash("sha256").update(bundle).digest("hex");
    writeFileSync(join(dir, "bundle-info"), `1.2.0\n${newCommit}\n${digest}\nGhoaxtWriter-1.2.0-x86_64.flatpak\n`);
    const fake = `#!/bin/sh
echo "$*" >> "$TEST_DIR/calls"
case "$1" in
  list)
    if [ "\${FAIL_LIST:-}" = yes ]; then echo "list failed" >&2; exit 1; fi
    if [ -f "$TEST_DIR/installed" ]; then printf 'dev.ghoaxtwriter.app\\tx86_64\\tstable\\n'; fi
    ;;
  info) cat "$TEST_DIR/installed";;
  install)
    if [ "\${FAIL_INSTALL:-}" = yes ]; then echo "install failed" >&2; exit 1; fi
    printf '%s\\n' "$NEW_COMMIT" > "$TEST_DIR/installed";;
  *) exit 2;;
esac
`;
    writeFileSync(join(dir, "flatpak"), fake);
    chmodSync(join(dir, "flatpak"), 0o755);
    const invoke = (args, env = {}) => spawnSync("sh", [join(dir, "install-flatpak.sh"), ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_DIR: dir, NEW_COMMIT: newCommit, ...env },
    });
    run({ dir, invoke });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("first installation and update use the chosen scope and verify the resulting commit", () => fixture(({ dir, invoke }) => {
  let result = invoke(["--user", "--yes"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(dir, "installed"), "utf8").trim(), newCommit);
  assert.match(readFileSync(join(dir, "calls"), "utf8"), /install --user --bundle --or-update --noninteractive --assumeyes/);
  writeFileSync(join(dir, "installed"), oldCommit);
  result = invoke(["--system"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, "calls"), "utf8"), /install --system --bundle --or-update/);
  writeFileSync(join(dir, "installed"), oldCommit);
  result = invoke(["--installation=extra", "--yes"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, "calls"), "utf8"), /install --installation=extra --bundle --or-update/);
}));

test("the same bundle is a successful no-op", () => fixture(({ dir, invoke }) => {
  writeFileSync(join(dir, "installed"), newCommit);
  const result = invoke(["--user"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already installed/);
  assert.doesNotMatch(readFileSync(join(dir, "calls"), "utf8"), /^install /m);
}));

test("corrupt bundles and invalid arguments do not invoke Flatpak", () => fixture(({ dir, invoke }) => {
  writeFileSync(join(dir, "GhoaxtWriter-1.2.0-x86_64.flatpak"), "corrupt");
  assert.notEqual(invoke(["--user"]).status, 0);
  assert.notEqual(invoke([]).status, 0);
  assert.notEqual(invoke(["--installation=../bad"]).status, 0);
  assert.throws(() => readFileSync(join(dir, "calls")));
}));

test("Flatpak failures are reported without claiming success", () => fixture(({ invoke }) => {
  const listFailure = invoke(["--user"], { FAIL_LIST: "yes" });
  assert.notEqual(listFailure.status, 0);
  assert.match(listFailure.stderr, /list failed/);
  const installFailure = invoke(["--user"], { FAIL_INSTALL: "yes" });
  assert.notEqual(installFailure.status, 0);
  assert.match(installFailure.stderr, /install failed/);
  assert.doesNotMatch(installFailure.stdout, /installed successfully/);
}));

test("packager includes an executable helper and the bundle's exact digest and commit", () => fixture(({ dir }) => {
  const refs = join(dir, "repo", "refs", "heads", "app", "dev.ghoaxtwriter.app", "x86_64");
  mkdirSync(refs, { recursive: true });
  writeFileSync(join(refs, "stable"), `${newCommit}\n`);
  const bundle = join(dir, "GhoaxtWriter-1.2.0-x86_64.flatpak");
  const archive = join(dir, "installer.tar");
  const result = spawnSync("python3", [resolve("scripts/package-flatpak-installer.py"), bundle, join(dir, "repo"), "1.2.0", archive], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const extracted = join(dir, "extracted");
  mkdirSync(extracted);
  const unpack = spawnSync("tar", ["xf", archive, "-C", extracted], { encoding: "utf8" });
  assert.equal(unpack.status, 0, unpack.stderr);
  assert.equal(statSync(join(extracted, "install-flatpak.sh")).mode & 0o777, 0o755);
  const digest = createHash("sha256").update(readFileSync(bundle)).digest("hex");
  assert.equal(readFileSync(join(extracted, "bundle-info"), "utf8"), `1.2.0\n${newCommit}\n${digest}\nGhoaxtWriter-1.2.0-x86_64.flatpak\n`);
}));
