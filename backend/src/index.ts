import { BackendApplication } from './application.js';

const application = new BackendApplication();
application.start();

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 5_000);
    timeout.unref();
    void application.stop().then(() => {
      clearTimeout(timeout);
      process.exit(0);
    }).catch(error => {
      console.error('[api] shutdown failed', error);
      process.exit(1);
    });
  });
}
