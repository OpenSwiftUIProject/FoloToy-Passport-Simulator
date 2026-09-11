import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_FIRMWARE_PRESET_ID,
  FIRMWARE_PRESET_IDS_BY_URL_ID,
  MAX_FIRMWARE_BYTES,
} from "../public/firmware.js";

const publicRoot = new URL("../public/", import.meta.url);
const expectedPresets = new Map([
  ["/assets/firmware/pocket-2048.bin", "d6009ba20a34fdf7acb773278dc5f88425fc1f35c0c341abb505a7c11e7be36c"],
]);

test("ships every firmware preset referenced by the sidebar", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const catalog = JSON.parse(
    await readFile(new URL("assets/firmware/catalog.json", publicRoot), "utf8"),
  );
  const urls = [...html.matchAll(/data-firmware-url="([^"]+)"/g)]
    .map((match) => new URL(match[1], "https://example.org/").pathname);

  assert.deepEqual(urls, [...expectedPresets.keys()]);
  const files = await readdir(new URL("assets/firmware/", publicRoot));
  assert.deepEqual(files.filter(name => name.endsWith('.bin')), ['pocket-2048.bin']);
  const manifest = JSON.parse(await readFile(new URL('wasm/manifest.json', publicRoot), 'utf8'));
  assert.equal(manifest.firmware, urls[0]);
  const bundled = catalog.firmwares[0];
  assert.equal(bundled.communityUrl, 'https://ai-passport.folotoy.cn/plays/223/');
  assert.ok((await readFile(new URL(bundled.notices.slice(1), publicRoot))).byteLength > 0);
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.default, DEFAULT_FIRMWARE_PRESET_ID);
  assert.deepEqual(
    Object.values(FIRMWARE_PRESET_IDS_BY_URL_ID),
    catalog.firmwares.map((firmware) => firmware.id),
  );
  assert.deepEqual(
    catalog.firmwares.map((firmware) => firmware.file),
    [...expectedPresets.keys()],
  );

  for (const [index, [url, expectedSha256]] of [...expectedPresets].entries()) {
    const firmware = await readFile(new URL(url.slice(1), publicRoot));
    assert.ok(firmware.byteLength > 0);
    assert.ok(firmware.byteLength <= MAX_FIRMWARE_BYTES);
    assert.equal(catalog.firmwares[index].bytes, firmware.byteLength);
    assert.equal(catalog.firmwares[index].sha256, expectedSha256);
    assert.equal(
      createHash("sha256").update(firmware).digest("hex"),
      expectedSha256,
    );
  }
});
