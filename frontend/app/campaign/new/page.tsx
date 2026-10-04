import type { Metadata } from 'next';
import CampaignForm from './campaign-form';

export const metadata: Metadata = { title: 'New campaign | Charity Vault' };

export default function NewCampaignPage() {
  return (
    <section aria-labelledby="new-campaign-title">
      <CampaignForm />
    </section>
  );
}
