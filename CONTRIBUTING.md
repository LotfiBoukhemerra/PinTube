# Contributing to PinTube

Thanks for helping! Bug reports, translations and pull requests are all welcome.

## Getting started

```bash
cd extension
npm install
npm run dev          # Chrome with hot reload (npm run dev:firefox for Firefox)
```

No backend is needed: the extension runs fully locally.

Before opening a pull request:

```bash
npm run format       # format the code with Prettier
npm run check        # type-check, unit tests and formatting, as CI does
```

## Adding a translation (the easiest way to contribute)

1. Copy `extension/src/i18n/locales/en.ts` to `extension/src/i18n/locales/<code>.ts` (for example `fr.ts`).
2. Translate every value. Keep placeholders such as `{time}` unchanged; a test checks this.
3. Register the language in `extension/src/i18n/index.ts` (`LOCALES`), with its native name and text direction.
4. Optional: add `extension/public/_locales/<code>/messages.json` for the store listing.

TypeScript reports any missing or misspelled key.

## Guidelines

- **Privacy first.** Never add analytics, trackers or remote code, and never ask for permissions that are not strictly needed.
- **No `innerHTML` in the content script.** YouTube enforces Trusted Types; build DOM nodes instead (see `src/content/dom.ts`).
- **YouTube selectors live in one file** (`src/content/youtube-page.ts`). If YouTube changes its markup, that is usually the only file to fix.
- Match the surrounding code style and keep changes focused.

## Security

Please report vulnerabilities privately, not in a public issue: see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
