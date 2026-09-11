import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { stageFirmware, readFirmware, removeFirmware, validateHandoff, sha256, HANDOFF_TTL } from '../public/browser-handoff.js';

const destination = 'https://example.org/FoloToy-Passport-Simulator/';
const image = new Uint8Array(0x10040).fill(0xe9);
image[0x8000] = 0xaa;
image[0x8001] = 0x50;
const bytes = image.buffer;
const checksum = await sha256(bytes);
const sourceSha256 = await sha256(new TextEncoder().encode('struct ContentView: View {}'));

test('browser handoff preserves bytes, destination and bounded retention', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => ++now);
  const first = await stageFirmware(bytes, checksum, sourceSha256, destination);
  assert.deepEqual(await readFirmware(first, destination), bytes);
  await assert.rejects(readFirmware(first, destination + 'other/'), /destination/);
  for (let i = 0; i < 3; ++i) await stageFirmware(bytes, checksum, sourceSha256, destination);
  await assert.rejects(readFirmware(first, destination), /not found/);
  const last = await stageFirmware(bytes, checksum, sourceSha256, destination);
  await removeFirmware(last);
  await assert.rejects(readFirmware(last, destination), /not found/);
});

test('expired, corrupt, oversized and application-less handoffs are rejected', async () => {
  const now = Date.now();
  const id = '1'.repeat(48);
  const record = { id, version: 1, bytes, sha256: checksum, sourceSha256, destination, expiresAt: now + HANDOFF_TTL };
  assert.deepEqual(await validateHandoff(record, id, destination, now), bytes);
  await assert.rejects(validateHandoff(record, id, destination, now + HANDOFF_TTL), /expired/);
  await assert.rejects(validateHandoff({ ...record, sha256: '0'.repeat(64) }, id, destination, now), /checksum/);
  await assert.rejects(validateHandoff({ ...record, version: 2 }, id, destination, now), /not found/);
  await assert.rejects(stageFirmware(new ArrayBuffer(8 * 1024 * 1024 + 1), checksum, sourceSha256, destination), /Invalid/);
  await assert.rejects(stageFirmware(new ArrayBuffer(64), checksum, sourceSha256, destination), /Invalid/);
  const noApp = image.slice(); noApp[0x10000] = 0;
  await assert.rejects(stageFirmware(noApp.buffer, await sha256(noApp), sourceSha256, destination), /application/);
  await assert.rejects(readFirmware('../file', destination), /Invalid/);
});
