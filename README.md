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

Generated covers are drawn entirely from code-made vector shapes; no third-party artwork is bundled.

## Installation (Linux x64)

1. Download `linux-x64-GhoaxtWriter-Setup.tar.gz` from the [latest release](https://github.com/VoidLance/GhoaxtWriter/releases).
2. Extract and run the installer:

   ```bash
   tar xzf linux-x64-GhoaxtWriter-Setup.tar.gz
   ./installer
   ```

3. The installer places the app in `~/.local/share/` and creates a desktop shortcut. Launch GhoaxtWriter from your application menu.

## Installation (Flatpak)

Download `GhoaxtWriter-<version>-x86_64.flatpak` from the release, then:

```bash
flatpak install --user GhoaxtWriter-1.0.0-x86_64.flatpak
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
