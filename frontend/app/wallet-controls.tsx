'use client';

import { useState } from 'react';
import { useConnectedWallet, useConnect, useDisconnect, useWallets } from '@solana/kit-plugin-wallet/react';
import { client } from './providers';

function shortAddress(value: string): string {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

export default function WalletControls() {
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  if (connected) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="max-w-32 truncate" title={connected.account.address}>{shortAddress(connected.account.address)}</span>
        <button
          type="button"
          className="border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
          disabled={disconnect.isRunning}
          onClick={() => void disconnect.dispatchAsync().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not disconnect wallet.'))}
        >
          Disconnect
        </button>
        {error ? <span className="sr-only" role="status">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="border border-slate-900 px-3 py-2 text-sm hover:bg-slate-900 hover:text-white disabled:opacity-50"
        disabled={connect.isRunning}
        onClick={() => { setError(''); setOpen((value) => !value); }}
      >
        {connect.isRunning ? 'Connecting...' : 'Connect wallet'}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-56 border border-slate-200 bg-white p-2 shadow-sm">
          {wallets.length === 0 ? <p className="p-2 text-sm text-slate-600">No compatible wallet detected.</p> : null}
          {wallets.map((wallet) => (
            <button
              key={wallet.name}
              type="button"
              className="block w-full px-2 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => void connect.dispatchAsync(wallet).then(() => setOpen(false)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not connect wallet.'))}
            >
              {wallet.name}
            </button>
          ))}
          {error ? <p className="p-2 text-xs text-red-700" role="status">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
