'use client';

import { createClient } from '@solana/kit';
import { solanaRpc, solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';
import { ClientProvider } from '@solana/react';

const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const wsUrl = rpcUrl.replace(/^http/, 'ws');

/**
 * Wallet Standard chain for the `walletSigner` plugin. Defaults to devnet;
 * set `NEXT_PUBLIC_SOLANA_CHAIN=localnet` to target a local validator/surfnet
 * (only wallets that advertise that chain will connect).
 */
const chain = (process.env.NEXT_PUBLIC_SOLANA_CHAIN ?? 'solana:devnet') as `${string}:${string}`;

export const client = createClient()
  .use(walletSigner({ chain }))
  .use(solanaRpcSubscriptionsConnection(wsUrl))
  .use(solanaRpc({ rpcUrl, transactionConfig: { version: 0 } }));

export type AppClient = typeof client;

export function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
