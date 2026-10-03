import { BackendConfig } from "./config.js";
import { SolanaGateway } from "./chain.js";
import { KeeperService } from "./keeper.js";
import { MetaDaoService } from "./metadao.js";
import { KeeperDispatcher } from "./dispatch.js";
import { ApiServer } from "./server.js";
import { MarketService } from "./market.js";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const config = BackendConfig.fromEnv();
const chain = new SolanaGateway(config);
const keeper = new KeeperService(config, chain);
const metaDao = new MetaDaoService(config, chain);
const market = new MarketService(chain);
const dispatcher = KeeperDispatcher.fromConfig(config, chain, keeper);
const server = new ApiServer(config, chain, keeper, metaDao, market, dispatcher);

await server.start();

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void server.stop().then(() => { process.exitCode = 0; }).catch((error: unknown) => {
      console.error("Backend shutdown failed", error);
      process.exitCode = 1;
    });
  });
}
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
