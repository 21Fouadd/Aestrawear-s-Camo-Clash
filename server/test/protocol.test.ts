import assert from "node:assert/strict";
import test from "node:test";
import { readClientMessage } from "../src/protocol.ts";

test("continuous input preserves revive state while normalizing movement", () => {
  const message = readClientMessage({
    type: "input",
    seq: 7,
    input: { dx: 2, dy: 2, attack: true, revive: true },
  });
  assert.ok(message && message.type === "input");
  assert.equal(message.seq, 7);
  assert.equal(message.input.attack, true);
  assert.equal(message.input.revive, true);
  assert.ok(Math.abs(Math.hypot(message.input.dx, message.input.dy) - 1) < 1e-10);
});

test("pant messages accept only canonical pant ids", () => {
  assert.deepEqual(readClientMessage({ type: "pant", pantId: "guard" }), { type: "pant", pantId: "guard" });
  assert.equal(readClientMessage({ type: "pant", pantId: "rainbow" }), null);
});
