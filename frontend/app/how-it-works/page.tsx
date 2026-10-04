import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'How it works | Charity Vault' };

export default function HowItWorksPage() {
  return (
    <section aria-labelledby="how-it-works-title">
      <h1 id="how-it-works-title" className="text-2xl font-medium">How it works</h1>
      <p className="mt-2 text-slate-600">The product explanation will be added here.</p>
    </section>
  );
}
