'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function CampaignPage() {
  const params = useParams<{ address: string }>();

  return (
    <section aria-labelledby="campaign-title" className="space-y-10">
      <Link href="/discover" className="text-sm font-semibold underline">← All startups</Link>
      <div className="grid gap-10 md:grid-cols-[1.2fr_.8fr]"><div><div className="h-64 rounded-3xl bg-orange-200" /><p className="mt-7 text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Startup campaign</p><h1 id="campaign-title" className="display-font mt-3 text-6xl font-semibold">{params.address === 'orbit-kitchen' ? 'Orbit Kitchen' : params.address}</h1><p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">Modular kitchens for dense urban neighbourhoods. A transparent build with public evidence at every step.</p><p className="mt-5 break-all text-xs text-slate-500">Campaign address: {params.address}</p></div><aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm text-slate-500">Raised</p><p className="mt-1 text-4xl font-semibold">12.4 SOL</p><p className="mt-1 text-sm text-slate-500">of 18 SOL goal · 68%</p><div className="mt-5 h-2 rounded-full bg-slate-100"><div className="h-2 w-2/3 rounded-full bg-emerald-600" /></div><button className="mt-7 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Connect wallet to support</button><p className="mt-4 text-xs leading-5 text-slate-500">Your wallet pays network fees. The 1% platform fee applies only if this campaign reaches its goal.</p></aside></div>
      <div className="grid gap-5 md:grid-cols-3"><Milestone n="01" title="Prototype kitchen" share="35%" state="Approved" /><Milestone n="02" title="First installation" share="35%" state="Voting opens after proof" /><Milestone n="03" title="Community rollout" share="30%" state="Pending" /></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Canonical campaign terms</h2><p className="mt-3 text-sm leading-6 text-slate-600">The description and milestone schedule are verified against the hash committed by the on-chain campaign account. The page URL is only a locator.</p><p className="mt-4 font-mono text-xs text-slate-500">description hash · pending indexer confirmation</p></div>
    </section>
  );
}

function Milestone({ n, title, share, state }: { n: string; title: string; share: string; state: string }) { return <article className="rounded-2xl bg-white p-5"><span className="text-sm font-bold text-emerald-700">{n}</span><h2 className="mt-8 text-xl font-semibold">{title}</h2><div className="mt-8 flex justify-between text-sm"><span>{share} of net budget</span><span className="text-slate-500">{state}</span></div></article>; }
