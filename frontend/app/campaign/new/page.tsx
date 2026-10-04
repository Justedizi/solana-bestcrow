import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'New campaign | Charity Vault' };

export default function NewCampaignPage() {
  return (
    <section aria-labelledby="new-campaign-title">
      <h1 id="new-campaign-title" className="text-2xl font-medium">New campaign</h1>
      <p className="mt-2 text-slate-600">Campaign creation will be added here.</p>
    </section>
  );
}
