import assert from "node:assert/strict";
import test from "node:test";
import { tokenUnits } from "../src/market.js";

test("trade amounts convert to exact SPL base units", () => {
  assert.equal(tokenUnits("12.345678", 6), 12_345_678n);
  assert.equal(tokenUnits("0.000001", 6), 1n);
  assert.equal(tokenUnits("1", 9), 1_000_000_000n);
});

test("trade amounts reject unsafe values and zero slippage floor", () => {
  for (const value of ["0", "0.0000001", "-1", "1e6", "1.2.3", "18446744073709.551616"]) {
    assert.throws(() => tokenUnits(value, 6));
  }
});
