#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || { [ "$#" -eq 2 ] && [ "$2" != "--yes" ]; }; then
  echo "Usage: ./install-flatpak.sh --user|--system|--installation=NAME [--yes]" >&2
  echo "Choose the same installation scope as your existing GhoaxtWriter Flatpak." >&2
  exit 2
fi

scope=$1
case "$scope" in
  --user|--system) ;;
  --installation=*)
    installation=${scope#--installation=}
    case "$installation" in ''|*[!0-9A-Za-z._-]*) echo "Invalid installation name." >&2; exit 2;; esac
    ;;
  *) echo "Choose --user, --system, or --installation=NAME." >&2; exit 2;;
esac
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
info="$dir/bundle-info"
if [ ! -f "$info" ]; then
  echo "Missing bundle-info; extract the complete installer archive." >&2
  exit 1
fi

version=$(sed -n '1p' "$info")
commit=$(sed -n '2p' "$info")
digest=$(sed -n '3p' "$info")
bundle_name=$(sed -n '4p' "$info")
case "$version" in ''|*[!0-9A-Za-z.+_-]*) echo "Invalid bundle version." >&2; exit 1;; esac
case "$commit" in ''|*[!0-9a-f]*) echo "Invalid bundle commit." >&2; exit 1;; esac
case "$digest" in ''|*[!0-9a-f]*) echo "Invalid bundle checksum." >&2; exit 1;; esac
if [ "${#commit}" -ne 64 ] || [ "${#digest}" -ne 64 ] || [ "$bundle_name" != "GhoaxtWriter-$version-x86_64.flatpak" ]; then
  echo "Invalid bundle metadata." >&2
  exit 1
fi
bundle="$dir/$bundle_name"
if [ ! -f "$bundle" ]; then
  echo "Missing $bundle_name; extract the complete installer archive." >&2
  exit 1
fi
actual=$(sha256sum "$bundle")
actual=${actual%% *}
if [ "$actual" != "$digest" ]; then
  echo "Bundle checksum does not match; download the installer again." >&2
  exit 1
fi

ref=app/dev.ghoaxtwriter.app/x86_64/stable
installed=$(flatpak list "$scope" --app --columns=application,arch,branch)
if printf '%s\n' "$installed" | awk -F '\t' '$1 == "dev.ghoaxtwriter.app" && $2 == "x86_64" && $3 == "stable" { found = 1 } END { exit !found }'; then
  current=$(flatpak info "$scope" --show-commit "$ref")
  if [ "$current" = "$commit" ]; then
    echo "GhoaxtWriter $version is already installed in $scope."
    exit 0
  fi
fi

echo "Close all running GhoaxtWriter windows before updating."
echo "Installing GhoaxtWriter $version into $scope. Installing an older archive can downgrade the app."
if [ "$#" -eq 2 ]; then
  flatpak install "$scope" --bundle --or-update --noninteractive --assumeyes "$bundle"
else
  flatpak install "$scope" --bundle --or-update "$bundle"
fi
current=$(flatpak info "$scope" --show-commit "$ref")
if [ "$current" != "$commit" ]; then
  echo "Installation finished, but the installed commit does not match the bundle." >&2
  exit 1
fi
echo "GhoaxtWriter $version installed successfully. Restart the app to use it."
