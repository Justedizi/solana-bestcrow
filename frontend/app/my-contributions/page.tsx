'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { address } from '@solana/kit';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';

import { client } from '../providers';
import {
  fetchCampaignContentV2,
  fetchVerifiedTermsV2,
  formatSolV2,
  getBackerLedgersV2,
  getCampaignV2,
  type BackerLedgerV2,
  type CampaignContentV2,
  type CampaignV2,
} from '../lib/charity-vault-v2';

type SupportItem = { ledger: BackerLedgerV2; campaign: CampaignV2; content: CampaignContentV2 | null };

export default function MyContributionsPage() {
  const connected = useConnectedWallet(client);
  const [items, setItems] = useState<SupportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!connected) { setItems([]); return; }
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const wallet = address(connected.account.address);
        const ledgers = await getBackerLedgersV2(client, wallet);
        const loaded = (await Promise.all(ledgers.map(async (ledger): Promise<SupportItem | null> => {
          const campaign = await getCampaignV2(client, ledger.campaign);
          if (!campaign) return null;
          let content: CampaignContentV2 | null = null;
          if (campaign.status !== 'Draft') {
            try {
              const terms = (await fetchVerifiedTermsV2(campaign)).terms;
              content = await fetchCampaignContentV2(terms);
            } catch { /* Hide unverified descriptive content. */ }
          }
          return { ledger, campaign, content };
        }))).filter((item): item is SupportItem => item !== null);
        if (active) setItems(loaded);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Support could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [connected]);

  return <section aria-labelledby="support-title">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Confirmed Devnet ledgers</p>
    <h1 id="support-title" className="display-font mt-3 text-5xl font-semibold">My support</h1>
    <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">This view reads V2 ledger accounts directly at confirmed commitment. It does not rely on a payment intent or assume that an indexer is authoritative.</p>
    {!connected ? <div className="mt-10 rounded-2xl bg-emerald-100 p-8"><h2 className="text-2xl font-semibold">Connect your wallet to see support</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-700">Your contribution rights remain on-chain even if this website goes offline.</p><Link className="mt-6 inline-block rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white" href="/discover">Browse campaigns</Link></div> : null}
    {connected ? <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Connected wallet</p><p className="mt-1 break-all font-mono text-xs">{connected.account.address}</p><p className="mt-3 text-xs font-semibold text-emerald-700">Source: Solana Devnet · confirmed RPC state</p></div> : null}
    {loading ? <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm" role="status">Reading V2 backer ledgers…</p> : null}
    {error ? <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : null}
    {connected && !loading && !error && items.length === 0 ? <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8"><h2 className="text-xl font-semibold">No open V2 contribution ledgers</h2><p className="mt-3 text-sm leading-6 text-slate-600">Cancelled and fully refunded ledgers close on-chain, so their history requires the V2 indexer. No stale index result is being presented as current state.</p></div> : null}
    {items.length > 0 ? <div className="mt-8 space-y-4">{items.map(({ ledger, campaign, content }) => {
      const action = nextAction(campaign);
      return <article key={ledger.address} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{campaign.status}</p><h2 className="mt-2 text-xl font-semibold">{content?.title ?? `Campaign ${campaign.campaignId}`}</h2></div><p className="text-2xl font-semibold">{formatSolV2(ledger.amount)} SOL</p></div><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><Item label="Contribution" value="Confirmed on-chain" /><Item label="Vote weight" value={`${formatSolV2(ledger.amount)} SOL`} /><Item label="Next action" value={action} /></dl><Link className="mt-5 inline-block rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:border-slate-950" href={`/campaign/${campaign.address}`}>Open campaign actions →</Link></article>;
    })}</div> : null}
  </section>;
}

function nextAction(campaign: CampaignV2): string {
  const now = Math.floor(Date.now() / 1000);
  if (campaign.status === 'Funding') return now < campaign.fundingDeadline ? 'Can add or cancel pledge' : 'Funding can be finalized';
  if (campaign.status === 'Failed') return 'Full refund available';
  if (campaign.status === 'Succeeded') return 'Inspect current milestone / vote';
  if (campaign.status === 'Terminated') return 'Pro-rata refund available';
  if (campaign.status === 'Completed') return 'Campaign completed';
  return 'Draft is not accepting contributions';
}
function Item({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>; }
