import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { createAppServer } from '../server.mjs';
import { playgroundOrigins } from '../playground-import.mjs';

const origin = 'https://openswiftuiproject.github.io';
const firmware = Buffer.alloc(0x10040, 0xff);
firmware[0] = firmware[0x10000] = 0xe9;
firmware[0x8000] = 0xaa; firmware[0x8001] = 0x50;
const digest = createHash('sha256').update(firmware).digest('hex');
async function serverFor(t, enabled = true) {
  const server = createAppServer({ allowLocalFirmwareUpload: enabled, playgroundOrigins: [origin] });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
function upload(base, body = firmware, source = origin, hash = digest) {
  return fetch(`${base}/api/playground-firmware`, { method: 'POST',
    headers: { Origin: source, 'Content-Type': 'application/octet-stream', 'X-Firmware-SHA256': hash }, body });
}
test('origin configuration accepts exact HTTPS and loopback origins only', () => {
  assert.deepEqual(playgroundOrigins(['--playground-origin', origin]), [origin]);
  for (const value of ['https://example.com/path', 'http://example.com', 'https://u:p@example.com']) {
    assert.throws(() => playgroundOrigins(['--playground-origin', value]));
  }
});
test('firmware round trip preserves bytes, isolation and bounded retention', async t => {
  const base = await serverFor(t);
  const response = await upload(base);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
  const first = await response.json();
  assert.match(first.url, /^\/\?playground=[a-f0-9]{48}$/);
  const bytes = await fetch(`${base}/api/playground-firmware/${first.id}`);
  assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), firmware);
  for (let i = 0; i < 3; i++) assert.equal((await upload(base)).status, 201);
  assert.equal((await fetch(`${base}/api/playground-firmware/${first.id}`)).status, 404);
});
test('import rejects disabled capability, wrong origin, hash and non-full firmware', async t => {
  const disabled = await serverFor(t, false);
  assert.equal((await upload(disabled)).status, 403);
  const base = await serverFor(t);
  assert.equal((await upload(base, firmware, 'https://other.example')).status, 403);
  assert.equal((await upload(base, firmware, origin, '0'.repeat(64))).status, 422);
  assert.equal((await upload(base, Buffer.from('wasm'))).status, 422);
  const preflight = await fetch(`${base}/api/playground-firmware`, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,x-firmware-sha256',
    'Access-Control-Request-Private-Network': 'true',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
});
