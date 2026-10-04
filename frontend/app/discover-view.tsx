'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from '@solana/react';

import {
  decodeContent,
  formatSol,
  getCampaigns,
  type Campaign,
} from './lib/charity-vault';
import type { AppClient } from './providers';

function statusLabel(campaign: Campaign): string {
  if (campaign.status === 'Succeeded') return 'Goal reached';
  if (campaign.status === 'Refunded') return 'Refunding';
  return campaign.deadline * 1000 <= Date.now() ? 'Awaiting finalize' : 'Funding open';
}

function statusClass(campaign: Campaign): string {
  if (campaign.status === 'Succeeded') return 'done';
  if (campaign.status === 'Refunded') return 'refunded';
  return campaign.deadline * 1000 <= Date.now() ? '' : 'active';
}

type SortKey = 'newest' | 'deadline' | 'progress' | 'goal';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'deadline', label: 'Ending soon' },
  { key: 'progress', label: 'Most funded' },
  { key: 'goal', label: 'Largest goal' },
];

export function DiscoverView() {
  const client = useClient<AppClient>();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [stagedOnly, setStagedOnly] = useState(false);
  const refreshing = useRef(false);

  const load = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setError(null);
    try {
      setCampaigns(await getCampaigns(client));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns');
      setCampaigns([]);
    } finally {
      refreshing.current = false;
    }
  }, [client]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const visible = useMemo(() => {
    if (!campaigns) return null;
    let list = campaigns;
    if (stagedOnly) list = list.filter((c) => c.staged);
    const needle = query.trim().toLowerCase();
    if (needle) {
      // The human-readable description lives in the shareable link, so the list
      // can only match on-chain fields plus any content passed via the URL.
      list = list.filter((c) =>
        [c.address, c.creator, c.campaignId.toString(), c.staged ? 'milestone staged' : 'all-or-nothing']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }
    const sorted = [...list];
    if (sort === 'deadline') sorted.sort((a, b) => a.deadline - b.deadline);
    else if (sort === 'goal') sorted.sort((a, b) => (b.goal > a.goal ? 1 : b.goal < a.goal ? -1 : 0));
    else if (sort === 'progress') {
      const pct = (c: Campaign) => (c.goal > 0n ? Number(c.raised * 10_000n / c.goal) : 0);
      sorted.sort((a, b) => pct(b) - pct(a));
    } else sorted.sort((a, b) => b.deadline - a.deadline);
    return sorted;
  }, [campaigns, query, sort, stagedOnly]);

  return (
    <section className="shell discover">
      <div className="section-head">
        <div>
          <label>— DISCOVER</label>
          <h2>
            Campaigns on the ground<span>.</span>
          </h2>
          <p>Explore live campaigns. Each one has a public goal, deadline and immutable refund rules.</p>
        </div>
        <button className="outline" type="button" onClick={() => void load()}>
          ↻ Refresh
        </button>
      </div>

      <div className="discover-controls">
        <input
          type="search"
          placeholder="Search by creator or address…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="durations">
          {SORTS.map((option) => (
            <button
              type="button"
              className={sort === option.key ? 'selected' : ''}
              onClick={() => setSort(option.key)}
              key={option.key}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="staged-toggle">
          <input type="checkbox" checked={stagedOnly} onChange={(e) => setStagedOnly(e.target.checked)} />
          Milestone-gated only
        </label>
      </div>

      {error ? <p className="fine">Could not reach devnet: {error}</p> : null}

      {visible === null ? (
        <p className="fine">Loading campaigns from devnet…</p>
      ) : visible.length === 0 ? (
        <p className="fine">
          {campaigns && campaigns.length > 0 ? (
            'No campaigns match those filters.'
          ) : (
            <>
              No campaigns yet. <Link href="/campaign/new">Start the first one ↗</Link>
            </>
          )}
        </p>
      ) : (
        <div className="cards">
          {visible.map((campaign) => {
            const goal = Number(formatSol(campaign.goal));
            const raised = Number(formatSol(campaign.raised));
            const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
            const label = statusLabel(campaign);
            return (
              <Link className="card" href={`/campaign/${campaign.address}`} key={campaign.address}>
                <div className="card-top">
                  <small className={statusClass(campaign)}>{label}</small>
                  <b>↗</b>
                </div>
                <div className="card-badges">
                  {campaign.staged ? (
                    <span className="badge">Milestone-gated</span>
                  ) : (
                    <span className="badge plain">All-or-nothing</span>
                  )}
                  {campaign.terminated ? <span className="badge warn">Terminated</span> : null}
                  {campaign.bond > 0n ? <span className="badge plain">Bonded</span> : null}
                </div>
                <h3>
                  {campaign.staged
                    ? `Staged campaign #${campaign.campaignId.toString()}`
                    : `Campaign #${campaign.campaignId.toString()}`}
                </h3>
                <p>
                  by {campaign.creator.slice(0, 4)}…{campaign.creator.slice(-4)}
                </p>
                <div className="bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="card-bottom">
                  <span>
                    {raised.toFixed(2)} / {goal.toFixed(2)} SOL
                  </span>
                  <span>
                    {campaign.staged ? `${campaign.milestoneCount} milestones` : `${campaign.donors.length} donors`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Re-exported so the homepage can show a title from a campaign's shareable link. */
export function campaignTitle(campaign: Campaign, content: string | null): string {
  const decoded = decodeContent(content);
  return decoded?.title?.trim() || (campaign.staged ? `Staged campaign #${campaign.campaignId}` : `Campaign #${campaign.campaignId}`);
}
