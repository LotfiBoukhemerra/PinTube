# Security policy

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub instead: open the **Security** tab of this repository and choose **Report a vulnerability**. You will get an answer as soon as possible, and credit in the release notes if you wish.

Only the latest released version receives fixes.

## Scope

PinTube runs entirely in the browser and has no server. The parts worth looking at are:

- the content script on `youtube.com` (`extension/src/content/`), which reads the page and draws the player buttons and notifications;
- backup import (`extension/src/services/backup.ts`), which reads a file chosen by the user;
- messaging between the popup, the YouTube tab and the background worker (`extension/src/messaging/protocol.ts`).
