import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Discover | Charity Vault' };

export default function DiscoverPage() {
  return (
    <section aria-labelledby="discover-title">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">The launch board</p><h1 id="discover-title" className="display-font mt-3 text-5xl font-semibold">Discover startups</h1><p className="mt-4 text-slate-600">Browse campaigns with public milestones, budgets and voting rules.</p></div><Link href="/campaign/new" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Launch a project</Link></div>
      <div className="mt-12 grid gap-5 md:grid-cols-2"><DiscoverCard href="/campaign/orbit-kitchen" title="Orbit Kitchen" description="Modular kitchens for dense urban neighbourhoods." category="Food systems" raised="12.4 SOL" goal="18 SOL" color="bg-orange-200" /><DiscoverCard href="/campaign/lumen-labs" title="Lumen Labs" description="Open source sensors for low-cost climate data." category="Climate hardware" raised="8.1 SOL" goal="19 SOL" color="bg-blue-200" /><DiscoverCard href="/campaign/mosaic-os" title="Mosaic OS" description="A calmer command line for collaborative teams." category="Developer tools" raised="21.7 SOL" goal="24 SOL" color="bg-purple-200" /></div>
    </section>
  );
}

function DiscoverCard({ href, title, description, category, raised, goal, color }: { href: string; title: string; description: string; category: string; raised: string; goal: string; color: string }) { return <Link href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg"><div className={`h-44 rounded-xl ${color}`} /><p className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">{category}</p><h2 className="mt-2 text-2xl font-semibold">{title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{description}</p><div className="mt-5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 w-2/3 rounded-full bg-emerald-600" /></div><div className="mt-3 flex justify-between text-sm"><span>{raised} raised</span><span className="text-slate-500">of {goal}</span></div><span className="mt-5 inline-block text-sm font-semibold underline">View campaign →</span></Link>; }
