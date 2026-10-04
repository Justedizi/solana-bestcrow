import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Discover | Charity Vault' };

export default function DiscoverPage() {
  return (
    <section aria-labelledby="discover-title">
      <h1 id="discover-title" className="text-2xl font-medium">Discover</h1>
      <p className="mt-2 text-slate-600">Campaign discovery will be added here.</p>
    </section>
  );
}
