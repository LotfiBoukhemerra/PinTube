import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { listen, type BackgroundApi } from '../messaging/protocol';

/**
 * The worker only wakes up for the two events below and goes back to sleep
 * right after: no timers, no alarms and no storage listeners, so PinTube
 * costs nothing in the background.
 */
export default defineBackground(() => {
  listen<BackgroundApi>({
    'ui.openLibrary': () => browser.runtime.openOptionsPage(),
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });
});
