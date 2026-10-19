import { defineContentScript } from 'wxt/utils/define-content-script';
import { PinTubeController } from '../content/controller';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    await new PinTubeController(ctx).start();
  },
});
