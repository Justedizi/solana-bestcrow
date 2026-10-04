'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import { address, type Address, type Instruction } from '@solana/kit';

/** The program treats any program-owned account as "no split"; the system program is a safe default. */
const SYSTEM_PROGRAM_FALLBACK = address('11111111111111111111111111111111');

import {
  claimBondIx,
  claimRefundIx,
  claimSuccessIx,
  claimTerminationRefundIx,
  decodeContent,
  explorerTx,
  finalizeIx,
  finalizeVoteIx,
  formatSol,
  getCampaign,
  getClaim,
  getLedger,
  getMilestones,
  getSplit,
  parseSol,
  pledgeIx,
  refundAllIx,
  releaseInitialIx,
  releaseTrancheIx,
  shortAddress,
  shortHash,
  submitEvidenceIx,
  terminateIx,
  voteMilestoneIx,
  withdrawClaimIx,
  type Campaign,
  type Claim,
  type Ledger,
  type Milestone,
  type Split,
} from '../../lib/charity-vault';
import { fundingEligibility, milestoneEligibility } from '../../lib/eligibility';
import { Mark } from '../../mark';
import { sendCampaignInstruction } from '../../lib/send-campaign';
import type { AppClient } from '../../providers';

function countdown(deadline: number, now: number): string {  const remaining = deadline * 1000 - now;
  if (remaining <= 0) return 'deadline passed';
  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m ${secs}s left`;
}

type Action = {
  key: string;
  label: string;
  signer: string;
  description: string;
  available: boolean;
  reason?: string;
  variant: 'coral' | 'dark';
  run?: () => Promise<Instruction>;
};

export default function Detail() {
  const params = useParams<{ address: string }>();
  const searchParams = useSearchParams();
  const campaignAddress = params.address as Address;
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const wallet = connected ? address(connected.account.address) : null;

  // Title/description/milestone labels travel in the shareable link; the chain
  // only commits to their hash. Decode once.
  const content = useMemo(() => decodeContent(searchParams.get('c')), [searchParams]);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [split, setSplit] = useState<Split | null>(null);
  const [claims, setClaims] = useState<Record<number, Claim | null>>({});
  const [amount, setAmount] = useState('');
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getCampaign(client, campaignAddress);
      setCampaign(result);
      setLedger(result && wallet ? await getLedger(client, campaignAddress, wallet) : null);
      if (result?.staged) {
        const [found, splitAccount] = await Promise.all([
          getMilestones(client, result),
          getSplit(client, campaignAddress),
        ]);
        setMilestones(found);
        setSplit(splitAccount);
        const claimEntries = await Promise.all(
          found.map(async (m) => [m.index, await getClaim(client, campaignAddress, m.index)] as const),
        );
        setClaims(Object.fromEntries(claimEntries));
      } else {
        setMilestones([]);
        setSplit(null);
        setClaims({});
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load campaign');
    } finally {
      setLoaded(true);
    }
  }, [client, campaignAddress, wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  async function send(build: () => Promise<Instruction>, label: string) {
    if (!connected || !wallet) {
      setStatus('Connect a wallet first.');
      return;
    }
    if (!connected.signer) {
      setStatus('This wallet cannot sign transactions. Use Phantom on Devnet.');
      return;
    }
    setBusy(true);
    setSignature(null);
    setStatus(label);
    try {
      const instruction = await build();
      const sig = await sendCampaignInstruction(client, wallet, connected.signer, instruction);
      setSignature(sig);
      setStatus(`${label} confirmed.`);
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  }

  if (!campaign) {
    return (
      <div className="shell page detail">
        <Link className="back" href="/">
          ← All campaigns
        </Link>
        <p className="fine">{status ?? (loaded ? 'Campaign not found.' : 'Loading campaign from devnet…')}</p>
      </div>
    );
  }

  const goal = Number(formatSol(campaign.goal));
  const raised = Number(formatSol(campaign.raised));
  const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const elig = fundingEligibility({ campaign, ledger, wallet, nowMs: now });
  const active = campaign.status === 'Active';

  const baseActions: Action[] = [
    {
      key: 'pledge',
      label: 'Pledge',
      signer: 'donor',
      description: 'Move SOL into the program vault and create your donor ledger.',
      available: elig.canPledge,
      reason: elig.pledgeReason,
      variant: 'coral',
      run: () => pledgeIx(wallet!, campaign.address, parseSol(amount)),
    },
    {
      key: 'finalize',
      label: 'Finalize',
      signer: 'anyone',
      description: 'After the deadline, set the outcome to Succeeded or Refunded. Any donor may call this.',
      available: elig.canFinalize,
      reason: elig.finalizeReason,
      variant: 'dark',
      run: () => finalizeIx(wallet!, campaign.address),
    },
  ];

  const unstagedActions: Action[] = [
    {
      key: 'claim_success',
      label: 'Claim funds',
      signer: 'charity',
      description: 'If the goal was met, sweep the vault to the charity.',
      available: elig.canClaimSuccess,
      reason: elig.claimSuccessReason,
      variant: 'coral',
      run: () => claimSuccessIx(wallet!, campaign.address),
    },
    {
      key: 'claim_refund',
      label: elig.refundableAmount > 0n ? `Claim ${formatSol(elig.refundableAmount)} SOL refund` : 'Claim refund',
      signer: 'donor',
      description: 'Refund your exact pledge, once, if the goal was missed.',
      available: elig.canClaimRefund,
      reason: elig.claimRefundReason,
      variant: 'coral',
      run: () => claimRefundIx(wallet!, campaign.address),
    },
    {
      key: 'refund_all',
      label: `Refund all ${campaign.donors.length} donors in one tx`,
      signer: 'anyone',
      description: 'Repay every donor in a single transaction and drain the vault.',
      available: elig.canRefundAll,
      reason: elig.refundAllReason,
      variant: 'dark',
      run: () => refundAllIx(wallet!, campaign),
    },
  ];

  const stagedActions: Action[] = [
    {
      key: 'release_initial',
      label: `Release initial tranche (${formatSol(campaign.initialTranche)} SOL)`,
      signer: 'charity',
      description: 'Unlock the starting budget agreed at creation.',
      available: elig.canReleaseInitial,
      reason: elig.releaseInitialReason,
      variant: 'coral',
      run: () => releaseInitialIx(wallet!, campaign.address),
    },
    {
      key: 'claim_bond',
      label: `Reclaim bond (${formatSol(campaign.bond)} SOL)`,
      signer: 'charity',
      description: 'Return the creator bond once the campaign is not terminated.',
      available: elig.canClaimBond,
      reason: elig.claimBondReason,
      variant: 'dark',
      run: () => claimBondIx(wallet!, campaign.address),
    },
    {
      key: 'terminate',
      label: 'Terminate campaign',
      signer: 'creator / rejected',
      description: 'Freeze the remaining pool; a rejected milestone forfeits the bond to backers.',
      available: elig.canTerminate,
      reason: elig.terminateReason,
      variant: 'dark',
      run: () => terminateIx(wallet!, campaign.address),    },
    {
      key: 'claim_termination_refund',
      label:
        elig.terminationRefundAmount > 0n
          ? `Claim ${formatSol(elig.terminationRefundAmount)} SOL pro-rata refund`
          : 'Claim pro-rata refund',
      signer: 'donor',
      description: 'Your share of the frozen refund pool after termination.',
      available: elig.canClaimTerminationRefund,
      reason: elig.claimTerminationRefundReason,
      variant: 'coral',
      run: () => claimTerminationRefundIx(wallet!, campaign),
    },
  ];

  const actions = campaign.staged ? [...baseActions, ...stagedActions] : [...baseActions, ...unstagedActions];

  const statusText = active ? 'FUNDING OPEN' : campaign.status === 'Succeeded' ? 'GOAL REACHED' : 'REFUNDING';

  return (
    <div className="shell page detail">
      <Link className="back" href="/">
        ← All campaigns
      </Link>
      <label>— CAMPAIGN #{campaign.campaignId.toString()}</label>
      <h1>
        {content?.title?.trim() ? (
          content.title
        ) : (
          <>
            Giving, with <i>ground rules.</i>
          </>
        )}
      </h1>
      <div className="detail-grid">
        <div>
          <div className="detail-art">
            <div className="mark">
              <Mark />
            </div>
          </div>

          <article className="about">
            <h2>{content?.title?.trim() ? 'About this campaign' : 'Campaign description'}</h2>
            {content?.description?.trim() ? (
              <p className="about-text">{content.description}</p>
            ) : (
              <p className="fine">
                No description was shared with this link. The campaign's story is committed on-chain as
                hash <code>{shortHash(campaign.descHash)}</code>; ask the creator for the shareable link
                that contains the full text.
              </p>
            )}
            <p className="fine hash-line">
              Description hash <code>{shortHash(campaign.descHash)}</code> · goal{' '}
              {goal.toFixed(2)} SOL · {campaign.donors.length} supporter
              {campaign.donors.length === 1 ? '' : 's'}
            </p>
          </article>
          <div className="proof">
            <h3>On-chain proof</h3>
            <div className="row">
              <span>Campaign PDA</span>
              <a
                href={`https://explorer.solana.com/address/${campaign.address}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(campaign.address)} ↗
              </a>
            </div>
            <div className="row">
              <span>Creator</span>
              <a
                href={`https://explorer.solana.com/address/${campaign.creator}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(campaign.creator)} ↗
              </a>
            </div>
            {campaign.staged ? (
              <>
                <div className="row">
                  <span>Base budget</span>
                  <b>{formatSol(campaign.baseBudget)} SOL</b>
                </div>
                <div className="row">
                  <span>Released</span>
                  <b>
                    {formatSol(campaign.released)} / {formatSol(campaign.baseBudget)} SOL
                  </b>
                </div>
                {campaign.bond > 0n ? (
                  <div className="row">
                    <span>Creator bond</span>
                    <b>{campaign.bondForfeited ? 'forfeited' : `${formatSol(campaign.bond)} SOL`}</b>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {campaign.staged ? (
            <article>
              <h2>
                Milestones <small>({milestones.length}/{campaign.milestoneCount})</small>
              </h2>
              {milestones.length === 0 ? (
                <p className="fine">No milestones added yet.</p>
              ) : (
                milestones.map((milestone, index) => (
                  <MilestoneRow
                    key={milestone.index}
                    campaign={campaign}
                    milestone={milestone}
                    title={content?.milestones?.[index]?.title}
                    ledger={ledger}
                    wallet={wallet}
                    split={split}
                    claim={claims[milestone.index] ?? null}
                    now={now}
                    busy={busy}
                    evidence={evidenceDrafts[milestone.index] ?? ''}
                    setEvidence={(value) =>
                      setEvidenceDrafts((current) => ({ ...current, [milestone.index]: value }))
                    }
                    send={send}
                  />
                ))
              )}
            </article>
          ) : null}

          <article>
            <h2>
              Supporters <small>({campaign.donors.length})</small>
            </h2>
            {campaign.donors.length === 0 ? (
              <p className="fine">No pledges yet. Be the first.</p>
            ) : (
              campaign.donors.map((donor) => (
                <p className="supporter" key={donor}>
                  <span>{shortAddress(donor)}</span>
                  <a
                    href={`https://explorer.solana.com/address/${donor}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view ↗
                  </a>
                </p>
              ))
            )}
          </article>
        </div>

        <aside className="donate">
          <small>● {statusText}</small>
          <h2>
            {raised.toFixed(2)} <small>SOL raised</small>
          </h2>
          <div className="bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="stat">
            Goal <b>{goal.toFixed(2)} SOL</b>
          </p>
          <p className="stat">
            {elig.deadlinePassed ? 'Deadline' : 'Closing'} <b>{countdown(campaign.deadline, now)}</b>
          </p>

          {active && !elig.deadlinePassed ? (
            <input
              placeholder="0.00 SOL"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          ) : null}

          <div className="program-actions">
            {actions.map((action) => (
              <div className="program-action" key={action.key}>
                <div className="program-action-head">
                  <b>{action.label}</b>
                  <span className="tag">{action.signer}</span>
                </div>
                <p className="fine">{action.description}</p>
                {action.available ? (
                  <button
                    className={`button ${action.variant}`}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      try {
                        void send(action.run!, `${action.label}…`);
                      } catch (err) {
                        setStatus(err instanceof Error ? err.message : 'Invalid input');
                      }
                    }}
                  >
                    {busy ? 'Working…' : `${action.label} ↗`}
                  </button>
                ) : (
                  <p className="fine muted">{action.reason}</p>
                )}
              </div>
            ))}
          </div>

          <p className="fine">
            {campaign.staged
              ? 'Funds release only when backers approve a milestone. A failed campaign or termination returns the remaining pool pro-rata.'
              : 'Funds are locked until the deadline. If the goal is missed, donors can claim their exact contribution back.'}
          </p>
          {status ? <p className="fine">{status}</p> : null}
          {signature ? (
            <p className="fine">
              <a href={explorerTx(signature)} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MilestoneRow(props: {
  campaign: Campaign;
  milestone: Milestone;
  title?: string;
  ledger: Ledger | null;
  wallet: Address | null;
  split: Split | null;
  claim: Claim | null;
  now: number;
  busy: boolean;
  evidence: string;
  setEvidence: (value: string) => void;
  send: (build: () => Promise<Instruction>, label: string) => Promise<void>;
}) {
  const { campaign, milestone, title, ledger, wallet, split, claim, now, busy, evidence, setEvidence, send } = props;
  const elig = milestoneEligibility({
    milestone,
    campaign,
    ledger,
    wallet,
    claimClaimed: claim?.claimed ?? 0n,
    claimTotal: claim?.total ?? 0n,
  });
  const isCreator = wallet !== null && wallet === campaign.creator;
  const vested = claim
    ? claim.duration === 0
      ? claim.total
      : (claim.total * BigInt(Math.min(Math.max(Math.floor((now / 1000 - claim.start) / claim.duration), 0), 1) * 1000)) / 1000n
    : 0n;
  const withdrawable = vested > (claim?.claimed ?? 0n) ? vested - (claim?.claimed ?? 0n) : 0n;
  const totalVotes = milestone.approveWeight + milestone.rejectWeight;

  return (
    <div className="milestone">
      <div className="milestone-head">
        <div className="milestone-index">{milestone.index + 1}</div>
        <div className="milestone-title">
          <b>{title?.trim() || `Milestone ${milestone.index + 1}`}</b>
          <span className="fine">
            {formatSol(milestone.amount)} SOL · due {countdown(milestone.deadline, now)}
          </span>
        </div>
        <span className={`tag status-${milestone.status.toLowerCase()}`}>{milestone.status}</span>
      </div>

      <div className="vote-bar" title={`${elig.approvalPct}% approval`}>
        <i style={{ width: `${elig.approvalPct}%` }} />
      </div>
      <p className="fine">
        Approval <b>{elig.approvalPct}%</b> of {formatSol(totalVotes)} SOL voted
        {milestone.rejectWeight > 0n ? ` · ${formatSol(milestone.rejectWeight)} SOL against` : ''} · round {milestone.round} · needs 70%
      </p>
      {milestone.evidenceHash.some((byte) => byte !== 0) ? (
        <p className="fine">
          Evidence hash <code>{shortHash(milestone.evidenceHash)}</code>
        </p>
      ) : null}
      {claim ? (
        <p className="fine">
          Released {formatSol(claim.total)} SOL {claim.duration > 0 ? `· streamed ${Math.round(claim.duration / 60)}m` : '· instant'}
          {' · withdrawn '}
          {formatSol(claim.claimed)} SOL
        </p>
      ) : null}

      {elig.canSubmitEvidence ? (
        <div className="milestone-actions">
          <input
            placeholder="Evidence URL or hash text"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
          />
          <button
            className="button dark"
            type="button"
            disabled={busy || evidence.trim().length === 0}
            onClick={() =>
              import('../../lib/charity-vault').then(({ digest }) =>
                void digest(evidence.trim()).then((hash) =>
                  send(() => submitEvidenceIx(wallet!, campaign.address, milestone.index, hash), 'Submitting evidence…'),
                ),
              )
            }
          >
            Submit evidence ↗
          </button>
        </div>
      ) : null}

      {milestone.status === 'Submitted' ? (
        <div className="milestone-actions">
          <button
            className="button coral"
            type="button"
            disabled={busy || !elig.canVote}
            onClick={() =>
              void send(
                () => voteMilestoneIx(wallet!, campaign.address, milestone.index, milestone.round, true, milestone.address),
                'Approving…',
              )
            }
          >
            {elig.canVote ? 'Approve ↗' : 'Approve'}
          </button>
          <button
            className="button dark"
            type="button"
            disabled={busy || !elig.canVote}
            onClick={() =>
              void send(
                () => voteMilestoneIx(wallet!, campaign.address, milestone.index, milestone.round, false, milestone.address),
                'Rejecting…',
              )
            }
          >
            Reject
          </button>
          <button
            className="button dark"
            type="button"
            disabled={busy || !elig.canFinalizeVote}
            onClick={() =>
              void send(() => finalizeVoteIx(wallet!, campaign.address, milestone.index), 'Finalizing vote…')
            }
          >
            Finalize vote ↗
          </button>
        </div>
      ) : null}

      {isCreator && milestone.status === 'Released' ? (
        <div className="milestone-actions">
          {elig.canRelease ? (
            <button
              className="button coral"
              type="button"
              disabled={busy}
              onClick={() =>
                void send(() => releaseTrancheIx(wallet!, campaign.address, milestone.index, 0), 'Releasing tranche…')
              }
            >
              Release tranche ↗
            </button>
          ) : null}
          {claim && withdrawable > 0n ? (
            <button
              className="button dark"
              type="button"
              disabled={busy}
              onClick={() =>
                void send(
                  () =>
                    withdrawClaimIx(
                      wallet!,
                      campaign.address,
                      milestone.index,
                      split ? split.campaign : SYSTEM_PROGRAM_FALLBACK,
                      split ? split.recipients : [campaign.creator],
                    ),
                  'Withdrawing…',
                )
              }
            >
              Withdraw {formatSol(withdrawable)} SOL ↗
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
