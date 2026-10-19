# PinTube extension

Source code of the PinTube browser extension (WXT, React, TypeScript, Manifest V3). See the [project README](../README.md) for an overview.

## Build from source

Requirements: Node.js 22 or later and npm. Any operating system works.

```bash
npm ci
npm run build:firefox     # or build:chrome, build:edge, build:opera, build:all
```

The unpacked extension is written to `.output/<browser>-mv3`, and `npm run zip:all` writes the store packages to `.output/`. No step downloads code at build time other than the npm packages pinned in `package-lock.json`, and the build output is not obfuscated: it is bundled and minified by Vite.

## Layout

| Folder             | What it holds                                                                          |
| ------------------ | -------------------------------------------------------------------------------------- |
| `src/entrypoints/` | Entry points: background worker, YouTube content script, popup, library page (options) |
| `src/content/`     | Everything that runs on YouTube. All YouTube selectors live in `youtube-page.ts`       |
| `src/storage/`     | The library in `browser.storage.local`: one key per record, last-write-wins merge      |
| `src/services/`    | Backup export and import, Markdown export of notes                                     |
| `src/messaging/`   | Typed messages between the popup, the YouTube tab and the background worker            |
| `src/ui/`          | React pages and their styles                                                           |
| `src/i18n/`        | Interface translations (English, Arabic, Spanish)                                      |
| `src/shared/`      | Types and helpers used everywhere                                                      |
