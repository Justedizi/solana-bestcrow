'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import type { Address } from '@solana/kit';

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

export default function Detail() {
  const params = useParams<{ address: string }>();
  const address = params.address as Address;
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);

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
      const result = await getCampaign(client, address);
      setCampaign(result);
      if (result && connected) {
        setLedger(await getLedger(client, address, connected.account.address));
      } else {
        setLedger(null);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load campaign');
    } finally {
      setLoaded(true);
    }
  }, [client, address, connected]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  async function run(build: () => Promise<import('@solana/kit').Instruction>, label: string) {
    if (!connected) {
      setStatus('Connect a wallet first.');
      return;
    }
    setBusy(true);
    setSignature(null);
    setStatus(label);
    try {
      const instruction = await build();
      const sig = await sendCampaignInstruction(client, connected.account.address, instruction);
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
  const deadlinePassed = campaign.deadline * 1000 <= now;
  const isCreator = connected?.account.address === campaign.creator;
  const statusText =
    campaign.status === 'Active' ? 'FUNDING OPEN' : campaign.status === 'Succeeded' ? 'GOAL REACHED' : 'REFUNDING';

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
          <div className="detail-art">✳</div>
          <article>
            <h2>Campaign vault</h2>
            <p>
              <a
                href={`https://explorer.solana.com/address/${campaign.address}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(campaign.address)}
              </a>{' '}
              · creator {shortAddress(campaign.creator)}
            </p>
          </article>
          <article>
            <h2>
              Supporters <small>({campaign.donors.length})</small>
            </h2>
            {campaign.donors.length === 0 ? (
              <p className="fine">No pledges yet. Be the first.</p>
            ) : (
              campaign.donors.map((donor) => (
                <p className="supporter" key={donor}>
                  ✳ &nbsp; {shortAddress(donor)}
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
            {deadlinePassed ? 'Deadline' : 'Closing'} <b>{countdown(campaign.deadline, now)}</b>
          </p>

          {campaign.status === 'Active' && !deadlinePassed ? (
            <>
              <input
                placeholder="0.00 SOL"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <button
                className="button coral"
                type="button"
                disabled={busy || !connected}
                onClick={() => {
                  try {
                    const value = parseSol(amount);
                    void run(
                      () => pledgeIx(connected!.account.address, campaign.address, value),
                      'Pledging…',
                    );
                  } catch (err) {
                    setStatus(err instanceof Error ? err.message : 'Enter a positive amount.');
                  }
                }}
              >
                {connected ? 'Pledge ↗' : 'Connect wallet to pledge ↗'}
              </button>
            </>
          ) : null}

          {campaign.status === 'Active' && deadlinePassed ? (
            <button
              className="button coral"
              type="button"
              disabled={busy || !connected}
              onClick={() => void run(() => finalizeIx(connected!.account.address, campaign.address), 'Finalizing…')}
            >
              Finalize outcome ↗
            </button>
          ) : null}

          {campaign.status === 'Succeeded' && isCreator ? (
            <button
              className="button coral"
              type="button"
              disabled={busy || campaign.paid}
              onClick={() =>
                void run(() => claimSuccessIx(connected!.account.address, campaign.address), 'Claiming…')
              }
            >
              {campaign.paid ? 'Funds already claimed' : 'Claim funds ↗'}
            </button>
          ) : null}

          {campaign.status === 'Refunded' && ledger && !ledger.claimed ? (
            <button
              className="button coral"
              type="button"
              disabled={busy || !connected}
              onClick={() => void run(() => claimRefundIx(connected!.account.address, campaign.address), 'Refunding…')}
            >
              Claim your {formatSol(ledger.amount)} SOL refund ↗
            </button>
          ) : null}

          {campaign.status === 'Refunded' && campaign.donors.length > 0 ? (
            <button
              className="button dark"
              type="button"
              disabled={busy || !connected}
              onClick={() =>
                void run(
                  () => refundAllIx(connected!.account.address, campaign),
                  'Refunding everyone in one transaction…',
                )
              }
            >
              Refund all {campaign.donors.length} donors in one tx ↗
            </button>
          ) : null}

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
