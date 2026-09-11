import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(directory, "..", "public");
const catalog = JSON.parse(await readFile(path.join(publicRoot, 'assets/firmware/catalog.json'), 'utf8'));
const bundled = catalog.firmwares.find(item => item.id === catalog.default);
assert.ok(bundled, 'default firmware missing from catalog');
assert.match(bundled.file, /^\/assets\/firmware\/[a-z0-9-]+\.bin$/);
const firmwarePath = path.join(publicRoot, bundled.file.slice(1));
const wasmPath = path.join(publicRoot, "wasm", "pkg", "esp_emu_bg.wasm");
const wrapperPath = path.join(publicRoot, "wasm", "pkg", "esp_emu.js");

const firmware = await readFile(firmwarePath);
const wasmBytes = await readFile(wasmPath);

assert.equal(
  createHash("sha256").update(firmware).digest("hex"),
  bundled.sha256,
  "bundled firmware checksum mismatch",
);
assert.equal(firmware.byteLength, bundled.bytes, 'bundled firmware size mismatch');
assert.ok(firmware.byteLength > 0x10000 && firmware[0] === 0xe9 && firmware[0x10000] === 0xe9
  && firmware[0x8000] === 0xaa && firmware[0x8001] === 0x50, 'expected a full firmware image');
assert.equal(
  createHash("sha256").update(wasmBytes).digest("hex"),
  "1c693687ba9cd7414d7be09c5916306a672029169ad7c2d4acd7629e97bb6b14",
  "patched ESP-EMU checksum mismatch",
);

const { default: init } = await import(pathToFileURL(wrapperPath));
const wasm = await init({ module_or_path: wasmBytes });
assert.equal(wasm.ap_board_abi_version(), 1, "unsupported board ABI");

process.stdout.write(
  `Verified ${bundled.title} firmware (${firmware.byteLength} bytes) and board ABI v1\n`,
);
