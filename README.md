# PinTube

Pin YouTube videos, save your progress and timestamped notes, organise them into courses, and pick up right where you left off.

**Open source and free.** Every feature is free with no limits, and your library never leaves your device. Cloud sync across devices is planned for a later release.

## Install

<table>
  <tr>
    <td align="center" width="110"><a href="https://chromewebstore.google.com/detail/eddmlpagibjhokgnnmamalopafighoeb"><img src=".github/readme/browsers/chrome.svg" width="40" height="40" alt="" /><br /><b>Chrome</b></a></td>
    <td align="center" width="110"><a href="https://addons.mozilla.org/addon/pintube/"><img src=".github/readme/browsers/firefox.svg" width="40" height="40" alt="" /><br /><b>Firefox</b></a></td>
    <td align="center" width="110"><a href="https://microsoftedge.microsoft.com/addons/detail/jkmhlladdejcmkkjokplgncagoekdomd"><img src=".github/readme/browsers/edge.svg" width="40" height="40" alt="" /><br /><b>Edge</b></a></td>
    <td align="center" width="110"><a href="https://chromewebstore.google.com/detail/eddmlpagibjhokgnnmamalopafighoeb"><img src=".github/readme/browsers/opera.svg" width="40" height="40" alt="" /><br /><b>Opera</b></a></td>
    <td align="center" width="110"><a href="https://chromewebstore.google.com/detail/eddmlpagibjhokgnnmamalopafighoeb"><img src=".github/readme/browsers/brave.svg" width="40" height="40" alt="" /><br /><b>Brave</b></a></td>
  </tr>
</table>

Opera and Brave install from the Chrome Web Store. Website: [pintube.app](https://pintube.app)

<sub>Browser logos from [alrra/browser-logos](https://github.com/alrra/browser-logos) (MIT).</sub>

## Repository

| Folder | What it is |
| --- | --- |
| [`extension/`](extension) | Browser extension (WXT + React + TypeScript, Manifest V3) for Chrome, Edge, Opera, Brave and Firefox |
| [`assets/`](assets) | Brand assets: the app icon and the pin in its filled and outline versions |

## Architecture

```
YouTube tab ── content script ──┐
  (pin + bookmark buttons,      │
   auto-save, resume prompt)    ▼
Popup / Library page ──► browser.storage.local
                          (one key per record)
background worker: opening the library, nothing else
```

- **Local-first.** Everything works offline. Each record lives under its own storage key so the YouTube tab, the popup and the library page never overwrite each other.
- **Light.** The background worker has no timers, alarms or storage listeners: it wakes to open the library and goes back to sleep. On YouTube, nothing is tracked until a video is pinned, and a pinned video is saved at most every 10 seconds.
- **Mergeable data.** Records are versioned (`updatedAt`) and soft-deleted, so two copies of a library merge with last-write-wins. Backup import uses this today; sync will build on it.
- **Privacy.** Minimal permissions (`storage`, `youtube.com`), no server, no analytics and no tracking. The only requests PinTube makes are for video thumbnails from YouTube's image server (`i.ytimg.com`), sent without a referrer.
- **Safe rendering.** Text from YouTube, from backups and from the user is only ever rendered as text: React on extension pages, `textContent` in a closed shadow root on YouTube (no `innerHTML`, which YouTube's Trusted Types forbid anyway). Imported backups are validated field by field (see `src/services/backup.ts`).

## Development

```bash
cd extension
npm install
npm run dev               # Chrome with hot reload (npm run dev:firefox for Firefox)
npm test                  # unit tests (storage, merge, backup, i18n)
npm run compile           # type-check
npm run format            # format with Prettier (npm run check runs everything CI runs)
npm run build:all         # unpacked builds in .output/<browser>-mv3
npm run zip:all           # store-ready zips in .output/
```

To try a build, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `extension/.output/chrome-mv3` (or the folder of your browser).

### Adding a language

1. Copy `extension/src/i18n/locales/en.ts` to `<code>.ts` and translate it. TypeScript flags any missing key.
2. Register it in `extension/src/i18n/index.ts` (`LOCALES`).
3. Optionally add `extension/public/_locales/<code>/messages.json` for the store listing.

## Support the project

PinTube is built by an independent developer. If it helps you, you can support its development:

- [Ko-fi](https://ko-fi.com/lotfibkmr)
- [PayPal](https://www.paypal.com/paypalme/LotfiBoukhemerra)

## Contributing

Translations, bug reports and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Code: [GNU AGPL-3.0](LICENSE). The PinTube name and logo are not covered by the license: see [TRADEMARKS.md](TRADEMARKS.md).
