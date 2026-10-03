import assert from "node:assert/strict";
import test from "node:test";
import { BESTCROW_PROGRAM_ADDRESS, CampaignStatus, type Campaign } from "@bestcrow/client";
import { BackendConfig } from "../src/config.js";
import { SolanaGateway, type CampaignRecord } from "../src/chain.js";
import { KeeperService } from "../src/keeper.js";

const alternateProgram = "So11111111111111111111111111111111111111112";
const campaignAddress = "11111111111111111111111111111111";

test("configuration reads validated environment overrides", () => {
  const config = BackendConfig.fromEnv({
    RPC_URL: "http://127.0.0.1:8899",
    PORT: "4001",
    POLL_MS: "0",
    MAX_BODY_BYTES: "32768",
    STAGEGATE_PROGRAM_ID: alternateProgram,
    USDC_MINTS: campaignAddress,
  });
  assert.equal(config.rpcUrl, "http://127.0.0.1:8899");
  assert.equal(config.port, 4001);
  assert.equal(config.pollMs, 0);
  assert.equal(config.maxBodyBytes, 32768);
  assert.equal(config.stagegateProgramId, alternateProgram);
  assert.equal(config.acceptsUsdcMint(campaignAddress), true);
});

test("default program ID matches the Rust Anchor declaration", () => {
  const declaredId = "EousWVK2cePYb9zvv1oWSca4VNdRQqYef8CsxQ6BL57R";
  assert.equal(BackendConfig.fromEnv({}).stagegateProgramId, declaredId);
  assert.equal(BESTCROW_PROGRAM_ADDRESS, declaredId);
});

test("configuration rejects malformed operational values", () => {
  assert.throws(() => BackendConfig.fromEnv({ PORT: "3001xyz" }), /PORT/);
  assert.throws(() => BackendConfig.fromEnv({ KEEPER_AUTOSEND: "yes" }), /KEEPER_AUTOSEND/);
  assert.throws(() => BackendConfig.fromEnv({ USDC_MINTS: `${campaignAddress},${campaignAddress}` }), /USDC_MINTS/);
});

test("keeper unsigned instruction uses the configured program address", async () => {
  const config = BackendConfig.fromEnv({ STAGEGATE_PROGRAM_ID: alternateProgram });
  const keeper = new KeeperService(config, new SolanaGateway(config));
  const record: CampaignRecord = { address: campaignAddress, account: { status: CampaignStatus.Funding } as Campaign };
  const result = await keeper.unsignedAction(record, {
    kind: "finalize_funding",
    campaign: campaignAddress,
    reason: "test",
  }, campaignAddress);
  assert.equal(result.instructions[0]?.programId, alternateProgram);
});
