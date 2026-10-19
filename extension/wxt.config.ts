import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Explicit imports everywhere: easier to read and to follow for new contributors.
  imports: false,
  // One code base, Manifest V3 for every browser (Chrome, Edge, Opera, Brave, Firefox).
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    short_name: 'PinTube',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // Keep permissions minimal: they are shown to users and reviewed by the stores.
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['https://www.youtube.com/*'],
    action: {
      default_title: 'PinTube',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'pintube@pintube.app',
              // 142 = first version supporting data_collection_permissions.
              strict_min_version: '142.0',
              // The library never leaves the device.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
