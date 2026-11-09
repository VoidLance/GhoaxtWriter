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

4. The installer places the app in `~/.local/share/` and creates a desktop shortcut. Launch GhoaxtWriter from your application menu.

When installing a local build, use the `installer` extracted from the newly generated `artifacts/linux-x64-GhoaxtWriter-Setup.tar.gz`. An older, separately extracted `installer` may install an outdated build or desktop shortcut.

If the app does not open, launch it from a terminal to see any errors:

```bash
~/.local/share/dev.ghoaxtwriter.app/stable/app/bin/launcher
```

In particular, a missing `libayatana-appindicator3.so.1` means the Ayatana AppIndicator runtime is not installed. The app uses a bundled Chromium renderer; changing your default browser does not replace it.

## Installation (Flatpak)

Download `GhoaxtWriter-<version>-x86_64.flatpak` from the release, then:

```bash
flatpak install --user GhoaxtWriter-1.2.0-x86_64.flatpak
flatpak run dev.ghoaxtwriter.app
```

The Flatpak needs the GNOME 50 runtime (installed automatically from Flathub if the Flathub remote is configured). Don't run it at the same time as the installer version; they share the same profile and local port.

## Installation (Windows x64)

1. Download `win-x64-GhoaxtWriter-Setup.zip` from the [latest release](https://github.com/VoidLance/GhoaxtWriter/releases).
2. Extract the zip and run `GhoaxtWriter-Setup.exe`.
3. The app is not code-signed, so Windows SmartScreen may warn you. Choose **More info**, then **Run anyway**.

## Installation (macOS, Apple Silicon)

1. Download `macos-arm64-GhoaxtWriter.dmg` from the [latest release](https://github.com/VoidLance/GhoaxtWriter/releases).
2. Open the disk image and drag GhoaxtWriter into Applications.
3. The app is not code-signed, so the first time, right-click it and choose **Open**, then confirm.

## License

No license has been chosen yet; all rights reserved unless stated otherwise.
