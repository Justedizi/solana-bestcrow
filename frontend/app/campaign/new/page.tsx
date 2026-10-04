'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import { address } from '@solana/kit';

import {
  addMilestoneIx,
  createCampaignIx,
  createStagedCampaignIx,
  digest,
  encodeContent,
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

const DURATION_UNITS: { label: string; seconds: number }[] = [
  { label: 'minutes', seconds: 60 },
  { label: 'hours', seconds: 3_600 },
  { label: 'days', seconds: 86_400 },
  { label: 'weeks', seconds: 604_800 },
];

const MILESTONE_LABELS = ['Initial release', 'Development', 'Production', 'Delivery', 'Completion'];

type MilestoneDraft = { amount: string; days: string; title: string };

/** Human-readable duration for the deadline preview. */
function describeDuration(seconds: number): string {
  if (seconds % 604_800 === 0) return `${seconds / 604_800} week${seconds === 604_800 ? '' : 's'}`;
  if (seconds % 86_400 === 0) return `${seconds / 86_400} day${seconds === 86_400 ? '' : 's'}`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600} hour${seconds === 3_600 ? '' : 's'}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
  return `${seconds} seconds`;
}

export default function New() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  // `duration` is canonical seconds; the preset buttons and the custom
  // value+unit input both write to it.
  const [durationSeconds, setDurationSeconds] = useState(86_400);
  const [customAmount, setCustomAmount] = useState('2');
  const [customUnit, setCustomUnit] = useState('days');
  const [status, setStatus] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Staged (Bundle A) options
  const [staged, setStaged] = useState(false);
  const [baseBudget, setBaseBudget] = useState('');
  const [initialTranche, setInitialTranche] = useState('');
  const [bond, setBond] = useState('');
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { amount: '', days: '7', title: MILESTONE_LABELS[0]! },
    { amount: '', days: '14', title: MILESTONE_LABELS[1]! },
    { amount: '', days: '21', title: MILESTONE_LABELS[2]! },
  ]);

  function updateMilestone(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function applyCustomDuration() {
    const unit = DURATION_UNITS.find((u) => u.label === customUnit)?.seconds ?? 86_400;
    const amount = Number(customAmount);
    if (Number.isFinite(amount) && amount > 0) setDurationSeconds(Math.round(amount * unit));
  }

  async function submit() {
    setSignature(null);
    if (!connected) {
      setStatus('Connect your wallet first.');
      return;
    }
    if (!connected.signer) {
      setStatus('This wallet cannot sign transactions. Use Phantom on Devnet.');
      return;
    }
    const seconds = durationSeconds;
    if (!Number.isFinite(seconds) || seconds < 30) {
      setStatus('Pick a duration of at least 30 seconds.');
      return;
    }

    setBusy(true);
    try {
      setStatus('Awaiting wallet signature…');
      const creator = address(connected.account.address);
      const campaignId = BigInt(Date.now());
      const deadline = Math.floor(Date.now() / 1000) + seconds;
      // The on-chain account commits to the SHA-256 of the description only.
      const descHash = await digest(description.trim());

      if (staged) {
        const budget = parseSol(baseBudget);
        const tranche = parseSol(initialTranche || '0.000000001');
        const bondAmount = bond.trim() ? parseSol(bond) : 0n;
        const { campaign, ix } = await createStagedCampaignIx(
          creator,
          campaignId,
          parseSol(goal),
          deadline,
          descHash,
          budget,
          tranche,
          bondAmount,
        );
        const sig = await sendCampaignInstruction(client, creator, connected.signer, ix);
        setSignature(sig);
        setStatus('Staged campaign created. Adding milestones…');

        const filled = milestones.filter((m) => m.amount.trim().length > 0);
        for (let index = 0; index < filled.length; index += 1) {
          const milestone = filled[index]!;
          const milestoneDeadline =
            Math.floor(Date.now() / 1000) + Number(milestone.days || '7') * 86_400;
          const milestoneLabel = milestone.title.trim() || `Milestone ${index + 1}`;
          const evidenceHash = await digest(`${milestoneLabel}:${milestone.amount}`);
          const milestoneIx = await addMilestoneIx(
            creator,
            campaign,
            index,
            parseSol(milestone.amount),
            milestoneDeadline,
            evidenceHash,
          );
          await sendCampaignInstruction(client, creator, connected.signer, milestoneIx);
        }
        setStatus('Campaign ready. Redirecting…');
        const content = encodeContent({
          title: title.trim(),
          description: description.trim(),
          milestones: filled.map((m) => ({ title: m.title.trim() })),
        });
        router.push(`/campaign/${campaign}?c=${encodeURIComponent(content)}`);
        return;
      }

      const { campaign, ix } = await createCampaignIx(creator, campaignId, parseSol(goal), deadline, descHash);
      const sig = await sendCampaignInstruction(client, creator, connected.signer, ix);
      setSignature(sig);
      setStatus('Campaign created. Redirecting…');
      const content = encodeContent({ title: title.trim(), description: description.trim() });
      router.push(`/campaign/${campaign}?c=${encodeURIComponent(content)}`);
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
            Campaign title <b>*</b>
          </label>
          <input
            type="text"
            maxLength={80}
            placeholder="Warm meals for 120 families"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label>
            The story behind your campaign <b>*</b>
          </label>
          <textarea
            rows={7}
            placeholder="Tell your community what you're raising money for…"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <small>
            The description is hashed on-chain so it can never be changed; the full text travels in this
            page's shareable link.
          </small>
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
                className={durationSeconds === option.seconds ? 'selected' : ''}
                onClick={() => setDurationSeconds(option.seconds)}
                key={option.label}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="custom-duration">
            <span className="fine">or set your own:</span>
            <input
              type="number"
              min="1"
              step="1"
              value={customAmount}
              onChange={(event) => setCustomAmount(event.target.value)}
              onBlur={applyCustomDuration}
            />
            <select value={customUnit} onChange={(event) => setCustomUnit(event.target.value)}>
              {DURATION_UNITS.map((unit) => (
                <option value={unit.label} key={unit.label}>
                  {unit.label}
                </option>
              ))}
            </select>
            <button type="button" className="outline" onClick={applyCustomDuration}>
              Set
            </button>
          </div>
          <small>
            Deadline: {describeDuration(durationSeconds)} from now.
          </small>
          <hr />
          <label className="staged-toggle">
            <input type="checkbox" checked={staged} onChange={(event) => setStaged(event.target.checked)} />
            Milestone-gated funding (staged)
          </label>
          <small>
            Release funds in stages: backers approve each milestone before the next tranche unlocks. On a
            failed vote the remaining pool is refunded pro-rata.
          </small>

          {staged ? (
            <div className="staged-fields">
              <label>
                Base budget <b>*</b>
              </label>
              <div className="unit">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={baseBudget}
                  onChange={(event) => setBaseBudget(event.target.value)}
                />
                <b>SOL</b>
              </div>
              <label>Initial tranche (unlocked on success)</label>
              <div className="unit">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={initialTranche}
                  onChange={(event) => setInitialTranche(event.target.value)}
                />
                <b>SOL</b>
              </div>
              <label>Creator bond (forfeited if a milestone is rejected)</label>
              <div className="unit">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={bond}
                  onChange={(event) => setBond(event.target.value)}
                />
                <b>SOL</b>
              </div>

              <label>Milestones (title, amount, and days from now)</label>
              {milestones.map((milestone, index) => (
                <div className="unit" key={index}>
                  <input
                    type="text"
                    placeholder={`Milestone ${index + 1} title`}
                    value={milestone.title}
                    onChange={(event) => updateMilestone(index, { title: event.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="amount"
                    value={milestone.amount}
                    onChange={(event) => updateMilestone(index, { amount: event.target.value })}
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="days"
                    value={milestone.days}
                    onChange={(event) => updateMilestone(index, { days: event.target.value })}
                  />
                </div>
              ))}
              <small>
                Each milestone is capped at 50% of the base budget and the schedule cannot exceed it.
              </small>
            </div>
          ) : null}

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
