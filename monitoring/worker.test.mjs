// Run: node --test monitoring/worker.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./worker.js', import.meta.url), 'utf8');
const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const { default: worker } = await import(url);
const env = { FIREBASE_PROJECT_ID: 'mt-hacqp' };
const request = (path, init) => new Request('https://worker.example' + path, init);

test('health reports disconnected metrics, not fake numbers', async () => {
  const res = await worker.fetch(request('/health'), env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.metricsConnected, false);
  assert.equal(data.projectConfigured, true);
});
test('private metrics reject unauthenticated requests', async () => {
  const res = await worker.fetch(request('/api/metrics'), env);
  assert.equal(res.status, 401);
});
test('private metrics reject invalid tokens', async () => {
  const res = await worker.fetch(request('/api/metrics', {
    headers: { Authorization: 'Bearer not-a-jwt' }
  }), env);
  assert.equal(res.status, 401);
});
test('disallowed CORS origin receives no allow-origin header', async () => {
  const res = await worker.fetch(request('/health', {
    headers: { Origin: 'https://untrusted.example' }
  }), env);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});
test('test-site origin receives its own CORS header', async () => {
  const res = await worker.fetch(request('/health', {
    headers: { Origin: 'https://mt-haccp-test.pages.dev' }
  }), env);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://mt-haccp-test.pages.dev');
});
test('unknown routes and methods fail closed', async () => {
  assert.equal((await worker.fetch(request('/unknown'), env)).status, 404);
  assert.equal((await worker.fetch(request('/api/metrics', { method: 'POST' }), env)).status, 405);
});
