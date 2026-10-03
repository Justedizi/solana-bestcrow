'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import { address } from '@solana/kit';

import {
  createCampaignIx,
  digest,
  explorerTx,
  parseSol,
} from '../../lib/charity-vault';
import { Mark } from '../../mark';
import { sendCampaignInstruction } from '../../lib/send-campaign';
import type { AppClient } from '../../providers';

const DURATIONS: { label: string; seconds: number }[] = [
  { label: '1 minute', seconds: 60 },
  { label: '1 hour', seconds: 3_600 },
  { label: '1 day', seconds: 86_400 },
  { label: '1 week', seconds: 604_800 },
];

export default function New() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const router = useRouter();

  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [duration, setDuration] = useState(DURATIONS[1]!.label);
  const [status, setStatus] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setSignature(null);
    if (!connected) {
      setStatus('Connect your wallet first.');
      return;
    }
    const seconds = DURATIONS.find((option) => option.label === duration)?.seconds ?? 86_400;

    setBusy(true);
    try {
      setStatus('Awaiting wallet signature…');
      const creator = address(connected.account.address);
      const campaignId = BigInt(Date.now());
      const deadline = Math.floor(Date.now() / 1000) + seconds;
      const descHash = await digest(description.trim());
      const { campaign, ix } = await createCampaignIx(creator, campaignId, parseSol(goal), deadline, descHash);
      const sig = await sendCampaignInstruction(client, creator, ix);
      setSignature(sig);
      setStatus('Campaign created. Redirecting…');
      router.push(`/campaign/${campaign}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell page">
      <Link className="back" href="/">
        ← All campaigns
      </Link>
      <div className="heading">
        <label>— START SOMETHING GOOD</label>
        <h1>
          Make your cause <i>count.</i>
        </h1>
        <p>Set the goal. Set the deadline. Let the program take care of the rules.</p>
      </div>
      <div className="form-grid">
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            The story behind your campaign <b>*</b>
          </label>
          <textarea
            rows={7}
            placeholder="Tell your community what you're raising money for…"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <small>Public description is hashed on-chain; the full text remains on this shareable page.</small>
          <label>
            Funding goal <b>*</b>
          </label>
          <div className="unit">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
            <b>SOL</b>
          </div>
          <label>
            Campaign duration <b>*</b>
          </label>
          <div className="durations">
            {DURATIONS.map((option) => (
              <button
                type="button"
                className={duration === option.label ? 'selected' : ''}
                onClick={() => setDuration(option.label)}
                key={option.label}
              >
                {option.label}
              </button>
            ))}
          </div>
          <hr />
          {!connected ? <p className="fine">Connect your wallet in the top bar to create a campaign.</p> : null}
          <button className="button dark" type="submit" disabled={busy || !connected}>
            {busy ? 'Creating…' : connected ? 'Create campaign ↗' : 'Connect wallet to create ↗'}
          </button>
          {status ? <p className="fine">{status}</p> : null}
          {signature ? (
            <p className="fine">
              <a href={explorerTx(signature)} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            </p>
          ) : null}
        </form>
        <aside>
          <strong>
            <Mark />
          </strong>
          <h2>
            Your terms,
            <br />
            <i>set in stone.</i>
          </h2>
          <p>Once created, the goal, deadline and refund rules cannot be changed by anyone.</p>
          <ol>
            <li>
              <b>01</b> Donors contribute directly to the vault.
            </li>
            <li>
              <b>02</b> Anyone can finalize after the deadline.
            </li>
            <li>
              <b>03</b> Goal met? Creator claims. Otherwise donors get refunds.
            </li>
          </ol>
          <Link href="/how-it-works">Read the full trust model ↗</Link>
        </aside>
      </div>
    </div>
  );
}
