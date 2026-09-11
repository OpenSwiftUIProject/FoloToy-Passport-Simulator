import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FIRMWARE_PRESET_ID,
  FIRMWARE_PRESET_IDS_BY_URL_ID,
  MAX_FIRMWARE_BYTES,
  formatFirmwareSize,
  resolveCommunityPlayUrl,
  resolveFirmwarePresetId,
  validateFirmwareFile,
} from "../public/firmware.js";

const availablePresetIds = Object.values(FIRMWARE_PRESET_IDS_BY_URL_ID);

test("uses Pocket 2048 as the only bundled preset", () => {
  assert.deepEqual(availablePresetIds, ["pocket-2048"]);
  for (const search of ["", "?id=1", "?play=223", "?debug=network", "?id=", "?id=0", "?id=2", "?id=3", "?id=4", "?id=5", "?id=01", "?id=../file"]) {
    assert.equal(resolveFirmwarePresetId(search, availablePresetIds), "pocket-2048");
  }
});

test("bundled community ID does not need the community import API", () => {
  assert.equal(resolveCommunityPlayUrl("?play=223"), null);
  assert.equal(resolveCommunityPlayUrl("?id=1&play=223"), null);
});

test("resolves a community play ID from the URL", () => {
  assert.equal(
    resolveCommunityPlayUrl("?play=100"),
    "https://ai-passport.folotoy.cn/plays/100/",
  );
  assert.equal(
    resolveCommunityPlayUrl("?debug=network&play=71&id=1"),
    "https://ai-passport.folotoy.cn/plays/71/",
  );
  assert.equal(resolveCommunityPlayUrl("?id=1"), null);
});

test("rejects invalid community play IDs from the URL", () => {
  for (const search of [
    "?play=",
    "?play=0",
    "?play=-1",
    "?play=1.5",
    "?play=001",
    "?play=answer-book",
  ]) {
    assert.throws(
      () => resolveCommunityPlayUrl(search),
      /play 必须是正整数玩法 ID/,
    );
  }
});

test("accepts non-empty .bin files up to the Flash capacity", () => {
  assert.doesNotThrow(() => validateFirmwareFile({
    name: "FoloToy-AI-Passport-full.BIN",
    size: MAX_FIRMWARE_BYTES,
  }));
});

test("rejects unsupported, empty, and oversized firmware files", () => {
  assert.throws(
    () => validateFirmwareFile({ name: "firmware.zip", size: 1024 }),
    /请选择 \.bin 固件镜像/,
  );
  assert.throws(
    () => validateFirmwareFile({ name: "firmware.bin", size: 0 }),
    /固件文件为空/,
  );
  assert.throws(
    () => validateFirmwareFile({ name: "firmware.bin", size: MAX_FIRMWARE_BYTES + 1 }),
    /8 MB Flash/,
  );
});

test("formats firmware sizes for the upload status", () => {
  assert.equal(formatFirmwareSize(1024), "1 KB");
  assert.equal(formatFirmwareSize(1_353_184), "1.29 MB");
});
