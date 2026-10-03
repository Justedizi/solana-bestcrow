import Link from 'next/link';

import { Mark } from '../mark';

const STEPS: [string, string, string][] = [
  [
    '01 / CREATE',
    'A goal and a deadline.',
    'A small charity commits to a funding goal and a deadline. Both are written into the program at creation and cannot be changed by anyone afterwards.',
  ],
  [
    '02 / GIVE',
    'Straight into the vault.',
    'Donors contribute directly into a program-controlled vault. Every donor gets an exact on-chain ledger entry — how much they gave and whether they have been refunded.',
  ],
  [
    '03 / DECIDE',
    'The outcome is code.',
    'After the deadline, anyone can finalize. If the goal is met, the charity claims the funds. If it is missed, every donor is refunded their exact contribution — all of them in a single transaction.',
  ],
];

export default function HowItWorks() {
  return (
    <div className="shell page how">
      <Link className="back" href="/">
        ← All campaigns
      </Link>

      <div className="heading">
        <label>— THE TRUST MODEL</label>
        <h1>
          Trust the rule.
          <br />
          <i>Not the middleman.</i>
        </h1>
        <p className="lead">
          Common Ground is for <b>small charities and their donors</b>. Today, giving online means trusting a
          fundraising platform to hold the money, take a cut, and decide whether a campaign qualifies. Here, the
          terms are public before anyone gives, and the program — not a company — enforces them.
        </p>
      </div>

      <div className="steps">
        {STEPS.map(([tag, title, body]) => (
          <article key={tag}>
            <label>{tag}</label>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </div>

      {/* The intermediary, before and after */}
      <div className="compare">
        <article className="before">
          <label>BEFORE</label>
          <h3>Managed crowdfunding</h3>
          <ul>
            <li>
              The platform <b>holds the money</b> in its own account.
            </li>
            <li>
              It charges a <b>platform fee</b> on every donation (typically a few percent) and payment-processing fees.
            </li>
            <li>
              It can <b>freeze, delay, or reject</b> a campaign at its own discretion.
            </li>
            <li>
              Refunds are <b>manual</b> — if they happen, they happen on the platform&rsquo;s terms.
            </li>
            <li>
              If the platform fails, <b>everyone stops</b>.
            </li>
          </ul>
        </article>
        <article className="after">
          <label>AFTER</label>
          <h3>Common Ground</h3>
          <ul>
            <li>
              Funds sit in a <b>program-controlled vault</b> — no company account.
            </li>
            <li>
              There is <b>no platform fee</b>; only the Solana network fee (a fraction of a cent).
            </li>
            <li>
              The goal, deadline, and refund rules are <b>fixed at creation</b>. Nobody — including us — can change
              them.
            </li>
            <li>
              Refunds are <b>automatic and exact</b>: goal missed means every donor can reclaim their contribution.
            </li>
            <li>
              The rule lives <b>on the network</b>, so it survives the operator.
            </li>
          </ul>
        </article>
      </div>

      {/* Mechanisms */}
      <div className="boundary">
        <div>
          <h2>
            A deterministic,
            <br />
            tokenless conditional vault.
          </h2>
          <p>
            Strip the market out of a conditional-vault primitive and you get this: the condition is simply
            <b> &ldquo;deadline passed AND goal unmet&rdquo;</b> — evaluated by the program, not an oracle, not a vote, not a
            human. No token is needed to participate or to be refunded.
          </p>
        </div>
        <div>
          <h2>What the code cannot do.</h2>
          <p>
            The program does not judge whether a cause is worthy, verify a charity&rsquo;s identity, or guarantee
            delivery after a successful campaign. It removes custody and settlement discretion — the moral and legal
            risk of the cause stays with the parties.
          </p>
        </div>
      </div>

      {/* Account model */}
      <label>— ON-CHAIN ACCOUNT MODEL</label>
      <div className="accounts">
        <article>
          <div className="acct">
            <span className="dot" />
            <h3>CampaignAccount</h3>
          </div>
          <code>[&quot;campaign&quot;, creator, campaign_id]</code>
          <p>
            Stores the creator, goal, deadline, description hash, amount raised, status, and the donor registry (up to
            12 donors, so a batch refund fits in one transaction).
          </p>
        </article>
        <article>
          <div className="acct">
            <span className="dot" />
            <h3>DonorLedgerAccount</h3>
          </div>
          <code>[&quot;donor&quot;, campaign, donor]</code>
          <p>
            One record per donor: the exact amount they contributed and a <b>claimed</b> flag that makes double refunds
            impossible. Created lazily on the first pledge.
          </p>
        </article>
        <article>
          <div className="acct">
            <span className="dot" />
            <h3>Vault</h3>
          </div>
          <code>[&quot;vault&quot;, campaign]</code>
          <p>
            A program-owned lamport account that holds the pledges. Only the program can move funds out — and only
            along the paths the campaign&rsquo;s fixed rules allow.
          </p>
        </article>
      </div>

      {/* State machine */}
      <label>— STATE MACHINE</label>
      <div className="machine">
        <span className="state active">Active</span>
        <span className="arrow">→</span>
        <span className="state succeeded">Succeeded</span>
        <span className="arrow">when the goal is met at the deadline → creator claims</span>
      </div>
      <div className="machine" style={{ marginTop: -40 }}>
        <span className="state active">Active</span>
        <span className="arrow">→</span>
        <span className="state refunded">Refunded</span>
        <span className="arrow">when the goal is missed → every donor reclaims their exact pledge</span>
      </div>

      <div className="actions">
        <Link className="button gradient" href="/campaign/new">
          Start a campaign ↗
        </Link>
        <span className="sol-badge">
          <i /> Built on Solana
        </span>
      </div>

      <p className="fine" style={{ marginTop: 28 }}>
        <Mark className="mark-inline" /> Every donation and refund is public on Solana and verifiable on the Solana
        Explorer. A database could display these rules, but its operator could rewrite them; the program&rsquo;s rules
        cannot be rewritten by anyone.
      </p>
    </div>
  );
}
