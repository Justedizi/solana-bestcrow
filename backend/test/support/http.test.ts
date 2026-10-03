import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createTestFetch } from './http.js';

test('memory HTTP transport executes Express JSON parsing, routing, status and headers', async () => {
  const app = express();
  app.use(express.json());
  app.post('/wallets/:address', (req, res) => {
    res.status(201).set('X-Test-Transport', 'memory').json({
      address: req.params.address,
      query: req.query,
      body: req.body,
      authorization: req.headers.authorization,
      ip: req.ip,
    });
  });
  const testFetch = createTestFetch(app);
  const response = await testFetch(new URL('http://app.test/wallets/wallet-one?q=a%26b'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session' },
    body: JSON.stringify({ signatureBase64: 'signature' }),
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-test-transport'), 'memory');
  assert.deepEqual(await response.json(), {
    address: 'wallet-one', query: { q: 'a&b' }, body: { signatureBase64: 'signature' },
    authorization: 'Bearer test-session', ip: '127.0.0.1',
  });
});

test('memory HTTP transport accepts Request input and decodes a chunked response', async () => {
  const app = express();
  app.use(express.text());
  app.post('/echo', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.write('prefix:');
    res.end(req.body);
  });
  const response = await createTestFetch(app)(new Request('http://app.test/echo', {
    method: 'POST', body: 'hello',
  }));
  assert.equal(await response.text(), 'prefix:hello');
});

test('memory HTTP transport exercises Express parser errors and empty response bodies', async () => {
  const app = express();
  app.use(express.json());
  app.post('/parse', (_req, res) => res.status(204).end());
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    assert.ok(error instanceof SyntaxError);
    res.status(400).json({ error: 'Invalid JSON' });
  });
  const testFetch = createTestFetch(app);
  const invalid = await testFetch('http://app.test/parse', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid',
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'Invalid JSON' });
  const empty = await testFetch('http://app.test/parse', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(empty.status, 204);
  assert.equal(await empty.text(), '');
});

test('memory HTTP transport aborts requests without waiting for route completion', async () => {
  const app = express();
  app.get('/pending', () => {});
  const controller = new AbortController();
  const result = createTestFetch(app)('http://app.test/pending', { signal: controller.signal });
  setImmediate(() => controller.abort());
  await assert.rejects(result, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
});
