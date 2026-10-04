import { web3 } from '@anchor-lang/core';
import {
  deriveConfigPda,
  explorerAddress,
  explorerTransaction,
  loadDevnetContext,
  option,
  parseArgs,
  printJson,
  updateEvidenceFile,
  verifyDeployedUpgradeableProgram,
} from './devnet-v2-common.js';

const { PublicKey, SystemProgram } = web3;

function usage(): never {
  console.error(`Usage:
  npm run devnet:init-config -- --treasury <PUBLIC_KEY> [options]

Options:
  --rpc <URL>                    Devnet RPC URL
  --wallet <PATH>                upgrade-authority keypair
  --idl <PATH>                   generated IDL (default: target/idl/charity_vault.json)
  --program-id <PUBLIC_KEY>      must match the generated IDL
  --evidence <PATH>              update deployment evidence JSON
  --execute                      send after a successful simulation
  --confirm-treasury <PUBKEY>    required with --execute; must equal --treasury

Without --execute the script performs read-only checks and simulation only.`);
  process.exit(2);
}

type ConfigAccount = {
  bump: number;
  feeBps: number;
  treasury: InstanceType<typeof PublicKey>;
  version: number;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.has('--help')) usage();
  const treasuryInput = option(args, '--treasury', process.env.TREASURY);
  if (!treasuryInput) usage();

  const context = await loadDevnetContext(args);
  const treasury = new PublicKey(treasuryInput);
  if (treasury.equals(PublicKey.default)) throw new Error('Treasury cannot be the zero/default public key');
  if (treasury.equals(context.wallet.publicKey)) {
    throw new Error('Treasury must be different from the deployer/upgrade-authority wallet');
  }

  const { programDataAddress, upgradeAuthority } = await verifyDeployedUpgradeableProgram(context);
  const configPda = deriveConfigPda(context.programId);
  const configClient = (context.program.account as Record<string, {
    fetchNullable(address: InstanceType<typeof PublicKey>): Promise<ConfigAccount | null>;
  }>).protocolConfigV2;
  if (!configClient) throw new Error('Generated IDL does not expose ProtocolConfigV2');

  const existing = await configClient.fetchNullable(configPda);
  if (existing) {
    if (
      existing.version !== 2
      || existing.feeBps !== 100
      || !existing.treasury.equals(treasury)
    ) {
      throw new Error(
        `Config ${configPda.toBase58()} already exists with different values; initialization is one-time`,
      );
    }
    printJson({
      status: 'already-initialized',
      cluster: 'devnet',
      programId: context.programId.toBase58(),
      deployer: context.wallet.publicKey.toBase58(),
      upgradeAuthority: upgradeAuthority?.toBase58() ?? null,
      treasury: treasury.toBase58(),
      configPda: configPda.toBase58(),
      feeBps: existing.feeBps,
      explorer: explorerAddress(configPda.toBase58()),
    });
    updateEvidenceFile(args.options.get('--evidence'), {
      treasury: treasury.toBase58(),
      configPda: configPda.toBase58(),
      configStatus: 'already-initialized',
    });
    return;
  }

  const builder = (context.program.methods as Record<string, (...values: unknown[]) => any>)
    .initializeProtocolConfigV2(treasury)
    .accountsStrict({
      authority: context.wallet.publicKey,
      programData: programDataAddress,
      config: configPda,
      systemProgram: SystemProgram.programId,
    });

  const simulation = await builder.simulate({ commitment: 'confirmed' });
  const summary = {
    cluster: 'devnet',
    rpcUrl: context.rpcUrl,
    programId: context.programId.toBase58(),
    feePayer: context.wallet.publicKey.toBase58(),
    upgradeAuthority: upgradeAuthority?.toBase58() ?? null,
    treasury: treasury.toBase58(),
    configPda: configPda.toBase58(),
    feeBps: 100,
    simulationUnitsConsumed: simulation.unitsConsumed ?? null,
  };

  if (!args.flags.has('--execute')) {
    printJson({ status: 'simulation-ok-not-sent', ...summary });
    console.error(
      `No transaction sent. Review the summary, then repeat with --execute --confirm-treasury ${treasury.toBase58()}`,
    );
    return;
  }
  if (args.options.get('--confirm-treasury') !== treasury.toBase58()) {
    throw new Error('Refusing to send: --confirm-treasury must exactly match the treasury address');
  }

  const signature = await builder.rpc({
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
    skipPreflight: false,
  });
  const initialized = await configClient.fetchNullable(configPda);
  if (
    !initialized
    || initialized.version !== 2
    || initialized.feeBps !== 100
    || !initialized.treasury.equals(treasury)
  ) {
    throw new Error(`Transaction ${signature} confirmed, but ProtocolConfigV2 verification failed`);
  }

  const evidence = {
    status: 'initialized',
    ...summary,
    configInitializationSignature: signature,
    explorer: explorerTransaction(signature),
  };
  updateEvidenceFile(args.options.get('--evidence'), {
    treasury: treasury.toBase58(),
    configPda: configPda.toBase58(),
    configInitializationSignature: signature,
    configExplorer: explorerTransaction(signature),
  });
  printJson(evidence);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
