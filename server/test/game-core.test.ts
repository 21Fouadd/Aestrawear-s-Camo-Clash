import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_KEYS,
  ENEMIES,
  FIXED_STEP,
  MEDKIT_HEAL,
  REVIVE_DURATION,
  REVIVE_RANGE,
  createInputState,
  freshRun,
  hitEnemy,
  kittyBossPhaseForHealth,
  spawnEnemy,
  updateGame,
  updatePlayer,
  updateRevives,
  type Enemy,
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

function kittyEnemy(): Enemy {
  const definition = ENEMIES.kitty;
  return {
    id: 99,
    kind: "kitty",
    x: 480,
    y: 500,
    hp: definition.hp,
    maxHp: definition.hp,
    speed: definition.speed,
    damage: definition.damage,
    radius: definition.radius,
    attackCd: 0,
    windup: 0,
    stun: 0,
    vx: 0,
    vy: 0,
    elite: false,
    dead: false,
    facing: 1,
    state: "chase",
    stateTimer: 0,
    stateDuration: 0,
    attackResolved: false,
    attackX: 1,
    attackY: 0,
    attackFacing: 1,
    animTime: 0,
    hitFlash: 0,
    deathTimer: 0,
    zombieVariant: 0,
    targetPlayerId: "host",
  };
}

function kittyBossEnemy(): Enemy {
  const definition = ENEMIES.kittyBoss;
  return {
    ...kittyEnemy(),
    id: 100,
    kind: "kittyBoss",
    hp: definition.hp,
    maxHp: definition.hp,
    speed: definition.speed,
    damage: definition.damage,
    radius: definition.radius,
  };
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

test("hitting evil kitty emits its dedicated sound cue", () => {
  const state = freshRun("ghost");
  const enemy = kittyEnemy();
  state.enemies.push(enemy);
  state.audioEvents.length = 0;

  assert.equal(hitEnemy(state, enemy, 1, 0, 0, enemy.x - 20, enemy.y), true);
  assert.ok(state.audioEvents.some((event) => event.cue === "kittyHit" && event.entityId === undefined));
});

test("evil kitty throws a Dubai chocolate Labubu projectile", () => {
  const state = freshRun("ghost");
  const enemy = kittyEnemy();
  enemy.state = "active";
  enemy.stateDuration = ENEMIES.kitty.active;
  state.enemies.push(enemy);
  state.remainingBudget = 0;
  state.introTimer = 0;

  updateGame(state, FIXED_STEP, EMPTY_KEYS, createInputState());

  const projectile = state.projectiles.find((candidate) => candidate.owner === "enemy" && candidate.kind === "labubu");
  assert.ok(projectile);
  assert.equal(projectile.radius, 14);
  assert.equal(projectile.damage, ENEMIES.kitty.damage);
});

test("wave five is a dedicated Pink Playtime boss fight", () => {
  const state = freshRun("ghost");
  state.wave = 5;
  state.waveSpawnCount = 0;
  state.remainingBudget = 20;
  state.audioEvents.length = 0;

  spawnEnemy(state);

  assert.equal(state.enemies.length, 1);
  assert.equal(state.enemies[0].kind, "kittyBoss");
  assert.equal(state.enemies[0].maxHp, ENEMIES.kittyBoss.hp);
  assert.equal(state.remainingBudget, 0);
  assert.equal(state.bossDialogue, "Come here... I only wanna play.");
  assert.ok(state.audioEvents.some((event) => event.cue === "bossCuteVoice"));
});

test("the Kitty boss gets angry and speaks when her shell reaches phase three", () => {
  const state = freshRun("ghost");
  const boss = kittyBossEnemy();
  boss.hp = boss.maxHp * .53;
  state.enemies.push(boss);
  state.audioEvents.length = 0;

  assert.equal(kittyBossPhaseForHealth(boss.hp, boss.maxHp), 1);
  hitEnemy(state, boss, boss.maxHp * .03, 0, 0, boss.x - 20, boss.y);

  assert.equal(kittyBossPhaseForHealth(boss.hp, boss.maxHp), 2);
  assert.equal(state.bossDialogue, "I SAID I WANNA PLAY!");
  assert.ok(state.audioEvents.some((event) => event.cue === "bossTransform"));
  assert.ok(state.audioEvents.some((event) => event.cue === "bossZombieVoice"));
});

test("the corrupted Kitty boss throws a Labubu spread", () => {
  const state = freshRun("ghost");
  const boss = kittyBossEnemy();
  boss.hp = boss.maxHp * .4;
  boss.state = "active";
  boss.stateDuration = ENEMIES.kittyBoss.active;
  state.enemies.push(boss);
  state.remainingBudget = 0;
  state.introTimer = 0;

  updateGame(state, FIXED_STEP, EMPTY_KEYS, createInputState());

  const projectiles = state.projectiles.filter((candidate) => candidate.owner === "enemy" && candidate.kind === "labubu");
  assert.equal(projectiles.length, 3);
  assert.ok(projectiles.every((projectile) => projectile.radius === 19));
});
