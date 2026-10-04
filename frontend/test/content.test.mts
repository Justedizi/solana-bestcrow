import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeContent, decodeContent, contentMatchesHash, digest } from '../app/lib/charity-vault.ts';

test('content round-trips through the URL-safe encoding', () => {
  const content = { title: 'Warm meals', description: 'Winter drive ☃ for 120 families', milestones: [{ title: 'Kitchen' }, { title: 'Delivery' }] };
  const encoded = encodeContent(content);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/); // URL-safe, no padding
  assert.deepEqual(decodeContent(encoded), content);
});

test('decodeContent tolerates missing or malformed input', () => {
  assert.equal(decodeContent(null), null);
  assert.equal(decodeContent('not-base64!!'), null);
});

test('contentMatchesHash accepts the exact text and rejects changes', async () => {
  const text = 'exact on-chain description';
  const hash = await digest(text);
  assert.equal(await contentMatchesHash(text, hash), true);
  assert.equal(await contentMatchesHash('different', hash), false);
});
