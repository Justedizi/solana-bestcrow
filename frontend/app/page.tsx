'use client';

import Link from 'next/link';

import { Mark } from './mark';
import { DiscoverView } from './discover-view';

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="shell hero-grid">
          <div>
            <label>— CHARITY CROWDFUNDING WITHOUT THE MIDDLEMAN</label>
            <h1>
              Give directly.
              <br />
              <i>Make it count.</i>
            </h1>
            <p>
              For <b>small charities and their donors</b>. Today a platform holds your money, takes a cut, and can
              freeze the campaign. Here your contribution goes into a transparent on-chain vault with a clear goal and
              an enforceable deadline — and if the campaign falls short, every donor is refunded, automatically.
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
                <b>02</b> Rules, not operators
              </span>
              <span>
                <b>03</b> One-tx refunds
              </span>
            </div>
            <div className="actions" style={{ marginTop: 26 }}>
              <span className="sol-badge">
                <i /> Built on Solana
              </span>
            </div>
          </div>
          <div className="art">
            <div className="rings" />
            <div className="mark">
              <Mark />
            </div>
            <em>NO CUSTODY</em>
            <em>NO FEE</em>
          </div>
        </div>
      </section>

      <DiscoverView />

      <section className="manifesto">
        <div className="shell">
          <b>
            <Mark />
          </b>
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
