#!/usr/bin/env python3
"""Turn the Hutch-generated Flatpak recipe into a bundle. Run after `hutch run build`.

Requires flatpak, org.flatpak.Builder and the org.gnome.Platform//50 + Sdk runtimes (Flathub).
GNOME is used because the native wrapper needs WebKitGTK 4.1; appindicator comes from Flathub shared-modules.
"""
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
app_dir = root / "artifacts" / "flatpak" / "dev.ghoaxtwriter.app-stable-x86_64"
version = json.loads((root / "package.json").read_text()).get("version", "1.0.0")
config = (root / "electrobun.config.ts").read_text()
for line in config.splitlines():
    if line.strip().startswith("version:"):
        version = line.split('"')[1]
        break

manifest_path = app_dir / "dev.ghoaxtwriter.app.json"
manifest = json.loads(manifest_path.read_text())
manifest["runtime"] = "org.gnome.Platform"
manifest["runtime-version"] = "50"
manifest["sdk"] = "org.gnome.Sdk"
if not any(m == "shared-modules/libayatana-appindicator/libayatana-appindicator-gtk3.json" for m in manifest["modules"]):
    manifest["modules"].insert(0, "shared-modules/libayatana-appindicator/libayatana-appindicator-gtk3.json")
manifest_path.write_text(json.dumps(manifest, indent=2))

shared = app_dir / "shared-modules"
if not shared.exists():
    subprocess.run(["git", "clone", "--depth", "1", "https://github.com/flathub/shared-modules.git", str(shared)], check=True)

run = lambda *args: subprocess.run(args, cwd=app_dir, check=True)
run("flatpak", "run", "org.flatpak.Builder", "--user", "--force-clean", "--repo=repo", "build-dir", manifest_path.name)
bundle = root / "artifacts" / f"GhoaxtWriter-{version}-x86_64.flatpak"
run("flatpak", "build-bundle", "repo", str(bundle), "dev.ghoaxtwriter.app", "stable")
print(bundle)
sys.exit(0)
