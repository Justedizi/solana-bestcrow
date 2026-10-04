import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="space-y-16" aria-labelledby="home-title">
      <div className="grid gap-10 py-10 md:grid-cols-[1.35fr_.65fr] md:items-end">
        <div>
          <p className="mb-5 text-xs font-bold uppercase tracking-[.22em] text-emerald-700">Open funding for ambitious founders</p>
          <h1 id="home-title" className="display-font max-w-3xl text-6xl font-semibold md:text-8xl">Build in public.<br />Fund by proof.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">Bestcrow lets startups raise SOL with milestone rules locked on-chain. Backers vote on progress and keep a direct path to refunds.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700" href="/discover">Explore startups</Link><Link className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold hover:border-slate-950" href="/campaign/new">Start a campaign</Link></div>
        </div>
        <div className="rounded-3xl bg-emerald-200 p-7"><p className="text-sm font-semibold">Protocol snapshot</p><div className="mt-8 grid grid-cols-2 gap-6"><Stat value="2–5" label="milestones" /><Stat value="7 days" label="every vote" /><Stat value="1%" label="success fee" /><Stat value="0 SOL" label="creator deposit" /></div></div>
      </div>
      <div><div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Featured projects</p><h2 className="mt-2 text-3xl font-semibold">Ideas worth backing</h2></div><Link className="text-sm font-semibold underline" href="/discover">View all</Link></div><div className="grid gap-5 md:grid-cols-3"><ProjectCard title="Orbit Kitchen" category="Food systems" raised="12.4 SOL" progress="68%" color="bg-orange-200" /><ProjectCard title="Lumen Labs" category="Climate hardware" raised="8.1 SOL" progress="42%" color="bg-blue-200" /><ProjectCard title="Mosaic OS" category="Developer tools" raised="21.7 SOL" progress="91%" color="bg-purple-200" /></div></div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) { return <div><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-600">{label}</p></div>; }
function ProjectCard({ title, category, raised, progress, color }: { title: string; category: string; raised: string; progress: string; color: string }) { return <article className="rounded-2xl border border-slate-200 bg-white p-5"><div className={`h-32 rounded-xl ${color}`} /><p className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">{category}</p><h3 className="mt-2 text-xl font-semibold">{title}</h3><div className="mt-5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-slate-950" style={{ width: progress }} /></div><div className="mt-3 flex justify-between text-sm"><span>{raised} raised</span><span className="text-slate-500">{progress}</span></div></article>; }
