/**
 * [REQ:P1-N09] Resource snapshot encoding (stamina/health/mana pillars)
 * Goal: Validate the bit-packed 32-bit layout for resource snapshots and
 *       demonstrate round-trip behaviour (encode -> decode) within the
 *       rounding guarantees defined by the requirement.
 *
 * Run:
 *   node apps/simulation/tests/P1_N09.test.js
 */

import assert from "node:assert/strict";

(function main() {
  // --- Decode-focused fixtures ---------------------------------------------
  {
    const mantissa = 4000;      // 12-bit field
    const exponent = 2;         // 4-bit field
    const currentPercent = 204; // ~80% of max
    const regenSign = 0;        // positive regen
    const regenMagnitude = 10;  // ~7.9% per tick

    const word =
      (mantissa << 20) |
      (exponent << 16) |
      (currentPercent << 8) |
      (regenSign << 7) |
      regenMagnitude;

    const decoded = decodeSnapshot(word >>> 0);

    assert.equal(decoded.max, 16000, "max should reconstruct via mantissa << exponent");
    assert.equal(decoded.current, Math.round(16000 * currentPercent / 255), "current should follow percentage projection");
    assert.equal(decoded.regen, Math.round(16000 * regenMagnitude / 127), "regen should follow magnitude scaling");
  }

  {
    const mantissa = 3072;
    const exponent = 1;
    const currentPercent = 255; // 100%
    const regenSign = 1;        // degeneration
    const regenMagnitude = 63;  // ~49.6% per tick

    const word =
      (mantissa << 20) |
      (exponent << 16) |
      (currentPercent << 8) |
      (regenSign << 7) |
      regenMagnitude;

    const decoded = decodeSnapshot(word >>> 0);

    assert.equal(decoded.max, 6144, "max should handle negative regen cases");
    assert.equal(decoded.current, 6144, "current 100% should equal max");
    assert.equal(decoded.regen, -Math.round(6144 * regenMagnitude / 127), "negative regen obeys sign bit");
  }

  {
    const word = 0; // all fields zero -> max/current/regen collapse to zero
    const decoded = decodeSnapshot(word >>> 0);
    assert.equal(decoded.max, 0, "zero mantissa yields max 0 regardless of exponent");
    assert.equal(decoded.current, 0, "current should be zero when max is zero");
    assert.equal(decoded.regen, 0, "regen should also be zero when max is zero");
  }

  // --- Encode / decode round-trips -----------------------------------------
  const roundTripCases = [
    { label: "moderate regen", max: 16000, current: 12800, regen: 1260 },
    { label: "full stamina", max: 100, current: 100, regen: 0 },
    { label: "clamped current", max: 5000, current: 9000, regen: 200 },
    { label: "negative regen", max: 250000, current: 125000, regen: -7500 },
    { label: "zero max", max: 0, current: 0, regen: 100 },
    { label: "regen clamp", max: 32000, current: 8000, regen: 64000 },
    { label: "large max", max: 120000000, current: 60000000, regen: 1000000 },
  ];

  for (const testCase of roundTripCases) {
    const { encodedWord, stored } = encodeSnapshot(testCase.max, testCase.current, testCase.regen);
    const decoded = decodeSnapshot(encodedWord);

    assert.equal(decoded.max, stored.max, `${testCase.label}: decoded max should equal stored max`);
    assert.ok(Math.abs(decoded.current - stored.current) <= 1, `${testCase.label}: current should round-trip within ±1`);
    assert.ok(Math.abs(decoded.regen - stored.regen) <= 1, `${testCase.label}: regen should round-trip within ±1`);

    // Additional behavioural checks
    assert.ok(stored.current >= 0 && stored.current <= stored.max, `${testCase.label}: stored current clamped within [0, max]`);
    if (stored.max === 0) {
      assert.equal(encodedWord, 0, `${testCase.label}: zero max collapses encoding to zero word`);
    } else {
      const regenRatio = Math.abs(stored.regen) / stored.max;
      assert.ok(regenRatio <= 1 + 1e-6, `${testCase.label}: regen should not exceed 100% of max per tick`);
    }
  }

  console.log("[REQ:P1-N09] resource snapshot encoding tests: ok");
})();

// --- Helpers ----------------------------------------------------------------

function decodeSnapshot(word) {
  const mantissa = (word >>> 20) & 0x0fff;
  const exponent = (word >>> 16) & 0x000f;
  const currentPercent = (word >>> 8) & 0x00ff;
  const regenPayload = word & 0x00ff;
  const regenSign = (regenPayload >>> 7) & 0x01;
  const regenMagnitude = regenPayload & 0x7f;

  const max = mantissa === 0 ? 0 : mantissa << exponent;
  const current = max === 0 ? 0 : Math.round(max * currentPercent / 255);
  const regen = max === 0 ? 0 : (regenSign ? -1 : 1) * Math.round(max * regenMagnitude / 127);

  return { mantissa, exponent, currentPercent, regenSign, regenMagnitude, max, current, regen };
}

function encodeSnapshot(max, current, regen) {
  if (!Number.isFinite(max) || !Number.isFinite(current) || !Number.isFinite(regen)) {
    throw new TypeError("encodeSnapshot expects finite numeric inputs");
  }

  const MAX_MANTISSA = 0x0fff;
  const MAX_EXPONENT = 0x000f;

  let mantissa = 0;
  let exponent = 0;
  let storedMax = 0;

  if (max > 0) {
    const rawExponent = Math.floor(Math.log2(max)) - 11;
    exponent = clamp(Math.min(rawExponent, MAX_EXPONENT), 0, MAX_EXPONENT);

    const scale = 1 << exponent;
    mantissa = Math.round(max / scale);
    if (mantissa < 1) mantissa = 1;
    if (mantissa > MAX_MANTISSA) mantissa = MAX_MANTISSA;

    // Reconstruct the stored max exactly as the decoder will.
    storedMax = mantissa << exponent;

    // If rounding caused overshoot beyond representable space, step down once.
    if (storedMax > max && mantissa > 1) {
      const lower = (mantissa - 1) << exponent;
      if (Math.abs(lower - max) <= Math.abs(storedMax - max)) {
        mantissa -= 1;
        storedMax = mantissa << exponent;
      }
    }
  }

  if (storedMax === 0) {
    // No stamina means the entire word collapses to 0 according to requirement.
    return {
      encodedWord: 0,
      stored: {
        max: 0,
        current: 0,
        regen: 0,
      },
    };
  }

  const clampedCurrent = clamp(Math.round(current), 0, storedMax);
  const currentPercent = clamp(Math.round(clampedCurrent / storedMax * 255), 0, 255);
  const storedCurrent = Math.round(storedMax * currentPercent / 255);

  const regenSign = regen < 0 ? 1 : 0;
  const regenAbs = Math.abs(regen);
  const regenMagnitude = clamp(Math.round((regenAbs / storedMax) * 127), 0, 127);
  const storedRegen = Math.round(storedMax * regenMagnitude / 127);
  const signedStoredRegen = regenSign ? -storedRegen : storedRegen;

  const encodedWord =
    (mantissa << 20) |
    (exponent << 16) |
    (currentPercent << 8) |
    (regenSign << 7) |
    regenMagnitude;

  return {
    encodedWord: encodedWord >>> 0,
    stored: {
      max: storedMax,
      current: storedCurrent,
      regen: signedStoredRegen,
    },
  };
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
