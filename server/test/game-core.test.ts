import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_KEYS,
  FIXED_STEP,
  MEDKIT_HEAL,
  REVIVE_DURATION,
  REVIVE_RANGE,
  createInputState,
  freshRun,
  hitEnemy,
  spawnEnemy,
  updatePlayer,
  updateRevives,
} from "../../lib/game-core.ts";

function freshCoopRun() {
  return freshRun(
    { id: "host", name: "HOST ONE", pantId: "ghost" },
    { id: "guest", name: "GUEST TWO", pantId: "guard" },
  );
}

function downGuest(state: ReturnType<typeof freshCoopRun>) {
  const guest = state.players.find((player) => player.id === "guest");
  assert.ok(guest);
  guest.hp = 0;
  guest.action = "dead";
  guest.invuln = 999;
  guest.reviveProgress = 0;
  guest.reviveBy = null;
  return guest;
}

test("an in-range teammate can complete a revive", () => {
  const state = freshCoopRun();
  const host = state.players.find((player) => player.id === "host");
  const guest = downGuest(state);
  assert.ok(host);
  host.x = 620;
  host.y = 500;
  guest.x = host.x + REVIVE_RANGE - 8;
  guest.y = host.y;

  const hostInput = createInputState();
  hostInput.revive = true;
  const guestInput = createInputState();
  const frameCount = Math.ceil(REVIVE_DURATION / FIXED_STEP) + 1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    updateRevives(state, FIXED_STEP, hostInput, guestInput);
  }

  assert.equal(guest.hp, Math.ceil(guest.maxHp * 0.4));
  assert.equal(guest.action, "idle");
  assert.equal(guest.reviveProgress, 0);
  assert.equal(guest.reviveBy, null);
  assert.ok(guest.invuln >= 1.8);
  assert.ok(state.effects.some((effect) => effect.kind === "text" && effect.text === "BACK IN THE FIGHT"));
  assert.ok(state.audioEvents.some((event) => event.cue === "revive"));
});

test("reviving clears attacks buffered before a fighter was downed", () => {
  const state = freshCoopRun();
  const host = state.players.find((player) => player.id === "host");
  const guest = downGuest(state);
  assert.ok(host);
  host.x = 620;
  host.y = 500;
  guest.x = host.x + 20;
  guest.y = host.y;
  guest.attackBuffer = 0.16;

  const hostInput = createInputState();
  hostInput.revive = true;
  for (let frame = 0; frame < Math.ceil(REVIVE_DURATION / FIXED_STEP) + 1; frame += 1) {
    updateRevives(state, FIXED_STEP, hostInput, createInputState());
  }
  updatePlayer(state, guest, FIXED_STEP, EMPTY_KEYS, createInputState());

  assert.equal(guest.attackBuffer, 0);
  assert.equal(guest.action, "idle");
});

test("revive progress decays when released and never starts out of range", () => {
  const releasedState = freshCoopRun();
  const releasedHost = releasedState.players.find((player) => player.id === "host");
  const releasedGuest = downGuest(releasedState);
  assert.ok(releasedHost);
  releasedHost.x = releasedGuest.x - 24;
  releasedHost.y = releasedGuest.y;

  const heldInput = createInputState();
  heldInput.revive = true;
  for (let frame = 0; frame < Math.ceil((REVIVE_DURATION * 0.45) / FIXED_STEP); frame += 1) {
    updateRevives(releasedState, FIXED_STEP, heldInput, createInputState());
  }
  const partialProgress = releasedGuest.reviveProgress;
  assert.ok(partialProgress > 0 && partialProgress < 1);

  heldInput.revive = false;
  for (let frame = 0; frame < Math.ceil(1.5 / FIXED_STEP); frame += 1) {
    updateRevives(releasedState, FIXED_STEP, heldInput, createInputState());
  }
  assert.equal(releasedGuest.hp, 0);
  assert.equal(releasedGuest.reviveProgress, 0);
  assert.equal(releasedGuest.reviveBy, null);

  const distantState = freshCoopRun();
  const distantHost = distantState.players.find((player) => player.id === "host");
  const distantGuest = downGuest(distantState);
  assert.ok(distantHost);
  distantHost.x = distantGuest.x - REVIVE_RANGE - 20;
  distantHost.y = distantGuest.y;
  const distantInput = createInputState();
  distantInput.revive = true;
  for (let frame = 0; frame < Math.ceil((REVIVE_DURATION + 0.5) / FIXED_STEP); frame += 1) {
    updateRevives(distantState, FIXED_STEP, distantInput, createInputState());
  }
  assert.equal(distantGuest.hp, 0);
  assert.equal(distantGuest.reviveProgress, 0);
});

test("medkits heal an injured fighter once and are consumed", () => {
  const state = freshRun("ghost");
  const medkit = state.medkits[0];
  assert.ok(medkit);
  state.player.hp = 50;
  state.player.x = medkit.x;
  state.player.y = medkit.y;

  updatePlayer(state, state.player, FIXED_STEP, EMPTY_KEYS, createInputState());

  assert.equal(state.player.hp, 50 + MEDKIT_HEAL);
  assert.equal(state.medkits.some((candidate) => candidate.id === medkit.id), false);
  assert.ok(state.effects.some((effect) => effect.kind === "text" && effect.text === `MEDKIT +${MEDKIT_HEAL}`));
  assert.ok(state.audioEvents.some((event) => event.cue === "heal"));
});

test("enemy hits emit a deterministic seeded blood effect", () => {
  const state = freshRun("ghost");
  spawnEnemy(state);
  const enemy = state.enemies[0];
  assert.ok(enemy);
  state.effects.length = 0;
  state.audioEvents.length = 0;

  const expectedSeed = enemy.id * 17 + state.kills * 7;
  assert.equal(hitEnemy(state, enemy, 1, 0, 0, enemy.x - 20, enemy.y), true);
  const blood = state.effects.find((effect) => effect.kind === "blood");
  assert.ok(blood);
  assert.equal(blood.seed, expectedSeed);
  assert.equal(blood.angle, 0);
  assert.ok((blood.radius ?? 0) >= 22);
});
