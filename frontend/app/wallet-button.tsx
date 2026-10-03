'use client';

import { useConnect, useConnectedWallet, useDisconnect, useWallets, WalletReadyGate } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import type { AppClient } from './providers';
import { shortAddress } from './lib/charity-vault';

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Could not connect to Phantom.';
}

function Button() {
  const client = useClient<AppClient>();
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const { dispatchAsync: connect, isRunning, error } = useConnect(client);
  const { dispatch: disconnect } = useDisconnect(client);

  if (connected) {
    return (
      <button className="connect" type="button" onClick={() => disconnect()} title="Disconnect wallet">
        {shortAddress(connected.account.address)} · Disconnect
      </button>
    );
  }

  const phantom =
    wallets.find((wallet) => wallet.name.toLowerCase().includes('phantom')) ?? wallets[0];

  return (
    <div className="wallet-control">
      <button
        className="connect"
        type="button"
        disabled={isRunning}
        onClick={() => {
          if (!phantom) {
            window.open('https://phantom.com/download', '_blank', 'noopener,noreferrer');
            return;
          }
          // dispatchAsync surfaces failures; swallow here so the UI shows `error`.
          void connect(phantom).catch(() => undefined);
        }}
      >
        {isRunning ? 'Connecting…' : phantom ? 'Connect wallet ↗' : 'Install Phantom ↗'}
      </button>
      {error ? <small role="alert">{errorText(error)}</small> : null}
    </div>
  );
}

export function WalletButton() {
  const client = useClient<AppClient>();
  return (
    <WalletReadyGate client={client} fallback={<button className="connect" type="button" disabled>Looking for wallets…</button>}>
      <Button />
    </WalletReadyGate>
  );
}
