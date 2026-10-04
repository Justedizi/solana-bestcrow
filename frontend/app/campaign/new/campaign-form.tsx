'use client';

import { useState } from 'react';
import { address } from '@solana/kit';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { client } from '../../providers';
import { createCampaignIx, digest, parseSol } from '../../lib/charity-vault';
import { sendCampaignInstruction } from '../../lib/send-campaign';

export default function CampaignForm() {
  const connected = useConnectedWallet(client);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected?.signer) {
      setStatus('Connect a signing wallet in the upper-right corner first.');
      return;
    }

    const values = new FormData(event.currentTarget);
    const idText = String(values.get('campaignId') ?? '').trim();
    const goalText = String(values.get('goal') ?? '').trim();
    const deadlineText = String(values.get('deadline') ?? '');
    const description = String(values.get('description') ?? '');

    setBusy(true);
    setStatus('');
    try {
      if (!/^\d+$/.test(idText)) throw new Error('Campaign ID must be a non-negative whole number.');
      const campaignId = BigInt(idText);
      const goal = parseSol(goalText);
      const deadlineMs = new Date(deadlineText).getTime();
      if (!Number.isFinite(deadlineMs)) throw new Error('Choose a deadline date and time.');
      const deadline = Math.floor(deadlineMs / 1000);
      if (deadline <= Math.floor(Date.now() / 1000)) throw new Error('Deadline must be in the future.');

      const creator = address(connected.account.address);
      const { campaign, ix } = await createCampaignIx(creator, campaignId, goal, deadline, await digest(description));
      setStatus('Approve the transaction in Phantom...');
      const signature = await sendCampaignInstruction(client, creator, connected.signer, ix);
      setStatus(`Campaign created at ${campaign}. Transaction: ${signature}`);
      event.currentTarget.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Campaign creation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 id="new-campaign-title" className="text-2xl font-medium">Create campaign</h1>
        <p className="mt-2 text-sm text-slate-600">Create a campaign on Devnet.</p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm">
          Campaign ID
          <input className="mt-1 block w-full border border-slate-300 px-3 py-2" name="campaignId" inputMode="numeric" placeholder="173861" required />
        </label>
        <label className="block text-sm">
          Goal (SOL)
          <input className="mt-1 block w-full border border-slate-300 px-3 py-2" name="goal" inputMode="decimal" placeholder="1" required />
        </label>
        <label className="block text-sm">
          Deadline
          <input className="mt-1 block w-full border border-slate-300 px-3 py-2" name="deadline" type="datetime-local" required />
        </label>
        <label className="block text-sm">
          Description
          <textarea className="mt-1 block min-h-24 w-full border border-slate-300 px-3 py-2" name="description" required />
        </label>
        <button className="border border-slate-900 px-3 py-2 text-sm hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={busy}>
          {busy ? 'Approve in wallet...' : 'Sign & create campaign'}
        </button>
      </form>

      {status ? <p className="break-words text-sm text-slate-700" role="status">{status}</p> : null}
    </div>
  );
}
