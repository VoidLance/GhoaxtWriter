# GhoaxtWriter

A distraction-free, novel-first desktop writing app. Your work is stored as plain Markdown files in a local workspace folder, organised as shelves, novels, acts, chapters and scenes.

This may seem similar to other tools you are aware of, and that is by design. My thought process behind making this app was: I absolutely love NEO by Hugh Howey, and it is *almost* exactly what I want out of a writing app. Besides the fact the local manuscript files are .html and not markdown, and its use of AI. I also love LivingWriter which has been my software of choice for years, but again, not keen on the AI features and really don't like the lack of local files at all. Obsidian is fantastic, especially for compiling research notes together with the manuscript and having everything all in one place, but even with the best plugins for novel writing, it just doesn't make me want to write. So GhoaxtWriter was born (named such because I'm fairly sure GhostWriter had been taken) as a markdown-based manuscript editor that makes me want to write as much as NEO and LivingWriter do, but with the convenience that markdown offers and the ability to seamlessly integrate with Obsidian (when you start the app, choose a folder in your Obsidian vault as the workspace and from then on, you can work in either app as you wish.)

## Features

- Single-panel live Markdown editor with focus mode, typewriter scrolling, vim keys and customisable shortcuts
- Library with shelves per author, novel metadata and generated covers (10 templates, 12 palettes, or import your own image)
- Planning, Elements (`[[links]]`) and Research tabs
- Word-count goals, per-chapter and per-scene word counts
- Import manuscripts (docx, odt, html, epub, rtf, pdf, plain text)
- Export drafts to PDF and quickly email them to yourself
- Typography and manuscript formatting controls including automatic drop caps

Use Ctrl+Shift+Enter to start a new poetry paragraph. The shortcut can be changed in the keyboard shortcuts dialog; Ctrl+Alt+P still toggles poetry formatting on the current paragraph.

In a scene, consecutive Enter presses insert a new line, then a `***` scene break, then a new chapter. The third press replaces that newly inserted break and moves the remaining text in the current scene to the new chapter; other scene files remain where they are. Shift+Enter always inserts an ordinary line. Consecutive Enter shortcuts are disabled inside poetry and fenced code blocks.

Default `Chapter N` folders are numbered in manuscript order, including across acts, without renaming the folders. Right-click a chapter and choose **Chapter settings** to add a title, toggle automatic numbering, or assign a built-in or custom role. Renaming a chapter to a custom name makes it a named chapter. Novel settings control whether numbers and titles appear in chapter headings and PDF drafts.

The manuscript sidebar has buttons at the top and bottom for adding front or back matter. Novel settings let you edit the roles and templates, including Markdown and the `{{title}}`, `{{author}}`, and `{{year}}` placeholders. A contents template generates a Markdown file whose marked list is refreshed when the manuscript tree is loaded and before PDF export. The file is read-only in the app; text outside the marked list can be edited in another Markdown editor. Changes made outside GhoaxtWriter are reflected the next time the tree is refreshed or the novel is reopened.

Generated covers are drawn entirely from code-made vector shapes; no third-party artwork is bundled.

Dates default to `DD/MM/YYYY`. Choose a different date format in Settings → Display; it applies to goal dates and exported draft dates. PDF filenames use hyphens instead of slashes.

Automatic daily word goals use the remaining words at the first count of the day and the days left through the deadline. Words added today count towards that daily goal; the goals dialog shows both today's remaining words and the remaining novel total.

## Installation (Linux x64)

1. Install the Linux desktop runtime dependencies. On Arch Linux and CachyOS:

   ```bash
   sudo pacman -S gtk3 webkit2gtk-4.1 libayatana-appindicator librsvg
   ```

   Other distributions need the corresponding GTK 3, WebKitGTK 4.1, Ayatana AppIndicator and librsvg runtime packages.
2. Download `linux-x64-GhoaxtWriter-Setup.tar.gz` from the [latest release](https://github.com/VoidLance/GhoaxtWriter/releases).
3. Extract and run the installer:

   ```bash
   tar xzf linux-x64-GhoaxtWriter-Setup.tar.gz
   ./installer
   ```

4. The installer places the app in `~/.local/share/` and creates a desktop shortcut. Launch GhoaxtWriter from your application menu. To update a native installation, close GhoaxtWriter and run the installer from the new release; your workspace files are not part of the application installation.

When installing a local build, use the `installer` extracted from the newly generated `artifacts/linux-x64-GhoaxtWriter-Setup.tar.gz`. An older, separately extracted `installer` may install an outdated build or desktop shortcut.

If the app does not open, launch it from a terminal to see any errors:

```bash
~/.local/share/dev.ghoaxtwriter.app/stable/app/bin/launcher
```

In particular, a missing `libayatana-appindicator3.so.1` means the Ayatana AppIndicator runtime is not installed. The app uses a bundled Chromium renderer; changing your default browser does not replace it.

## Installation (Flatpak)

Download the `GhoaxtWriter-<version>-flatpak-installer.tar` archive alongside the standalone Flatpak, extract it, then choose the installation scope. To install or update a user installation (replace `VERSION` with the release version):

```bash
VERSION="<release-version>"
mkdir -p ghoaxtwriter-flatpak-installer
tar xf "GhoaxtWriter-$VERSION-flatpak-installer.tar" -C ghoaxtwriter-flatpak-installer
cd ghoaxtwriter-flatpak-installer
./install-flatpak.sh --user
flatpak run --user dev.ghoaxtwriter.app
```

For a system installation, use `./install-flatpak.sh --system` and `flatpak run --system dev.ghoaxtwriter.app` instead. A named system installation can use `--installation=NAME`. Check `flatpak list --app --columns=application,installation` to find the existing installation; updating the wrong scope creates a separate copy. The installer checks the bundle and handles both upgrades and re-running the same version. Close all GhoaxtWriter windows before updating and relaunch afterwards. Using an older installer archive can downgrade the application.

The installer archive was added to the updated 1.2.0 release; use the standalone `.flatpak` for earlier releases. It is also available for graphical installers. For a terminal update with that file, use `flatpak install --system --bundle --or-update GhoaxtWriter-1.2.0-x86_64.flatpak` (or `--user` for a user installation). Flatpak may report "already installed" if the exact same bundle is installed. For unattended installs using the archive, add `--yes` to accept Flatpak's prompts.

The Flatpak needs the GNOME 50 runtime (installed automatically from Flathub if the Flathub remote is configured). Its local bundle origin does not provide automatic updates: download each new release to update. The native and Flatpak versions are separate installations and may have separate menu shortcuts. Don't run them at the same time; they share a local port. If an old native shortcut opens an outdated copy, launch the Flatpak explicitly as above or update/remove the native installation.

The app was created for Linux first, and the flatpak is the recommended install method for the easiest process.

## Installation (Windows x64)

1. Download `win-x64-GhoaxtWriter-Setup.zip` from the [latest release](https://github.com/VoidLance/GhoaxtWriter/releases).
2. Extract the zip and run `GhoaxtWriter-Setup.exe`.
3. The app is not code-signed, so Windows SmartScreen may warn you. Choose **More info**, then **Run anyway**.

For an update, close the app and run the new release's setup executable; retain your workspace folder.

This app was not designed for Windows and may run into issues that aren't in the Linux version, but it is minimally tested and confirmed to work in Windows.

## Installation (macOS, Apple Silicon)

1. Download `macos-arm64-GhoaxtWriter.dmg` from the [latest release](https://github.com/VoidLance/GhoaxtWriter/releases).
2. Open the disk image and drag GhoaxtWriter into Applications.
3. The app is not code-signed, so the first time, right-click it and choose **Open**, then confirm.

To update, quit GhoaxtWriter and drag the new app into the same Applications folder, choosing **Replace** when prompted. Keep your workspace folder outside the app bundle.

In the updated 1.2.0 build and later, use **Help → About GhoaxtWriter** to check the editor version and installation type. If the editor and backend versions differ, close all copies and launch the intended installation again. Older builds display an incorrect version there; for Flatpak, use `flatpak run --system --command=sh dev.ghoaxtwriter.app -c 'cat /app/Resources/version.json'` (replace `--system` with `--user` as appropriate).

The Mac version is not tested.

## License

No license has been chosen yet; all rights reserved unless stated otherwise.
