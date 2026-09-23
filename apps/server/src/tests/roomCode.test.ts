import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateRoomCode, generateUniqueRoomCode, ROOM_CODE_PATTERN } from "../lib/roomCode.js";

function duplicateKeyError() {
  const error = new Error("E11000 duplicate key error collection: rooms index: roomCode_1");
  Object.assign(error, { code: 11000 });
  return error;
}

describe("generateRoomCode", () => {
  it("always produces exactly five numeric characters", () => {
    for (let index = 0; index < 1000; index += 1) {
      assert.match(generateRoomCode(), ROOM_CODE_PATTERN);
    }
  });

  it("spans the full code space uniformly (200k samples)", () => {
    // 200k draws over the 100k-code space: a uniform generator yields
    // ~86.5k distinct codes, while a constant, sequential, or repeating
    // generator yields far fewer. Collisions here are expected (birthday
    // paradox) — the database unique index plus retry handles them.
    const seen = new Set<string>();
    const samples = 200_000;
    for (let index = 0; index < samples; index += 1) {
      const code = generateRoomCode();
      assert.match(code, ROOM_CODE_PATTERN);
      seen.add(code);
    }
    assert.ok(seen.size >= 85_000, `expected at least 85000 distinct codes, got ${seen.size}`);
  });

  it("covers codes with leading zeros", () => {
    let sawLeadingZero = false;
    for (let index = 0; index < 50_000; index += 1) {
      if (generateRoomCode().startsWith("0")) {
        sawLeadingZero = true;
        break;
      }
    }
    assert.ok(sawLeadingZero, "expected the generator to produce leading-zero codes");
  });
});

describe("generateUniqueRoomCode", () => {
  it("returns the code that inserted successfully", async () => {
    const calls: string[] = [];
    const code = await generateUniqueRoomCode(async (candidate) => {
      calls.push(candidate);
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0], code);
    assert.match(code, ROOM_CODE_PATTERN);
  });

  it("retries on duplicate-key collisions until an insert succeeds", async () => {
    const calls: string[] = [];
    let attempts = 0;
    const code = await generateUniqueRoomCode(async (candidate) => {
      calls.push(candidate);
      attempts += 1;
      if (attempts < 3) throw duplicateKeyError();
    });
    assert.equal(calls.length, 3);
    assert.equal(calls[2], code);
  });

  it("gives up after the maximum number of duplicate collisions", async () => {
    let calls = 0;
    await assert.rejects(
      generateUniqueRoomCode(async () => {
        calls += 1;
        throw duplicateKeyError();
      }, 10),
      (error: unknown) => (error as { code?: unknown }).code === 11000,
    );
    assert.equal(calls, 10);
  });

  it("propagates non-duplicate errors immediately", async () => {
    let calls = 0;
    await assert.rejects(
      generateUniqueRoomCode(async () => {
        calls += 1;
        throw new Error("boom");
      }, 10),
      /boom/,
    );
    assert.equal(calls, 1);
  });
});
