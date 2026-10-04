import type { Metadata } from 'next';

import { DiscoverView } from '../discover-view';

export const metadata: Metadata = {
  title: 'Discover campaigns — Common Ground',
  description:
    'Browse live charity campaigns. Each one has a public goal, deadline, and immutable refund rules enforced by a Solana program.',
};

export default function DiscoverPage() {
  return <DiscoverView />;
}
