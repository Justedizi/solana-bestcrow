'use client';

import { useConnect, useConnectedWallet, useDisconnect, useWallets, WalletReadyGate } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import type { AppClient } from './providers';
import { shortAddress } from './lib/charity-vault';

function Button() {
  const client = useClient<AppClient>();
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const { dispatch: connect, isRunning, error } = useConnect(client);
  const { dispatch: disconnect } = useDisconnect(client);
  if (connected) return <button className="connect" onClick={() => disconnect()} title="Disconnect Phantom">{shortAddress(connected.account.address)} · Disconnect</button>;
  const phantom = wallets.find(wallet => wallet.name.toLowerCase().includes('phantom'));
  return <div className="wallet-control">
    <button className="connect" disabled={isRunning} onClick={() => phantom ? connect(phantom) : window.open('https://phantom.com/download', '_blank', 'noopener,noreferrer')}>
      {isRunning ? 'Connecting…' : phantom ? 'Connect Phantom ↗' : 'Install Phantom ↗'}
    </button>
    {error ? <small role="alert">{error instanceof Error ? error.message : 'Could not connect to Phantom.'}</small> : null}
  </div>;
}

export function WalletButton() {
  const client = useClient<AppClient>();
  return <WalletReadyGate client={client} fallback={<button className="connect" disabled>Finding Phantom…</button>}><Button /></WalletReadyGate>;
}
