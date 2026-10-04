'use client';

import Link from 'next/link';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { client } from '../providers';

export default function MyContributionsPage() {
  const connected = useConnectedWallet(client);
  return <section aria-labelledby="support-title"><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Your wallet activity</p><h1 id="support-title" className="display-font mt-3 text-5xl font-semibold">My support</h1>{connected ? <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm text-slate-600">Connected wallet</p><p className="mt-2 break-all font-mono text-sm">{connected.account.address}</p><p className="mt-8 text-sm leading-6 text-slate-600">Contribution history is read from the indexed campaign ledgers. Refresh after a confirmed transaction to see deposits, votes and refund claims.</p></div> : <div className="mt-10 rounded-2xl bg-emerald-100 p-8"><h2 className="text-2xl font-semibold">Connect your wallet to see support</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-700">Bestcrow links your wallet to a wallet-first account. Your contributions remain yours even if this website goes offline.</p><Link className="mt-6 inline-block rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white" href="/discover">Browse campaigns</Link></div>}</section>;
}
