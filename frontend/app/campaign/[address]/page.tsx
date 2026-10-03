'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import { address, type Address, type Instruction } from '@solana/kit';

import {
  claimRefundIx,
  claimSuccessIx,
  explorerTx,
  finalizeIx,
  formatSol,
  getCampaign,
  getLedger,
  parseSol,
  pledgeIx,
  refundAllIx,
  shortAddress,
  type Campaign,
  type Ledger,
} from '../../lib/charity-vault';
import { fundingEligibility } from '../../lib/eligibility';
import { Mark } from '../../mark';
import { sendCampaignInstruction } from '../../lib/send-campaign';
import type { AppClient } from '../../providers';

function countdown(deadline: number, now: number): string {
  const remaining = deadline * 1000 - now;
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
  const campaignAddress = params.address as Address;
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const wallet = connected ? address(connected.account.address) : null;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getCampaign(client, campaignAddress);
      setCampaign(result);
      if (result && wallet) {
        setLedger(await getLedger(client, campaignAddress, wallet));
      } else {
        setLedger(null);
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
    if (!wallet) {
      setStatus('Connect a wallet first.');
      return;
    }
    setBusy(true);
    setSignature(null);
    setStatus(label);
    try {
      const instruction = await build();
      const sig = await sendCampaignInstruction(client, wallet, instruction);
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
  // Single source of truth for "can this wallet act?" — mirrors the program.
  const elig = fundingEligibility({ campaign, ledger, wallet, nowMs: now });
  const active = campaign.status === 'Active';

  const actions: Action[] = [
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
      label:
        elig.refundableAmount > 0n
          ? `Claim ${formatSol(elig.refundableAmount)} SOL refund`
          : 'Claim refund',
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

  const statusText = active ? 'FUNDING OPEN' : campaign.status === 'Succeeded' ? 'GOAL REACHED' : 'REFUNDING';

  return (
    <div className="shell page detail">
      <Link className="back" href="/">
        ← All campaigns
      </Link>
      <label>— CAMPAIGN #{campaign.campaignId.toString()}</label>
      <h1>
        Giving, with <i>ground rules.</i>
      </h1>
      <div className="detail-grid">
        <div>
          <div className="detail-art">
            <div className="mark">
              <Mark />
            </div>
          </div>
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
          </div>
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
            Funds are locked until the deadline. If the goal is missed, donors can claim their exact contribution back.
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
