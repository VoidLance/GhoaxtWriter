#!/usr/bin/env python3
"""Package a Flatpak bundle and its install-or-update helper."""
import hashlib
import io
import pathlib
import re
import sys
import tarfile


def package(bundle: pathlib.Path, repo: pathlib.Path, version: str, output: pathlib.Path) -> None:
    if not re.fullmatch(r"[0-9A-Za-z.+_-]+", version):
        raise ValueError("Invalid version")
    if bundle.name != f"GhoaxtWriter-{version}-x86_64.flatpak":
        raise ValueError("Bundle name does not match version")
    commit = (repo / "refs/heads/app/dev.ghoaxtwriter.app/x86_64/stable").read_text().strip()
    if not re.fullmatch(r"[0-9a-f]{64}", commit):
        raise ValueError("Invalid Flatpak commit")
    digest_hash = hashlib.sha256()
    with bundle.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest_hash.update(chunk)
    digest = digest_hash.hexdigest()
    info = f"{version}\n{commit}\n{digest}\n{bundle.name}\n".encode()
    helper = pathlib.Path(__file__).with_name("install-flatpak.sh")
    with tarfile.open(output, "w") as archive:
        archive.add(bundle, arcname=bundle.name)
        entry = archive.gettarinfo(str(helper), arcname="install-flatpak.sh")
        entry.mode = 0o755
        with helper.open("rb") as source:
            archive.addfile(entry, source)
        entry = tarfile.TarInfo("bundle-info")
        entry.size = len(info)
        entry.mode = 0o644
        archive.addfile(entry, io.BytesIO(info))


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit("Usage: package-flatpak-installer.py BUNDLE REPO VERSION OUTPUT")
    package(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3], pathlib.Path(sys.argv[4]))
