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
  const [stageCount, setStageCount] = useState(2);

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
    const percentages = Array.from({ length: stageCount }, (_, index) => Number(values.get(`stage-${index}`) ?? 0));

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
      const days = (deadline - Math.floor(Date.now() / 1000)) / 86_400;
      if (days < 7 || days > 183) throw new Error('Funding must last between 7 and 183 days.');
      if (percentages.some((share) => !Number.isInteger(share) || share <= 0 || share > 50) || percentages.reduce((a, b) => a + b, 0) !== 100) {
        throw new Error('Milestone shares must be positive, at most 50% each, and add up to 100%.');
      }

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
        <p className="mt-2 text-sm text-slate-600">Startup campaigns use 2–5 fixed milestones. Terms lock before the first contribution.</p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm">
          Campaign ID
          <input className="mt-1 block w-full border border-slate-300 px-3 py-2" name="campaignId" inputMode="numeric" placeholder="173861" required />
        </label>
        <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">Milestone allocation</legend><label className="mt-2 block text-sm">Number of milestones<select className="mt-1 block w-full border border-slate-300 px-3 py-2" value={stageCount} onChange={(event) => setStageCount(Number(event.target.value))}>{[2,3,4,5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label><div className="mt-3 grid gap-3 sm:grid-cols-2">{Array.from({ length: stageCount }, (_, index) => <label key={index} className="text-sm">Milestone {index + 1} (%)<input className="mt-1 block w-full border border-slate-300 px-3 py-2" name={`stage-${index}`} type="number" min="1" max="50" defaultValue={index === 0 ? Math.floor(100 / stageCount) + (100 % stageCount) : Math.floor(100 / stageCount)} required /></label>)}</div><p className="mt-2 text-xs text-slate-500">Each share is capped at 50%; total must equal 100%. No creator deposit in MVP · success fee: 1%.</p></fieldset>
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
