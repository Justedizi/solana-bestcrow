import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Store } from '../../src/db/index.js';
import { RewardRepository } from '../../src/sectors/accounts/rewards/repository.js';
import { RewardService } from '../../src/sectors/accounts/rewards/service.js';

const CREATOR = '74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG';
const BACKER = '11111111111111111111111111111111';
const CAMPAIGN = 'So11111111111111111111111111111111111111112';

test('server rewards require a confirmed contribution and are idempotent', () => {
  const store = new Store(':memory:');
  try {
    store.upsertCampaign({ address: CAMPAIGN, creator: CREATOR, campaignId: 1n, goal: 10n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 100), descHash: '00'.repeat(32), raised: 20n,
      paid: false, status: 'succeeded', donorCount: 1, bump: 1, vault: null, vaultLamports: 20n, slot: 1 });
    store.upsertDonor({ campaign: CAMPAIGN, donor: BACKER, amount: 5n, claimed: false, bump: 1 });
    const service = new RewardService(new RewardRepository(store.db), store, () => 10);
    const offer = service.create({ campaign: CAMPAIGN, title: 'Game key', type: 'code', content: 'KEY-123', minAmount: '5', quantity: 1 }, [{ address: CREATOR }]);
    const claim = service.claim(offer.id, null, [{ address: BACKER }]);
    assert.equal(claim.status, 'fulfilled');
    assert.equal(claim.deliveredContent, 'KEY-123');
    assert.throws(() => service.claim(offer.id, null, [{ address: BACKER }]), /already claimed|sold out/);
  } finally { store.close(); }
});
