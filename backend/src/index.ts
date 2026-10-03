import { config } from './config.js';
import { createServer } from './api/server.js';
import { Store } from './db/index.js';
import { Indexer } from './solana/indexer.js';

function main(): void {
  const store = new Store(config.dbPath);
  const indexer = new Indexer(
    store,
    config.indexer.pollIntervalMs,
    config.indexer.signatureScanLimit,
  );
  const app = createServer(store);
  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port} (${config.cluster})`);
    console.log(`[api] program ${config.programId}`);
    console.log(`[db]  ${config.dbPath}`);
  });

  if (config.indexer.enabled) {
    indexer.start();
    console.log(`[indexer] polling every ${config.indexer.pollIntervalMs}ms`);
  } else {
    console.log('[indexer] disabled (INDEXER_ENABLED=false)');
  }

  const shutdown = (signal: string): void => {
    console.log(`\n[app] ${signal} received, shutting down`);
    indexer.stop();
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
