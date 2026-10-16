# GhoaxtWriter

A distraction-free, novel-first desktop writing app. Your work is stored as plain Markdown files in a local workspace folder, organised as shelves, novels, acts, chapters and scenes.

## Features

- Single-panel live Markdown editor with focus mode, typewriter scrolling, vim keys and customisable shortcuts
- Library with shelves per author, novel metadata and generated covers (10 templates, 12 palettes, or import your own image)
- Planning, Elements (`[[links]]`) and Research tabs
- Word-count goals, per-chapter and per-scene word counts
- Import manuscripts (docx, odt, html, epub, rtf, pdf, plain text)
- Export drafts to PDF, or compose an email draft
- Typography and manuscript formatting controls

Generated covers are drawn entirely from code-made vector shapes; no third-party artwork is bundled.

## Installation (Linux x64)

1. Download `linux-x64-GhoaxtWriter-Setup.tar.gz` from the [latest release](https://github.com/VoidLance/GhoaxtWriter/releases).
2. Extract and run the installer:

   ```bash
   tar xzf linux-x64-GhoaxtWriter-Setup.tar.gz
   ./installer
   ```

3. The installer places the app in `~/.local/share/` and creates a desktop shortcut. Launch GhoaxtWriter from your application menu.

## Building from source

Requires Hutch (the Electrobun toolchain used by this project).

```bash
hutch run install        # install dependencies
hutch run dev:hmr        # development with hot reload
hutch run build          # production build, output in artifacts/
```

## License

No license has been chosen yet; all rights reserved unless stated otherwise.
