'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useClient } from '@solana/react';

import { formatSol, getCampaigns, type Campaign } from './lib/charity-vault';
import type { AppClient } from './providers';

function statusLabel(campaign: Campaign): string {
  if (campaign.status === 'Succeeded') return 'Goal reached';
  if (campaign.status === 'Refunded') return 'Refunding';
  return campaign.deadline * 1000 <= Date.now() ? 'Awaiting finalize' : 'Funding open';
}

export default function Home() {
  const client = useClient<AppClient>();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCampaigns(await getCampaigns(client));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns');
      setCampaigns([]);
    }
  }, [client]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <>
      <section className="hero">
        <div className="shell hero-grid">
          <div>
            <label>— THE FUTURE OF GIVING IS OPEN</label>
            <h1>
              Give directly.
              <br />
              <i>Make it count.</i>
            </h1>
            <p>
              A new way to fund what matters. Your contribution goes into a transparent on-chain vault,
              with clear goals and a guaranteed refund if the campaign falls short.
            </p>
            <div className="actions">
              <Link className="button dark" href="/campaign/new">
                Start a campaign ↗
              </Link>
              <Link className="text" href="/how-it-works">
                See how it works ↗
              </Link>
            </div>
            <div className="facts">
              <span>
                <b>01</b> No middleman
              </span>
              <span>
                <b>02</b> Clear conditions
              </span>
              <span>
                <b>03</b> On-chain proof
              </span>
            </div>
          </div>
          <div className="art">
            <div className="rings" />
            <strong>✳</strong>
            <em>TRANSPARENCY</em>
            <em>DIRECT IMPACT</em>
          </div>
        </div>
      </section>

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

        {error ? <p className="fine">Could not reach devnet: {error}</p> : null}

        {campaigns === null ? (
          <p className="fine">Loading campaigns from devnet…</p>
        ) : campaigns.length === 0 ? (
          <p className="fine">
            No campaigns yet. <Link href="/campaign/new">Start the first one ↗</Link>
          </p>
        ) : (
          <div className="cards">
            {campaigns.map((campaign) => {
              const goal = Number(formatSol(campaign.goal));
              const raised = Number(formatSol(campaign.raised));
              const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
              const label = statusLabel(campaign);
              return (
                <Link className="card" href={`/campaign/${campaign.address}`} key={campaign.address}>
                  <div className="card-top">
                    <small className={label === 'Goal reached' ? 'done' : ''}>{label}</small>
                    <b>↗</b>
                  </div>
                  <h3>Campaign #{campaign.campaignId.toString()}</h3>
                  <p>by {campaign.creator.slice(0, 4)}…{campaign.creator.slice(-4)}</p>
                  <div className="bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="card-bottom">
                    <span>
                      {raised.toFixed(2)} / {goal.toFixed(2)} SOL
                    </span>
                    <span>{campaign.donors.length} donors</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="manifesto">
        <div className="shell">
          <b>✳</b>
          <h2>
            The promise is simple:
            <br />
            your money follows <i>the rules.</i>
          </h2>
          <Link href="/how-it-works">↗</Link>
        </div>
      </section>
    </>
  );
}
