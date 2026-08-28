import assert from "node:assert/strict";
import test from "node:test";
import { BUILD_ID, PROTOCOL_VERSION, readClientMessage, readInitialMessage } from "../src/protocol.ts";

test("fighter customization is validated and preserved during room authentication", () => {
  const message = readInitialMessage({
    type: "create",
    protocolVersion: PROTOCOL_VERSION,
    buildId: BUILD_ID,
    identity: {
      name: "CUSTOM ONE",
      pantId: "ghost",
      look: { body: "female", face: "sharp", skinTone: "deep", hair: "braids", hairColor: "pink" },
    },
  });
  assert.ok(message && message.type === "create");
  assert.deepEqual(message.identity.look, { body: "female", face: "sharp", skinTone: "deep", hair: "braids", hairColor: "pink" });
});

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
