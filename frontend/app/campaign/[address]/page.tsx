'use client';

import { useParams } from 'next/navigation';

export default function CampaignPage() {
  const params = useParams<{ address: string }>();

  return (
    <section aria-labelledby="campaign-title">
      <h1 id="campaign-title" className="text-2xl font-medium">Campaign</h1>
      <p className="mt-2 break-all text-slate-600">Address: {params.address}</p>
    </section>
  );
}
