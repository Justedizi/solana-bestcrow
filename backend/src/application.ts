import type { Server } from 'node:http';
import { config } from './config.js';
import { BackendServer } from './api/server.js';
import { Store } from './db/index.js';
import { Indexer } from './solana/indexer.js';

export class BackendApplication {
  public readonly store: Store;
  public readonly server: BackendServer;
  private readonly indexer: Indexer;
  private httpServer?: Server;

  public constructor() {
    this.store = new Store(config.dbPath);
    this.server = new BackendServer(this.store);
    this.indexer = new Indexer(this.store, config.indexer.pollIntervalMs, config.indexer.signatureScanLimit);
  }

  public start(): void {
    if (this.httpServer) throw new Error('Backend is already running');
    this.httpServer = this.server.app.listen(config.port, () => {
      console.log(`[api] http://localhost:${config.port} (${config.cluster})`);
      console.log(`[chain] program ${config.programId}`);
      console.log(`[db] ${config.dbPath}`);
    });
    if (config.indexer.enabled) this.indexer.start();
  }

  public async stop(): Promise<void> {
    this.indexer.stop();
    if (this.httpServer) {
      const server = this.httpServer;
      this.httpServer = undefined;
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    this.store.close();
  }
}
