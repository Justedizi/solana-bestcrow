'use client';

import { useEffect, useState } from 'react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';

import { authenticatedJson, getWalletSession } from '../lib/wallet-session';
import { client } from '../providers';

type Profile = {
  organizationName: string | null;
  organizationDescription: string | null;
  website: string | null;
};
type ProfileResponse = Profile & { userId: string; updatedAt: number };
const emptyProfile: Profile = { organizationName: '', organizationDescription: '', website: '' };

export default function ProfilePage() {
  const connected = useConnectedWallet(client);
  const connectedAddress = connected?.account.address;
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setProfile(emptyProfile);
      if (!connectedAddress) {
        setAuthenticated(false);
        setLoading(false);
        setStatus('Connect the wallet and approve the ownership message to edit a creator profile.');
        return;
      }
      const session = getWalletSession(connectedAddress);
      if (!session) {
        setAuthenticated(false);
        setLoading(false);
        setStatus('Approve the ownership message in the wallet to edit a creator profile.');
        return;
      }
      setAuthenticated(true);
      setLoading(true);
      setStatus('Loading profile…');
      try {
        const value = await authenticatedJson<ProfileResponse | null>('/api/accounts/me/profile');
        if (!active) return;
        setProfile(value ? {
          organizationName: value.organizationName ?? '',
          organizationDescription: value.organizationDescription ?? '',
          website: value.website ?? '',
        } : emptyProfile);
        setStatus(value ? '' : 'No creator profile yet. Add organization details when ready.');
      } catch (reason) {
        if (active) {
          setAuthenticated(!!getWalletSession(connectedAddress));
          setStatus(reason instanceof Error ? reason.message : 'Profile could not be loaded.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    window.addEventListener('bestcrow:session', load);
    return () => {
      active = false;
      window.removeEventListener('bestcrow:session', load);
    };
  }, [connectedAddress]);

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!connectedAddress || !getWalletSession(connectedAddress)) {
      setAuthenticated(false);
      setStatus('Approve the ownership message in the wallet before saving this profile.');
      return;
    }
    const organizationName = profile.organizationName?.trim() || null;
    const organizationDescription = profile.organizationDescription?.trim() || null;
    const website = profile.website?.trim() || null;
    if (organizationName && organizationName.length > 160) {
      setStatus('Organization name must be 160 characters or fewer.');
      return;
    }
    if (organizationDescription && organizationDescription.length > 4_000) {
      setStatus('Organization description must be 4,000 characters or fewer.');
      return;
    }
    if (website) {
      try { new URL(website); } catch { setStatus('Website must be a complete URL, for example https://example.org.'); return; }
    }
    setBusy(true);
    setStatus('Saving…');
    try {
      const value = await authenticatedJson<ProfileResponse>('/api/accounts/me/profile', {
        method: 'PUT',
        body: JSON.stringify({ organizationName, organizationDescription, website }),
      });
      setProfile({
        organizationName: value.organizationName ?? '',
        organizationDescription: value.organizationDescription ?? '',
        website: value.website ?? '',
      });
      setStatus('Creator profile saved. It is a self-published claim, not platform verification.');
    } catch (reason) {
      setAuthenticated(!!getWalletSession(connectedAddress));
      setStatus(reason instanceof Error ? reason.message : 'Profile could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const canEdit = !!connectedAddress && authenticated && !loading;
  return (
    <section className="max-w-2xl" aria-labelledby="profile-title">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Self-published creator identity</p>
      <h1 id="profile-title" className="display-font mt-3 text-5xl font-semibold">Creator profile</h1>
      <p className="mt-4 text-sm leading-6 text-slate-600">These organization details help backers understand who is receiving funds. Bestcrow does not verify or endorse them.</p>
      <form className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6" onSubmit={(event) => void save(event)} aria-busy={busy || loading}>
        <label className="block text-sm font-medium" htmlFor="organization-name">Organization name
          <input id="organization-name" className="field" maxLength={160} value={profile.organizationName ?? ''} onChange={(event) => setProfile((current) => ({ ...current, organizationName: event.target.value }))} disabled={!canEdit || busy} />
        </label>
        <label className="block text-sm font-medium" htmlFor="organization-description">Organization description
          <textarea id="organization-description" className="field min-h-28" maxLength={4_000} value={profile.organizationDescription ?? ''} onChange={(event) => setProfile((current) => ({ ...current, organizationDescription: event.target.value }))} disabled={!canEdit || busy} />
        </label>
        <label className="block text-sm font-medium" htmlFor="organization-website">Website
          <input id="organization-website" className="field" type="url" maxLength={500} placeholder="https://" value={profile.website ?? ''} onChange={(event) => setProfile((current) => ({ ...current, website: event.target.value }))} disabled={!canEdit || busy} />
        </label>
        <button className="action-primary" type="submit" disabled={!canEdit || busy}>
          {busy ? 'Saving…' : loading ? 'Loading…' : 'Save profile claim'}
        </button>
      </form>
      {status ? <p className="mt-5 rounded-xl bg-slate-100 p-4 text-sm" role="status">{status}</p> : null}
    </section>
  );
}
