"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPant, PANTS, type PantId } from "../lib/game-config";

const WORLD_W = 1280;
const WORLD_H = 720;
const ARENA = { left: 72, right: 1208, top: 250, bottom: 630 };

type Screen = "menu" | "playing" | "paused" | "upgrade" | "gameover" | "leaderboard";
type EnemyKind = "thug" | "runner" | "brute" | "thrower" | "walker";
type EnemyState = "enter" | "chase" | "windup" | "active" | "recover" | "hurt" | "dead";
type PlayerAction = "idle" | "attack" | "dash" | "reload" | "hurt";
type WeaponKind = "fists" | "bat" | "knife" | "pistol" | "shotgun";

type AttackSpec = {
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  range: number;
  arc: number;
  knockback: number;
  stun: number;
  maxTargets: number;
  hitStop: number;
  pellets?: number;
  spread?: number;
  bulletSpeed?: number;
  projectileLife?: number;
};

type WeaponDefinition = {
  label: string;
  icon: string;
  firearm: boolean;
  attacks: AttackSpec[];
  magazine: number;
  pickupReserve: number;
  reload: number;
  maxDurability: number;
  unlock: number;
  dropWeight: number;
};

type HeldWeapon = {
  kind: WeaponKind;
  ammo: number;
  reserve: number;
  durability: number;
};

type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  attackCd: number;
  windup: number;
  stun: number;
  vx: number;
  vy: number;
  elite: boolean;
  dead: boolean;
  facing: number;
  state: EnemyState;
  stateTimer: number;
  stateDuration: number;
  attackResolved: boolean;
  animTime: number;
  hitFlash: number;
  deathTimer: number;
};

type Projectile = {
  id: number;
  owner: "player" | "enemy";
  kind: "bullet" | "pellet" | "thrown";
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  damage: number;
  knockback: number;
  life: number;
  radius: number;
  penetration: number;
};

type WeaponPickup = {
  id: number;
  x: number;
  y: number;
  weapon: HeldWeapon;
  life: number;
  bob: number;
};
type Effect = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  text?: string;
  radius?: number;
  kind: "hit" | "ring" | "text" | "trail" | "bolt";
};

type Player = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damageMult: number;
  speedMult: number;
  cooldownMult: number;
  rangeMult: number;
  waveHeal: number;
  attackCd: number;
  dashCd: number;
  abilityCd: number;
  abilityTimer: number;
  invuln: number;
  facing: number;
  comboStep: number;
  comboWindow: number;
  ghostPrimed: boolean;
  action: PlayerAction;
  actionTime: number;
  actionDuration: number;
  attackSpec: AttackSpec | null;
  attackResolved: boolean;
  attackBuffer: number;
  dashX: number;
  dashY: number;
  dashTimer: number;
  trailTimer: number;
  vx: number;
  vy: number;
  animTime: number;
  moveAmount: number;
  hitFlash: number;
  recoil: number;
  aimAngle: number;
  weapon: HeldWeapon;
  nearPickupId: number | null;
};

type GameState = {
  runId: string;
  pantId: PantId;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: WeaponPickup[];
  effects: Effect[];
  wave: number;
  score: number;
  kills: number;
  combo: number;
  comboTimer: number;
  maxCombo: number;
  remainingBudget: number;
  spawnTimer: number;
  introTimer: number;
  nextEnemyId: number;
  pendingUpgrade: boolean;
  elapsed: number;
  shake: number;
  hitStop: number;
  nextProjectileId: number;
  nextPickupId: number;
  killsSinceDrop: number;
};

type Hud = {
  health: number;
  maxHealth: number;
  score: number;
  wave: number;
  combo: number;
  kills: number;
  abilityCd: number;
  dashCd: number;
  enemies: number;
  weapon: WeaponKind;
  ammo: number;
  reserve: number;
  durability: number;
  reloading: boolean;
  nearWeapon: WeaponKind | null;
};

type Result = { runId: string; score: number; wave: number; kills: number; maxCombo: number; elapsed: number };
type LeaderboardEntry = {
  id: number;
  rank: number;
  playerName: string;
  score: number;
  wave: number;
  kills: number;
  pantId: PantId;
};

type Upgrade = {
  id: string;
  name: string;
  description: string;
  apply: (player: Player) => void;
};

const ENEMIES: Record<EnemyKind, {
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  cost: number;
  score: number;
  unlock: number;
  windup: number;
  active: number;
  recovery: number;
  attackRange: number;
  lunge: number;
  mass: number;
  color: string;
}> = {
  thug: { hp: 55, speed: 92, damage: 10, radius: 24, cost: 1, score: 100, unlock: 1, windup: 0.28, active: 0.08, recovery: 0.48, attackRange: 72, lunge: 75, mass: 1, color: "#dedede" },
  runner: { hp: 36, speed: 150, damage: 8, radius: 20, cost: 1.4, score: 135, unlock: 2, windup: 0.18, active: 0.07, recovery: 0.38, attackRange: 70, lunge: 175, mass: 0.75, color: "#f7f7f7" },
  brute: { hp: 160, speed: 62, damage: 22, radius: 34, cost: 3.5, score: 340, unlock: 4, windup: 0.75, active: 0.14, recovery: 0.75, attackRange: 106, lunge: 42, mass: 1.8, color: "#bcbcbc" },
  thrower: { hp: 65, speed: 78, damage: 9, radius: 23, cost: 2.4, score: 235, unlock: 6, windup: 0.55, active: 0.04, recovery: 0.7, attackRange: 430, lunge: 0, mass: 0.95, color: "#d4d4d4" },
  walker: { hp: 110, speed: 72, damage: 15, radius: 27, cost: 2.2, score: 260, unlock: 8, windup: 0.48, active: 0.12, recovery: 0.6, attackRange: 80, lunge: 58, mass: 1.25, color: "#a4a4a4" },
};

const WEAPONS: Record<WeaponKind, WeaponDefinition> = {
  fists: {
    label: "FISTS", icon: "/pixel/icons/fist.png", firearm: false, magazine: 0, pickupReserve: 0, reload: 0, maxDurability: 0, unlock: 1, dropWeight: 0,
    attacks: [
      { startup: 0.09, active: 0.055, recovery: 0.15, damage: 18, range: 108, arc: 104, knockback: 90, stun: 0.1, maxTargets: 2, hitStop: 0.03 },
      { startup: 0.11, active: 0.055, recovery: 0.16, damage: 22, range: 114, arc: 108, knockback: 120, stun: 0.12, maxTargets: 2, hitStop: 0.035 },
      { startup: 0.16, active: 0.07, recovery: 0.24, damage: 34, range: 132, arc: 118, knockback: 360, stun: 0.28, maxTargets: 3, hitStop: 0.07 },
    ],
  },
  bat: {
    label: "STEEL BAT", icon: "/pixel/icons/bat.png", firearm: false, magazine: 0, pickupReserve: 0, reload: 0, maxDurability: 24, unlock: 1, dropWeight: 5,
    attacks: [{ startup: 0.18, active: 0.08, recovery: 0.31, damage: 42, range: 158, arc: 122, knockback: 430, stun: 0.32, maxTargets: 4, hitStop: 0.06 }],
  },
  knife: {
    label: "STREET KNIFE", icon: "/pixel/icons/knife.png", firearm: false, magazine: 0, pickupReserve: 0, reload: 0, maxDurability: 36, unlock: 2, dropWeight: 4,
    attacks: [
      { startup: 0.07, active: 0.045, recovery: 0.13, damage: 26, range: 96, arc: 68, knockback: 70, stun: 0.09, maxTargets: 1, hitStop: 0.03 },
      { startup: 0.08, active: 0.05, recovery: 0.15, damage: 29, range: 102, arc: 84, knockback: 92, stun: 0.11, maxTargets: 2, hitStop: 0.035 },
    ],
  },
  pistol: {
    label: "PISTOL", icon: "/pixel/icons/pistol.png", firearm: true, magazine: 12, pickupReserve: 36, reload: 1.15, maxDurability: 0, unlock: 3, dropWeight: 3,
    attacks: [{ startup: 0.06, active: 0.01, recovery: 0.16, damage: 22, range: 760, arc: 14, knockback: 125, stun: 0.12, maxTargets: 1, hitStop: 0.035, pellets: 1, spread: 1.5, bulletSpeed: 1150, projectileLife: 0.72 }],
  },
  shotgun: {
    label: "SHOTGUN", icon: "/pixel/icons/shotgun.png", firearm: true, magazine: 5, pickupReserve: 15, reload: 1.6, maxDurability: 0, unlock: 6, dropWeight: 1,
    attacks: [{ startup: 0.16, active: 0.02, recovery: 0.58, damage: 9, range: 530, arc: 24, knockback: 230, stun: 0.18, maxTargets: 1, hitStop: 0.055, pellets: 8, spread: 16, bulletSpeed: 980, projectileLife: 0.5 }],
  },
};

const CITY_LAYERS = [
  "/pixel/city/layer_1_ground.png",
  "/pixel/city/layer_2_stars.png",
  "/pixel/city/layer_3_moon.png",
  "/pixel/city/layer_4_clouds_1.png",
  "/pixel/city/layer_5_clouds_2.png",
  "/pixel/city/layer_6_far_buildings.png",
  "/pixel/city/layer_7_bg_buildings.png",
  "/pixel/city/layer_8_fg_buildings.png",
  "/pixel/city/layer_9_wall.png",
];

const UPGRADES: Upgrade[] = [
  { id: "hands", name: "Heavy Hands", description: "+15% strike damage", apply: (p) => { p.damageMult += 0.15; } },
  { id: "stitch", name: "Hard Stitch", description: "+20 max health and heal 20", apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: "feet", name: "Quick Feet", description: "+10% movement speed", apply: (p) => { p.speedMult += 0.1; } },
  { id: "thread", name: "Fast Thread", description: "Pant ability recharges 12% faster", apply: (p) => { p.cooldownMult = Math.max(0.58, p.cooldownMult - 0.12); } },
  { id: "reach", name: "Long Reach", description: "+12% attack reach", apply: (p) => { p.rangeMult += 0.12; } },
  { id: "wind", name: "Second Wind", description: "+5 health after every wave", apply: (p) => { p.waveHeal += 5; } },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const budgetForWave = (wave: number) => Math.min(80, 5 + wave * 1.55 + Math.floor(wave / 5) * 2.5);
const MONO_WHITE = "#f4f4f4";

function makeWeapon(kind: WeaponKind): HeldWeapon {
  const definition = WEAPONS[kind];
  return {
    kind,
    ammo: definition.firearm ? definition.magazine : 0,
    reserve: definition.firearm ? definition.pickupReserve : 0,
    durability: definition.maxDurability,
  };
}

function segmentPointDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
) {
  const abx = bx - ax;
  const aby = by - ay;
  const denominator = abx * abx + aby * aby;
  const t = denominator > 0 ? clamp(((px - ax) * abx + (py - ay) * aby) / denominator, 0, 1) : 0;
  return distance(ax + abx * t, ay + aby * t, px, py);
}

function nearestLivingEnemy(state: GameState, range: number) {
  const player = state.player;
  return state.enemies
    .filter((enemy) => !enemy.dead && distance(player.x, player.y, enemy.x, enemy.y) <= range)
    .sort((a, b) => {
      const aBehind = (a.x - player.x) * player.facing < -10 ? 150 : 0;
      const bBehind = (b.x - player.x) * player.facing < -10 ? 150 : 0;
      return distance(player.x, player.y, a.x, a.y) + aBehind - distance(player.x, player.y, b.x, b.y) - bBehind;
    })[0];
}

function freshRun(pantId: PantId): GameState {
  return {
    runId: crypto.randomUUID(),
    pantId,
    player: {
      x: WORLD_W / 2,
      y: 500,
      hp: 100,
      maxHp: 100,
      speed: 230,
      damageMult: 1,
      speedMult: 1,
      cooldownMult: 1,
      rangeMult: 1,
      waveHeal: 8,
      attackCd: 0,
      dashCd: 0,
      abilityCd: 0,
      abilityTimer: 0,
      invuln: 0,
      facing: 1,
      comboStep: 0,
      comboWindow: 0,
      ghostPrimed: false,
      action: "idle",
      actionTime: 0,
      actionDuration: 0,
      attackSpec: null,
      attackResolved: false,
      attackBuffer: 0,
      dashX: 1,
      dashY: 0,
      dashTimer: 0,
      trailTimer: 0,
      vx: 0,
      vy: 0,
      animTime: 0,
      moveAmount: 0,
      hitFlash: 0,
      recoil: 0,
      aimAngle: 0,
      weapon: makeWeapon("fists"),
      nearPickupId: null,
    },
    enemies: [],
    projectiles: [],
    pickups: [
      { id: 1, x: 760, y: 505, weapon: makeWeapon("bat"), life: 999, bob: 0 },
    ],
    effects: [],
    wave: 1,
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    remainingBudget: budgetForWave(1),
    spawnTimer: 0.7,
    introTimer: 1.5,
    nextEnemyId: 1,
    pendingUpgrade: false,
    elapsed: 0,
    shake: 0,
    hitStop: 0,
    nextProjectileId: 1,
    nextPickupId: 2,
    killsSinceDrop: 0,
  };
}

function addEffect(state: GameState, effect: Omit<Effect, "maxLife">) {
  state.effects.push({ ...effect, maxLife: effect.life });
}

function spawnEnemy(state: GameState) {
  const unlocked = (Object.keys(ENEMIES) as EnemyKind[]).filter((kind) => {
    const def = ENEMIES[kind];
    return def.unlock <= state.wave && def.cost <= state.remainingBudget + 0.3;
  });
  const kind = unlocked[Math.floor(Math.random() * unlocked.length)] ?? "thug";
  const def = ENEMIES[kind];
  const side = Math.random() > 0.5 ? 1 : -1;
  const elite = state.wave >= 5 && Math.random() < Math.min(0.28, 0.035 * Math.floor(state.wave / 5));
  const healthScale = 1 + 0.075 * (state.wave - 1) + 0.0015 * Math.pow(state.wave - 1, 1.55);
  const hp = Math.round(def.hp * healthScale * (elite ? 1.8 : 1));
  state.enemies.push({
    id: state.nextEnemyId++,
    kind,
    x: side < 0 ? ARENA.left - 30 : ARENA.right + 30,
    y: ARENA.top + 70 + Math.random() * (ARENA.bottom - ARENA.top - 70),
    hp,
    maxHp: hp,
    speed: def.speed * Math.min(1.3, 1 + 0.008 * (state.wave - 1)),
    damage: def.damage * Math.min(2.6, 1 + 0.035 * (state.wave - 1)) * (elite ? 1.25 : 1),
    radius: def.radius * (elite ? 1.12 : 1),
    attackCd: 0.4 + Math.random() * 0.5,
    windup: 0,
    stun: 0,
    vx: 0,
    vy: 0,
    elite,
    dead: false,
    facing: side < 0 ? 1 : -1,
    state: "enter",
    stateTimer: 0,
    stateDuration: 0.36,
    attackResolved: false,
    animTime: Math.random() * Math.PI * 2,
    hitFlash: 0,
    deathTimer: 0,
  });
  state.remainingBudget -= def.cost;
}

function damagePlayer(state: GameState, amount: number, source?: Enemy) {
  const player = state.player;
  if (player.invuln > 0) return;
  const guarded = state.pantId === "guard" && player.abilityTimer > 0;
  const dealt = amount * (guarded ? 0.35 : 1);
  player.hp = Math.max(0, player.hp - dealt);
  player.invuln = 0.55;
  state.combo = 0;
  state.comboTimer = 0;
  state.shake = 0.22;
  state.hitStop = Math.max(state.hitStop, guarded ? 0.025 : 0.06);
  player.hitFlash = 0.16;
  player.action = "hurt";
  player.actionTime = 0;
  player.actionDuration = guarded ? 0.09 : 0.2;
  player.attackSpec = null;
  player.attackResolved = false;
  if (source) {
    const awayX = player.x - source.x;
    const awayY = player.y - source.y;
    const awayLength = Math.hypot(awayX, awayY) || 1;
    player.vx += (awayX / awayLength) * (guarded ? 90 : 240);
    player.vy += (awayY / awayLength) * (guarded ? 70 : 170);
  }
  addEffect(state, { x: player.x, y: player.y - 50, life: 0.55, color: MONO_WHITE, text: `-${Math.ceil(dealt)}`, kind: "text" });
  if (guarded && source) {
    const dx = source.x - player.x;
    const dy = source.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    source.vx += (dx / length) * 420;
    source.vy += (dy / length) * 420;
    source.stun = 0.45;
    source.state = "hurt";
    source.stateTimer = 0;
    source.stateDuration = 0.45;
    source.windup = 0;
  }
}

function dropWeaponAt(state: GameState, x: number, y: number, weapon: HeldWeapon) {
  if (weapon.kind === "fists") return;
  state.pickups.push({ id: state.nextPickupId++, x, y, weapon: { ...weapon }, life: 20, bob: Math.random() * Math.PI * 2 });
  if (state.pickups.length > 4) state.pickups.shift();
}

function rollWeaponDrop(state: GameState, enemy: Enemy) {
  state.killsSinceDrop += 1;
  if (state.killsSinceDrop < 7 && Math.random() >= 0.08) return;
  const choices = (Object.keys(WEAPONS) as WeaponKind[])
    .filter((kind) => kind !== "fists" && WEAPONS[kind].unlock <= state.wave)
    .flatMap((kind) => Array.from({ length: WEAPONS[kind].dropWeight }, () => kind));
  const kind = choices[Math.floor(Math.random() * choices.length)];
  if (!kind) return;
  dropWeaponAt(state, enemy.x, enemy.y, makeWeapon(kind));
  state.killsSinceDrop = 0;
}

function defeatEnemy(state: GameState, enemy: Enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  enemy.state = "dead";
  enemy.stateTimer = 0;
  enemy.stateDuration = 0.34;
  enemy.deathTimer = 0.34;
  state.kills += 1;
  state.combo += 1;
  state.comboTimer = 2.5;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const base = ENEMIES[enemy.kind].score * (enemy.elite ? 1.6 : 1);
  const comboMult = Math.min(3, 1 + Math.floor(state.combo / 3) * 0.1);
  const surgeMult = state.pantId === "surge" && state.player.abilityTimer > 0 ? 1.5 : 1;
  const points = Math.round(base * (1 + 0.03 * (state.wave - 1)) * comboMult * surgeMult);
  state.score += points;
  state.hitStop = Math.max(state.hitStop, 0.085);
  rollWeaponDrop(state, enemy);
  addEffect(state, { x: enemy.x, y: enemy.y - 75, life: 0.8, color: MONO_WHITE, text: `+${points}`, kind: "text" });
}

function hitEnemy(
  state: GameState,
  enemy: Enemy,
  amount: number,
  stun = 0,
  knockback = 0,
  sourceX = state.player.x,
  sourceY = state.player.y,
  hitStop = 0.035,
) {
  if (enemy.dead) return false;
  enemy.hp -= amount;
  enemy.stun = Math.max(enemy.stun, stun);
  enemy.hitFlash = 0.14;
  enemy.state = "hurt";
  enemy.stateTimer = 0;
  enemy.stateDuration = Math.max(0.1, stun);
  enemy.windup = 0;
  enemy.attackResolved = false;
  if (knockback) {
    const dx = enemy.x - sourceX;
    const dy = enemy.y - sourceY;
    const length = Math.hypot(dx, dy) || 1;
    const resistance = ENEMIES[enemy.kind].mass * (enemy.elite ? 1.25 : 1);
    enemy.vx += (dx / length) * knockback / resistance;
    enemy.vy += (dy / length) * knockback / resistance;
  }
  state.hitStop = Math.max(state.hitStop, hitStop);
  addEffect(state, { x: enemy.x, y: enemy.y - 45, life: 0.24, color: MONO_WHITE, radius: 18, kind: "hit" });
  if (enemy.hp <= 0) defeatEnemy(state, enemy);
  return true;
}

function triggerAbility(state: GameState) {
  const player = state.player;
  if (player.abilityCd > 0) return;
  const pant = getPant(state.pantId);
  player.abilityCd = pant.cooldown * player.cooldownMult;
  if (state.pantId === "ghost") {
    player.abilityTimer = 2.25;
    player.invuln = Math.max(player.invuln, 2.25);
    player.ghostPrimed = true;
    addEffect(state, { x: player.x, y: player.y, life: 0.8, color: MONO_WHITE, radius: 90, kind: "ring" });
  } else if (state.pantId === "chain") {
    const targets = state.enemies
      .filter((enemy) => !enemy.dead && distance(player.x, player.y, enemy.x, enemy.y) < 360)
      .sort((a, b) => distance(player.x, player.y, a.x, a.y) - distance(player.x, player.y, b.x, b.y))
      .slice(0, 5);
    targets.forEach((enemy, index) => {
      hitEnemy(state, enemy, 48 * player.damageMult, 0.9, 80);
      addEffect(state, { x: enemy.x, y: enemy.y - 35, life: 0.35 + index * 0.05, color: MONO_WHITE, radius: 34, kind: "bolt" });
    });
    addEffect(state, { x: player.x, y: player.y - 40, life: 0.5, color: MONO_WHITE, radius: 260, kind: "ring" });
  } else if (state.pantId === "guard") {
    player.abilityTimer = 4;
    state.enemies.forEach((enemy) => {
      if (!enemy.dead && distance(player.x, player.y, enemy.x, enemy.y) < 190) {
        hitEnemy(state, enemy, 28 * player.damageMult, 0.55, 520);
      }
    });
    addEffect(state, { x: player.x, y: player.y, life: 0.7, color: MONO_WHITE, radius: 190, kind: "ring" });
  } else {
    player.abilityTimer = 5;
    addEffect(state, { x: player.x, y: player.y, life: 0.8, color: MONO_WHITE, radius: 120, kind: "ring" });
  }
}

function beginReload(state: GameState) {
  const player = state.player;
  const definition = WEAPONS[player.weapon.kind];
  if (!definition.firearm || player.weapon.ammo >= definition.magazine || player.weapon.reserve <= 0) return;
  if (player.action === "dash" || player.action === "hurt") return;
  player.action = "reload";
  player.actionTime = 0;
  player.actionDuration = definition.reload;
  player.attackSpec = null;
  player.attackResolved = false;
}

function beginAttack(state: GameState) {
  const player = state.player;
  if (player.action !== "idle") {
    player.attackBuffer = 0.12;
    return;
  }
  const definition = WEAPONS[player.weapon.kind];
  if (definition.firearm && player.weapon.ammo <= 0) {
    beginReload(state);
    return;
  }
  const comboLength = definition.attacks.length;
  player.comboStep = player.comboWindow > 0 ? (player.comboStep + 1) % comboLength : 0;
  player.comboWindow = 0.78;
  const baseSpec = definition.attacks[player.comboStep] ?? definition.attacks[0];
  const surge = state.pantId === "surge" && player.abilityTimer > 0;
  const speed = surge ? 1.45 : 1;
  const spec = {
    ...baseSpec,
    startup: baseSpec.startup / speed,
    active: baseSpec.active / speed,
    recovery: baseSpec.recovery / speed,
  };
  const target = nearestLivingEnemy(state, spec.range * player.rangeMult);
  if (target) {
    player.aimAngle = Math.atan2((target.y - player.y) * 1.12, target.x - player.x);
    player.facing = target.x >= player.x ? 1 : -1;
  } else {
    player.aimAngle = player.facing > 0 ? 0 : Math.PI;
  }
  player.action = "attack";
  player.actionTime = 0;
  player.actionDuration = spec.startup + spec.active + spec.recovery;
  player.attackSpec = spec;
  player.attackResolved = false;
  player.attackBuffer = 0;
}

function resolvePlayerAttack(state: GameState) {
  const player = state.player;
  const spec = player.attackSpec;
  if (!spec || player.attackResolved) return;
  player.attackResolved = true;
  const definition = WEAPONS[player.weapon.kind];
  const ghostHit = state.pantId === "ghost" && player.ghostPrimed;

  if (definition.firearm) {
    if (player.weapon.ammo <= 0) return;
    player.weapon.ammo -= 1;
    const pellets = spec.pellets ?? 1;
    const ghostMultiplier = ghostHit ? (player.weapon.kind === "shotgun" ? 1.45 : 2.25) : 1;
    for (let pellet = 0; pellet < pellets; pellet += 1) {
      const spread = ((Math.random() - 0.5) * (spec.spread ?? 0) * Math.PI) / 180;
      const angle = player.aimAngle + spread;
      const speed = spec.bulletSpeed ?? 1000;
      const muzzleX = player.x + Math.cos(angle) * 44;
      const muzzleY = player.y - 57 + Math.sin(angle) * 22;
      state.projectiles.push({
        id: state.nextProjectileId++,
        owner: "player",
        kind: player.weapon.kind === "shotgun" ? "pellet" : "bullet",
        x: muzzleX,
        y: muzzleY,
        prevX: muzzleX,
        prevY: muzzleY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: spec.damage * player.damageMult * ghostMultiplier,
        knockback: spec.knockback,
        life: spec.projectileLife ?? 0.7,
        radius: player.weapon.kind === "shotgun" ? 4 : 5,
        penetration: 0,
      });
    }
    if (state.projectiles.length > 160) state.projectiles.splice(0, state.projectiles.length - 160);
    player.recoil = 1;
    addEffect(state, { x: player.x + Math.cos(player.aimAngle) * 52, y: player.y - 28 + Math.sin(player.aimAngle) * 20, life: 0.1, color: MONO_WHITE, radius: player.weapon.kind === "shotgun" ? 28 : 16, kind: "hit" });
    if (ghostHit) {
      player.ghostPrimed = false;
      player.abilityTimer = 0;
    }
    return;
  }

  const range = spec.range * player.rangeMult;
  const forwardX = Math.cos(player.aimAngle);
  const forwardY = Math.sin(player.aimAngle);
  const minDot = Math.cos((spec.arc * Math.PI) / 360);
  const candidates = state.enemies
    .filter((enemy) => {
      if (enemy.dead) return false;
      const dx = enemy.x - player.x;
      const dy = (enemy.y - player.y) * 1.12;
      const length = Math.hypot(dx, dy) || 1;
      return length <= range + enemy.radius && (dx / length) * forwardX + (dy / length) * forwardY >= minDot;
    })
    .sort((a, b) => distance(player.x, player.y, a.x, a.y) - distance(player.x, player.y, b.x, b.y));
  const maxTargets = state.pantId === "surge" && player.abilityTimer > 0 ? spec.maxTargets + 1 : spec.maxTargets;
  const targets = candidates.slice(0, maxTargets);
  for (const enemy of targets) {
    hitEnemy(
      state,
      enemy,
      spec.damage * player.damageMult * (ghostHit ? 2.25 : 1),
      ghostHit ? Math.max(0.75, spec.stun) : spec.stun,
      spec.knockback,
      player.x,
      player.y,
      spec.hitStop,
    );
  }
  addEffect(state, { x: player.x + forwardX * range * 0.55, y: player.y - 20 + forwardY * range * 0.38, life: 0.2, color: MONO_WHITE, radius: range * 0.62, kind: "hit" });
  if (ghostHit && targets.length) {
    player.ghostPrimed = false;
    player.abilityTimer = 0;
  }
  if (player.weapon.kind !== "fists") {
    player.weapon.durability -= 1;
    if (player.weapon.durability <= 0) {
      addEffect(state, { x: player.x, y: player.y - 90, life: 0.8, color: MONO_WHITE, text: "WEAPON BROKE", kind: "text" });
      player.weapon = makeWeapon("fists");
      player.comboStep = 0;
    }
  }
}

function beginDash(state: GameState, mx: number, my: number) {
  const player = state.player;
  if (player.dashCd > 0 || player.action === "hurt") return;
  const length = Math.hypot(mx, my);
  player.dashX = length > 0.1 ? mx / length : player.facing;
  player.dashY = length > 0.1 ? my / length : 0;
  player.action = "dash";
  player.actionTime = 0;
  player.actionDuration = 0.16;
  player.dashTimer = 0.16;
  player.trailTimer = 0;
  player.attackSpec = null;
  player.attackResolved = false;
  player.dashCd = 1.05;
  player.invuln = Math.max(player.invuln, 0.18);
}

function swapWeapon(state: GameState) {
  const player = state.player;
  const pickupIndex = state.pickups.findIndex((pickup) => pickup.id === player.nearPickupId);
  if (pickupIndex < 0) {
    if (player.weapon.kind !== "fists") {
      dropWeaponAt(state, player.x - player.facing * 28, player.y, player.weapon);
      player.weapon = makeWeapon("fists");
      player.comboStep = 0;
    }
    return;
  }
  const pickup = state.pickups[pickupIndex];
  if (pickup.weapon.kind === player.weapon.kind) {
    const definition = WEAPONS[player.weapon.kind];
    if (definition.firearm) player.weapon.reserve += pickup.weapon.ammo + pickup.weapon.reserve;
    else player.weapon.durability = Math.min(definition.maxDurability, player.weapon.durability + pickup.weapon.durability);
    state.pickups.splice(pickupIndex, 1);
    return;
  }
  const previous = player.weapon;
  player.weapon = { ...pickup.weapon };
  state.pickups.splice(pickupIndex, 1);
  dropWeaponAt(state, player.x - player.facing * 34, player.y + 4, previous);
  player.comboStep = 0;
  player.comboWindow = 0;
}

function updateGame(
  state: GameState,
  dt: number,
  keys: Set<string>,
  actions: { dx: number; dy: number; attack: boolean; dash: boolean; ability: boolean; swap: boolean; reload: boolean },
) {
  const player = state.player;
  state.elapsed += dt;
  state.shake = Math.max(0, state.shake - dt);
  if (state.hitStop > 0) {
    state.hitStop = Math.max(0, state.hitStop - dt);
    return;
  }
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.abilityCd = Math.max(0, player.abilityCd - dt);
  player.abilityTimer = Math.max(0, player.abilityTimer - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.comboWindow = Math.max(0, player.comboWindow - dt);
  player.attackBuffer = Math.max(0, player.attackBuffer - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  player.recoil = Math.max(0, player.recoil - dt * 8);
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer === 0) state.combo = 0;

  let mx = actions.dx + (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  let my = actions.dy + (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  let moveLength = Math.hypot(mx, my);
  if (moveLength > 1) { mx /= moveLength; my /= moveLength; }
  moveLength = Math.min(1, moveLength);
  player.moveAmount += (moveLength - player.moveAmount) * Math.min(1, dt * 14);
  player.animTime += dt * (3.5 + player.moveAmount * 8);
  if (Math.abs(mx) > 0.05) player.facing = mx > 0 ? 1 : -1;

  const nearestPickup = state.pickups
    .filter((pickup) => distance(player.x, player.y, pickup.x, pickup.y) < 88)
    .sort((a, b) => distance(player.x, player.y, a.x, a.y) - distance(player.x, player.y, b.x, b.y))[0];
  player.nearPickupId = nearestPickup?.id ?? null;
  if (nearestPickup && player.weapon.kind === "fists" && distance(player.x, player.y, nearestPickup.x, nearestPickup.y) < 36) swapWeapon(state);

  if (actions.swap && player.action !== "dash" && player.action !== "hurt") {
    player.action = "idle";
    player.attackSpec = null;
    swapWeapon(state);
  }
  actions.swap = false;
  if (actions.reload) beginReload(state);
  actions.reload = false;
  if (actions.dash) beginDash(state, mx, my);
  actions.dash = false;
  if (actions.ability && player.action !== "hurt") triggerAbility(state);
  actions.ability = false;

  if (player.action === "dash") {
    player.actionTime += dt;
    player.dashTimer = Math.max(0, player.actionDuration - player.actionTime);
    const progress = clamp(player.actionTime / player.actionDuration, 0, 1);
    const dashSpeed = 1080 * (1 - progress * 0.35);
    player.x = clamp(player.x + player.dashX * dashSpeed * dt, ARENA.left, ARENA.right);
    player.y = clamp(player.y + player.dashY * dashSpeed * 0.72 * dt, ARENA.top, ARENA.bottom);
    player.trailTimer -= dt;
    if (player.trailTimer <= 0) {
      player.trailTimer = 0.035;
      addEffect(state, { x: player.x - player.dashX * 28, y: player.y, life: 0.22, color: "#bdbdbd", radius: 42, kind: "trail" });
    }
    if (player.actionTime >= player.actionDuration) {
      player.action = "idle";
      player.dashTimer = 0;
    }
  } else {
    const ghostSpeed = state.pantId === "ghost" && player.abilityTimer > 0 ? 1.35 : 1;
    const controlScale = player.action === "attack" ? 0.46 : player.action === "reload" ? 0.65 : player.action === "hurt" ? 0.18 : 1;
    player.x += mx * player.speed * player.speedMult * ghostSpeed * controlScale * dt;
    player.y += my * player.speed * player.speedMult * ghostSpeed * controlScale * 0.72 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.vx *= Math.pow(0.035, dt);
    player.vy *= Math.pow(0.035, dt);
    player.x = clamp(player.x, ARENA.left, ARENA.right);
    player.y = clamp(player.y, ARENA.top, ARENA.bottom);

    if (player.action === "attack" && player.attackSpec) {
      const previousTime = player.actionTime;
      player.actionTime += dt;
      if (!player.attackResolved && previousTime < player.attackSpec.startup && player.actionTime >= player.attackSpec.startup) resolvePlayerAttack(state);
      if (player.actionTime >= player.actionDuration) {
        player.action = "idle";
        player.attackSpec = null;
        player.attackResolved = false;
      }
    } else if (player.action === "reload") {
      player.actionTime += dt;
      if (player.actionTime >= player.actionDuration) {
        const definition = WEAPONS[player.weapon.kind];
        const needed = Math.max(0, definition.magazine - player.weapon.ammo);
        const loaded = Math.min(needed, player.weapon.reserve);
        player.weapon.ammo += loaded;
        player.weapon.reserve -= loaded;
        player.action = "idle";
      }
    } else if (player.action === "hurt") {
      player.actionTime += dt;
      if (player.actionTime >= player.actionDuration) player.action = "idle";
    }
  }

  const attackHeld = actions.attack || keys.has(" ") || keys.has("j");
  if (attackHeld && player.action !== "idle") player.attackBuffer = 0.12;
  if (player.action === "idle" && (attackHeld || player.attackBuffer > 0)) beginAttack(state);

  if (state.introTimer > 0) state.introTimer = Math.max(0, state.introTimer - dt);
  const maxAlive = Math.min(18, 5 + Math.floor(state.wave / 2));
  const livingCount = state.enemies.filter((enemy) => !enemy.dead).length;
  state.spawnTimer -= dt;
  if (state.introTimer <= 0 && state.remainingBudget > 0.15 && state.spawnTimer <= 0 && livingCount < maxAlive) {
    spawnEnemy(state);
    state.spawnTimer = Math.max(0.42, 1.2 - 0.035 * (state.wave - 1));
  }

  let attackingEnemies = state.enemies.filter((enemy) => !enemy.dead && (enemy.state === "windup" || enemy.state === "active")).length;
  const attackLimit = Math.min(4, 1 + Math.floor((state.wave + 1) / 4));
  for (const enemy of state.enemies) {
    const definition = ENEMIES[enemy.kind];
    enemy.animTime += dt * (enemy.state === "chase" ? 8 : 3);
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    enemy.stun = Math.max(0, enemy.stun - dt);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.vx *= Math.pow(0.025, dt);
    enemy.vy *= Math.pow(0.025, dt);
    if (enemy.dead) {
      enemy.stateTimer += dt;
      enemy.deathTimer = Math.max(0, enemy.deathTimer - dt);
      continue;
    }
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    enemy.facing = dx >= 0 ? 1 : -1;

    if (enemy.state === "enter") {
      enemy.stateTimer += dt;
      enemy.x += (dx / length) * enemy.speed * dt;
      enemy.y += (dy / length) * enemy.speed * 0.72 * dt;
      if (enemy.stateTimer >= enemy.stateDuration) {
        enemy.state = "chase";
        enemy.stateTimer = 0;
      }
    } else if (enemy.state === "hurt") {
      enemy.stateTimer += dt;
      if (enemy.stateTimer >= enemy.stateDuration) {
        enemy.state = "chase";
        enemy.stateTimer = 0;
      }
    } else if (enemy.state === "windup") {
      enemy.stateTimer += dt;
      enemy.windup = Math.max(0, enemy.stateDuration - enemy.stateTimer);
      if (enemy.stateTimer >= enemy.stateDuration) {
        enemy.state = "active";
        enemy.stateTimer = 0;
        enemy.stateDuration = definition.active;
        enemy.attackResolved = false;
      }
    } else if (enemy.state === "active") {
      enemy.stateTimer += dt;
      if (definition.lunge > 0) {
        enemy.x += (dx / length) * (definition.lunge * 0.55 / Math.max(0.04, definition.active)) * dt;
        enemy.y += (dy / length) * (definition.lunge * 0.42 / Math.max(0.04, definition.active)) * dt;
      }
      if (!enemy.attackResolved) {
        enemy.attackResolved = true;
        if (enemy.kind === "thrower") {
          const shotX = enemy.x;
          const shotY = enemy.y - 46;
          const targetX = player.x;
          const targetY = player.y - 44;
          const shotLength = Math.hypot(targetX - shotX, targetY - shotY) || 1;
          state.projectiles.push({ id: state.nextProjectileId++, owner: "enemy", kind: "thrown", x: shotX, y: shotY, prevX: shotX, prevY: shotY, vx: ((targetX - shotX) / shotLength) * 390, vy: ((targetY - shotY) / shotLength) * 390, damage: enemy.damage, knockback: 110, life: 2.2, radius: 9, penetration: 0 });
        } else if (length < enemy.radius + definition.attackRange + definition.lunge * 0.32 && Math.abs(dy) < 105) {
          damagePlayer(state, enemy.damage, enemy);
        }
      }
      if (enemy.stateTimer >= enemy.stateDuration) {
        enemy.state = "recover";
        enemy.stateTimer = 0;
        enemy.stateDuration = definition.recovery;
      }
    } else if (enemy.state === "recover") {
      enemy.stateTimer += dt;
      if (enemy.stateTimer >= enemy.stateDuration) {
        enemy.state = "chase";
        enemy.stateTimer = 0;
      }
    } else if (enemy.state === "chase") {
      if (enemy.kind === "thrower") {
        if (length > 360) { enemy.x += (dx / length) * enemy.speed * dt; enemy.y += (dy / length) * enemy.speed * 0.72 * dt; }
        if (length < 210) { enemy.x -= (dx / length) * enemy.speed * dt; enemy.y -= (dy / length) * enemy.speed * 0.72 * dt; }
        if (length < definition.attackRange && enemy.attackCd <= 0 && attackingEnemies < attackLimit) {
          enemy.state = "windup";
          enemy.stateTimer = 0;
          enemy.stateDuration = definition.windup * Math.max(0.78, 1 - state.wave * 0.006);
          enemy.windup = enemy.stateDuration;
          enemy.attackCd = 1.75;
          attackingEnemies += 1;
        }
      } else {
        const attackRange = enemy.radius + definition.attackRange;
        if (length > attackRange) {
          enemy.x += (dx / length) * enemy.speed * dt;
          enemy.y += (dy / length) * enemy.speed * 0.72 * dt;
        } else if (enemy.attackCd <= 0 && attackingEnemies < attackLimit) {
          enemy.state = "windup";
          enemy.stateTimer = 0;
          enemy.stateDuration = definition.windup * Math.max(0.78, 1 - state.wave * 0.006);
          enemy.windup = enemy.stateDuration;
          enemy.attackCd = enemy.kind === "brute" ? 1.65 : 1.05;
          attackingEnemies += 1;
        } else if (attackingEnemies >= attackLimit) {
          enemy.x += (-dy / length) * enemy.speed * 0.18 * dt * (enemy.id % 2 ? 1 : -1);
          enemy.y += (dx / length) * enemy.speed * 0.12 * dt * (enemy.id % 2 ? 1 : -1);
        }
      }
    }
    enemy.x = clamp(enemy.x, ARENA.left - 45, ARENA.right + 45);
    enemy.y = clamp(enemy.y, ARENA.top, ARENA.bottom);
  }

  const solidEnemies = state.enemies.filter((enemy) => !enemy.dead);
  for (let a = 0; a < solidEnemies.length; a += 1) {
    for (let b = a + 1; b < solidEnemies.length; b += 1) {
      const first = solidEnemies[a];
      const second = solidEnemies[b];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const length = Math.hypot(dx, dy) || 1;
      const overlap = (first.radius + second.radius) * 0.66 - length;
      if (overlap > 0) {
        const push = Math.min(5, overlap * 0.18);
        first.x -= (dx / length) * push;
        first.y -= (dy / length) * push;
        second.x += (dx / length) * push;
        second.y += (dy / length) * push;
      }
    }
  }

  for (const projectile of state.projectiles) {
    projectile.prevX = projectile.x;
    projectile.prevY = projectile.y;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    if (projectile.owner === "enemy") {
      if (segmentPointDistance(projectile.prevX, projectile.prevY, projectile.x, projectile.y, player.x, player.y - 44) < 30 + projectile.radius) {
        damagePlayer(state, projectile.damage);
        projectile.life = 0;
      }
    } else {
      for (const enemy of state.enemies) {
        if (enemy.dead) continue;
        if (segmentPointDistance(projectile.prevX, projectile.prevY, projectile.x, projectile.y, enemy.x, enemy.y - 48) < enemy.radius * 0.72 + projectile.radius) {
          hitEnemy(state, enemy, projectile.damage, projectile.kind === "pellet" ? 0.1 : 0.14, projectile.knockback, projectile.prevX, projectile.prevY, projectile.kind === "pellet" ? 0.025 : 0.04);
          projectile.penetration -= 1;
          if (projectile.penetration < 0) projectile.life = 0;
          break;
        }
      }
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.life > 0 && projectile.x > -80 && projectile.x < WORLD_W + 80 && projectile.y > -80 && projectile.y < WORLD_H + 80);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead || enemy.stateTimer < enemy.stateDuration);
  for (const pickup of state.pickups) {
    pickup.life -= dt;
    pickup.bob += dt * 4;
  }
  state.pickups = state.pickups.filter((pickup) => pickup.life > 0);
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter((effect) => effect.life > 0);

  if (state.remainingBudget <= 0.15 && !state.enemies.some((enemy) => !enemy.dead) && state.introTimer <= 0) {
    const clearedWave = state.wave;
    state.score += 200 + 50 * clearedWave;
    player.hp = Math.min(player.maxHp, player.hp + player.waveHeal);
    state.projectiles = [];
    state.wave += 1;
    state.remainingBudget = budgetForWave(state.wave);
    state.spawnTimer = 0.8;
    state.introTimer = 1.8;
    addEffect(state, { x: WORLD_W / 2, y: 360, life: 1.4, color: MONO_WHITE, text: `WAVE ${clearedWave} CLEARED`, kind: "text" });
    if (clearedWave % 3 === 0) state.pendingUpgrade = true;
  }
}

function drawHeldWeapon(ctx: CanvasRenderingContext2D, kind: WeaponKind, x: number, y: number, rotation: number, recoil = 0) {
  ctx.save();
  ctx.translate(x - recoil * 8, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = "#f4f4f4";
  ctx.fillStyle = "#f4f4f4";
  ctx.lineCap = "square";
  if (kind === "bat") {
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(58, 0); ctx.stroke();
    ctx.fillStyle = "#777"; ctx.fillRect(-15, -4, 18, 8);
  } else if (kind === "knife") {
    ctx.fillStyle = "#777"; ctx.fillRect(-11, -4, 17, 8);
    ctx.fillStyle = "#f4f4f4"; ctx.beginPath(); ctx.moveTo(5, -7); ctx.lineTo(42, 0); ctx.lineTo(5, 7); ctx.closePath(); ctx.fill();
  } else if (kind === "pistol") {
    ctx.fillRect(-7, -7, 35, 13); ctx.fillRect(5, 5, 10, 18);
  } else if (kind === "shotgun") {
    ctx.fillRect(-12, -6, 78, 11); ctx.fillStyle = "#777"; ctx.fillRect(-6, 5, 28, 9); ctx.fillRect(29, 5, 24, 7);
  } else {
    ctx.beginPath(); ctx.arc(4, 0, 8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFighter(ctx: CanvasRenderingContext2D, state: GameState, images: Record<string, HTMLImageElement>) {
  const player = state.player;
  const stride = Math.sin(player.animTime) * 10 * player.moveAmount * (player.action === "dash" ? 0 : 1);
  const bob = Math.abs(Math.sin(player.animTime)) * -3 * player.moveAmount;
  let strike = 0;
  if (player.action === "attack" && player.attackSpec) {
    const spec = player.attackSpec;
    if (player.actionTime < spec.startup) strike = -0.65 * (player.actionTime / Math.max(0.01, spec.startup));
    else if (player.actionTime < spec.startup + spec.active) strike = -0.65 + 1.65 * ((player.actionTime - spec.startup) / Math.max(0.01, spec.active));
    else strike = 1 - clamp((player.actionTime - spec.startup - spec.active) / Math.max(0.01, spec.recovery), 0, 1);
  }
  if (player.action === "dash") {
    for (let echo = 3; echo >= 1; echo -= 1) {
      ctx.save();
      ctx.globalAlpha = 0.08 * (4 - echo);
      ctx.fillStyle = "#f4f4f4";
      ctx.translate(player.x - player.dashX * echo * 30, player.y - player.dashY * echo * 22);
      ctx.beginPath(); ctx.ellipse(0, -42, 28, 61, -player.dashY * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.translate(player.x, player.y + bob);
  ctx.scale(player.facing, 1);
  const hurtLean = player.action === "hurt" ? -0.22 : 0;
  const dashLean = player.action === "dash" ? -0.16 : 0;
  ctx.rotate(hurtLean + dashLean);
  if (state.pantId === "ghost" && player.abilityTimer > 0) ctx.globalAlpha = 0.42;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.beginPath(); ctx.ellipse(0, 7, player.action === "dash" ? 55 : 43, player.action === "dash" ? 8 : 13, 0, 0, Math.PI * 2); ctx.fill();

  const legLift = player.action === "dash" ? -9 : 0;
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 12; ctx.lineCap = "square";
  ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(-17 - stride * 0.45, 18 + legLift); ctx.moveTo(12, -12); ctx.lineTo(17 + stride * 0.45, 18 - legLift); ctx.stroke();
  ctx.fillStyle = "#050505"; ctx.fillRect(-33 - stride * 0.45, 16 + legLift, 30, 10); ctx.fillRect(5 + stride * 0.45, 16 - legLift, 31, 10);

  ctx.fillStyle = player.hitFlash > 0 ? "#fff" : "#151515";
  ctx.beginPath(); ctx.moveTo(-19, -89); ctx.lineTo(19, -89); ctx.lineTo(25, -47); ctx.lineTo(-24, -47); ctx.closePath(); ctx.fill();
  const image = images[state.pantId];
  if (image) {
    ctx.save(); ctx.filter = "grayscale(1) contrast(1.3) brightness(.9)"; ctx.drawImage(image, -33, -51, 66, 78); ctx.restore();
  } else { ctx.fillStyle = "#8b8b8b"; ctx.fillRect(-27, -50, 54, 70); }

  const localAim = player.facing > 0 ? player.aimAngle : Math.PI - player.aimAngle;
  const weaponKind = player.weapon.kind;
  const firearm = WEAPONS[weaponKind].firearm;
  const reach = firearm ? 35 : 27 + Math.max(0, strike) * 36;
  const handX = reach * Math.cos(localAim);
  const handY = -66 + Math.sin(localAim) * 25 + (firearm ? 0 : strike * -3);
  ctx.strokeStyle = player.hitFlash > 0 ? "#fff" : "#d9d9d9"; ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-14, -77); ctx.lineTo(-32 + stride * 0.25, -51); ctx.moveTo(14, -77); ctx.lineTo(handX, handY); ctx.stroke();
  drawHeldWeapon(ctx, weaponKind, handX, handY, localAim, player.recoil);

  ctx.fillStyle = player.hitFlash > 0 ? "#fff" : "#d8d8d8";
  ctx.beginPath(); ctx.arc(0, -104, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111"; ctx.fillRect(4, -108, 8, 3);
  if (state.pantId === "guard" && player.abilityTimer > 0) {
    ctx.strokeStyle = "#f4f4f4"; ctx.lineWidth = 4; ctx.globalAlpha = 0.65;
    ctx.beginPath(); ctx.arc(0, -43, 64, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const def = ENEMIES[enemy.kind];
  const stride = enemy.state === "chase" || enemy.state === "enter" ? Math.sin(enemy.animTime) * 8 : 0;
  const stateProgress = clamp(enemy.stateTimer / Math.max(0.01, enemy.stateDuration), 0, 1);
  const windupLean = enemy.state === "windup" ? -0.18 * stateProgress : 0;
  const activeLean = enemy.state === "active" ? 0.28 : 0;
  const hurtLean = enemy.state === "hurt" ? -0.25 * enemy.facing : 0;
  const deathLean = enemy.state === "dead" ? enemy.facing * stateProgress * 1.42 : 0;
  ctx.save();
  ctx.translate(enemy.x, enemy.y + (enemy.state === "dead" ? stateProgress * 9 : 0));
  ctx.scale(enemy.facing, enemy.state === "windup" ? 1 - stateProgress * 0.04 : 1);
  ctx.rotate(windupLean + activeLean + hurtLean + deathLean);
  ctx.fillStyle = "rgba(0,0,0,.48)";
  ctx.beginPath(); ctx.ellipse(0, 7, enemy.radius * 1.25, 10, 0, 0, Math.PI * 2); ctx.fill();
  if (enemy.state === "windup") {
    ctx.save(); ctx.rotate(-(windupLean + activeLean + hurtLean + deathLean));
    ctx.strokeStyle = "#f4f4f4"; ctx.lineWidth = 4; ctx.globalAlpha = 0.8; ctx.setLineDash([8, 5]);
    ctx.beginPath(); ctx.arc(0, -35, enemy.radius + 20, -Math.PI / 2, -Math.PI / 2 + stateProgress * Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const bodyW = enemy.kind === "brute" ? 55 : 39;
  ctx.fillStyle = enemy.hitFlash > 0 ? "#fff" : def.color;
  ctx.beginPath(); ctx.arc(0, -82, enemy.kind === "brute" ? 17 : 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = enemy.hitFlash > 0 ? "#f4f4f4" : enemy.kind === "walker" ? "#2d2d2d" : "#181818";
  ctx.fillRect(-bodyW / 2, -68, bodyW, enemy.kind === "brute" ? 58 : 48);
  const attackReach = enemy.state === "active" ? 30 : enemy.state === "windup" ? -14 * stateProgress : 0;
  ctx.strokeStyle = enemy.hitFlash > 0 ? "#fff" : def.color; ctx.lineWidth = enemy.kind === "brute" ? 10 : 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-bodyW / 3, -52); ctx.lineTo(-bodyW / 2 - 12 - stride * 0.3, -20); ctx.moveTo(bodyW / 3, -52); ctx.lineTo(bodyW / 2 + 17 + attackReach, -27); ctx.stroke();
  ctx.strokeStyle = "#090909"; ctx.lineWidth = enemy.kind === "brute" ? 12 : 9;
  ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(-16 - stride * 0.5, 12); ctx.moveTo(12, -12); ctx.lineTo(17 + stride * 0.5, 12); ctx.stroke();
  if (enemy.elite) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.strokeRect(-bodyW / 2 - 6, -106, bodyW + 12, 124); }
  ctx.restore();
  if (!enemy.dead) {
    const barW = enemy.radius * 2.4;
    ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.fillRect(enemy.x - barW / 2, enemy.y - 124, barW, 5);
    ctx.fillStyle = enemy.elite ? "#fff" : def.color; ctx.fillRect(enemy.x - barW / 2, enemy.y - 124, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 5);
  }
}

function drawPickup(ctx: CanvasRenderingContext2D, pickup: WeaponPickup, nearby: boolean) {
  const y = pickup.y - 20 + Math.sin(pickup.bob) * 5;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.58)"; ctx.beginPath(); ctx.ellipse(pickup.x, pickup.y + 4, 35, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(pickup.x, y); ctx.scale(0.72, 0.72); drawHeldWeapon(ctx, pickup.weapon.kind, -20, 0, -0.14); ctx.restore();
  ctx.save(); ctx.textAlign = "center"; ctx.font = "900 13px ui-monospace, monospace"; ctx.fillStyle = nearby ? "#fff" : "rgba(255,255,255,.65)";
  ctx.fillText(nearby ? `Q  ${WEAPONS[pickup.weapon.kind].label}` : WEAPONS[pickup.weapon.kind].label, pickup.x, y - 24); ctx.restore();
}

function drawGame(ctx: CanvasRenderingContext2D, state: GameState, images: Record<string, HTMLImageElement>, reducedMotion: boolean) {
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  ctx.save();
  if (state.shake > 0 && !reducedMotion) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const camera = (state.player.x / WORLD_W - 0.5) * 38;
  CITY_LAYERS.forEach((_, index) => {
    const image = images[`city-${index}`];
    if (!image) return;
    const parallax = camera * (0.08 + index * 0.075);
    ctx.save();
    ctx.filter = `grayscale(1) contrast(${index < 5 ? 1.1 : 1.25}) brightness(${index < 5 ? 0.55 : 0.72})`;
    ctx.globalAlpha = index === 0 ? 0.92 : 0.82;
    ctx.drawImage(image, -55 - parallax, 20, WORLD_W + 110, 500);
    ctx.restore();
  });
  const industrial = images.industrial;
  if (industrial) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.filter = "grayscale(1) contrast(1.4) brightness(.72)";
    ctx.drawImage(industrial, 128, 64, 64, 48, 72, 254, 160, 120);
    ctx.drawImage(industrial, 192, 144, 96, 48, 958, 286, 240, 120);
    ctx.restore();
  }
  const streetGradient = ctx.createLinearGradient(0, 350, 0, WORLD_H);
  streetGradient.addColorStop(0, "rgba(14,14,14,.72)"); streetGradient.addColorStop(1, "#050505");
  ctx.fillStyle = streetGradient; ctx.fillRect(0, 352, WORLD_W, WORLD_H - 352);
  ctx.strokeStyle = "rgba(255,255,255,.055)"; ctx.lineWidth = 2;
  for (let y = 410; y < 700; y += 68) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke(); }
  for (let x = -100; x < WORLD_W + 100; x += 160) { ctx.beginPath(); ctx.moveTo(x, 720); ctx.lineTo(x + 120, 355); ctx.stroke(); }
  ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.font = "900 70px Impact, sans-serif"; ctx.save(); ctx.rotate(-0.035); ctx.fillText("AESTRA // HOLD THE BLOCK", 70, 344); ctx.restore();

  for (const pickup of state.pickups) drawPickup(ctx, pickup, pickup.id === state.player.nearPickupId);
  const actors: Array<{ y: number; draw: () => void }> = state.enemies.map((enemy) => ({ y: enemy.y, draw: () => drawEnemy(ctx, enemy) }));
  actors.push({ y: state.player.y, draw: () => drawFighter(ctx, state, images) });
  actors.sort((a, b) => a.y - b.y).forEach((actor) => actor.draw());

  for (const projectile of state.projectiles) {
    ctx.fillStyle = projectile.owner === "player" ? "#fff" : "#9a9a9a";
    ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = projectile.owner === "player" ? "rgba(255,255,255,.72)" : "rgba(190,190,190,.45)";
    ctx.lineWidth = projectile.kind === "pellet" ? 2 : 4; ctx.beginPath(); ctx.moveTo(projectile.x, projectile.y); ctx.lineTo(projectile.prevX, projectile.prevY); ctx.stroke();
  }
  for (const effect of state.effects) {
    const alpha = clamp(effect.life / effect.maxLife, 0, 1);
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = effect.color; ctx.fillStyle = effect.color;
    if (effect.kind === "text" && effect.text) {
      const big = effect.text.includes("WAVE");
      ctx.font = `900 ${big ? 54 : 26}px Impact, sans-serif`; ctx.textAlign = "center";
      ctx.fillText(effect.text, effect.x, effect.y - (1 - alpha) * 38);
    } else if (effect.kind === "ring" || effect.kind === "bolt") {
      ctx.lineWidth = effect.kind === "bolt" ? 7 : 5; ctx.beginPath();
      ctx.arc(effect.x, effect.y - 30, (effect.radius ?? 40) * (1.15 - alpha * 0.2), 0, Math.PI * 2); ctx.stroke();
    } else if (effect.kind === "trail") {
      ctx.fillStyle = effect.color; ctx.globalAlpha = alpha * 0.16; ctx.beginPath(); ctx.ellipse(effect.x, effect.y - 40, effect.radius ?? 32, (effect.radius ?? 32) * 1.35, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(effect.x, effect.y - 42, effect.radius ?? 24, -1.1, 1.1); ctx.stroke();
    }
    ctx.restore();
  }
  if (state.introTimer > 0) {
    ctx.textAlign = "center"; ctx.fillStyle = "#f4f4f4"; ctx.font = "900 72px Impact, sans-serif";
    ctx.fillText(`WAVE ${String(state.wave).padStart(2, "0")}`, WORLD_W / 2, 330);
    ctx.font = "700 18px Arial, sans-serif"; ctx.fillStyle = "#bdbdbd"; ctx.fillText(state.wave >= 8 ? "THE HORDE IS HERE" : "HOLD THE BLOCK", WORLD_W / 2, 366);
  }
  ctx.restore();
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function CamoClashGame() {
  const [screen, setScreen] = useState<Screen>("menu");
  const screenRef = useRef<Screen>("menu");
  const [selectedPant, setSelectedPant] = useState<PantId>("ghost");
  const [playerName, setPlayerName] = useState("FIGHTER");
  const [hud, setHud] = useState<Hud>({ health: 100, maxHealth: 100, score: 0, wave: 1, combo: 0, kills: 0, abilityCd: 0, dashCd: 0, enemies: 0, weapon: "fists", ammo: 0, reserve: 0, durability: 0, reloading: false, nearWeapon: null });
  const [result, setResult] = useState<Result | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [boardStatus, setBoardStatus] = useState("Loading the street records…");
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const actionsRef = useRef({ dx: 0, dy: 0, attack: false, dash: false, ability: false, swap: false, reload: false });
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const joystickRef = useRef<{ id: number | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  const pant = useMemo(() => getPant(selectedPant), [selectedPant]);

  const changeScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    setBoardStatus("Loading the street records…");
    try {
      const response = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json() as { entries: LeaderboardEntry[] };
      setLeaderboard(data.entries);
      setBoardStatus(data.entries.length ? "" : "No scores yet. Own the first record.");
    } catch {
      setBoardStatus("The leaderboard is reconnecting. Your run is still safe.");
    }
  }, []);

  useEffect(() => {
    const savedName = localStorage.getItem("camo-clash-name");
    const nameFrame = savedName ? requestAnimationFrame(() => setPlayerName(savedName)) : 0;
    for (const item of PANTS) {
      const image = new Image();
      image.src = item.asset;
      image.onload = () => { imagesRef.current[item.id] = image; };
    }
    CITY_LAYERS.forEach((source, index) => {
      const image = new Image();
      image.src = source;
      image.onload = () => { imagesRef.current[`city-${index}`] = image; };
    });
    const industrial = new Image();
    industrial.src = "/pixel/industrial-tileset.png";
    industrial.onload = () => { imagesRef.current.industrial = industrial; };
    const boardFrame = requestAnimationFrame(() => { void fetchLeaderboard(); });
    return () => { if (nameFrame) cancelAnimationFrame(nameFrame); cancelAnimationFrame(boardFrame); };
  }, [fetchLeaderboard]);

  useEffect(() => {
    const resetInputs = () => {
      keysRef.current.clear();
      actionsRef.current.dx = 0;
      actionsRef.current.dy = 0;
      actionsRef.current.attack = false;
      actionsRef.current.dash = false;
      actionsRef.current.ability = false;
      actionsRef.current.swap = false;
      actionsRef.current.reload = false;
    };
    if (screen !== "playing") resetInputs();
    const onVisibility = () => { if (document.hidden) resetInputs(); };
    window.addEventListener("blur", resetInputs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", resetInputs);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [screen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
      keysRef.current.add(key);
      if (!event.repeat && (key === "shift" || key === "k")) actionsRef.current.dash = true;
      if (!event.repeat && (key === "e" || key === "l")) actionsRef.current.ability = true;
      if (!event.repeat && key === "q") actionsRef.current.swap = true;
      if (!event.repeat && key === "r") actionsRef.current.reload = true;
      if (!event.repeat && (key === "escape" || key === "p")) {
        if (screenRef.current === "playing") changeScreen("paused");
        else if (screenRef.current === "paused") changeScreen("playing");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [changeScreen]);

  useEffect(() => {
    if (screen !== "playing" || !gameRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frameId = 0;
    let last = performance.now();
    let hudClock = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = (now: number) => {
      const state = gameRef.current;
      if (!state || screenRef.current !== "playing") return;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      updateGame(state, dt, keysRef.current, actionsRef.current);
      drawGame(ctx, state, imagesRef.current, reducedMotion);
      hudClock += dt;
      if (hudClock > 0.08) {
        hudClock = 0;
        const nearPickup = state.pickups.find((pickup) => pickup.id === state.player.nearPickupId);
        setHud({
          health: state.player.hp,
          maxHealth: state.player.maxHp,
          score: state.score,
          wave: state.wave,
          combo: state.combo,
          kills: state.kills,
          abilityCd: state.player.abilityCd,
          dashCd: state.player.dashCd,
          enemies: state.enemies.filter((enemy) => !enemy.dead).length,
          weapon: state.player.weapon.kind,
          ammo: state.player.weapon.ammo,
          reserve: state.player.weapon.reserve,
          durability: state.player.weapon.durability,
          reloading: state.player.action === "reload",
          nearWeapon: nearPickup?.weapon.kind ?? null,
        });
      }
      if (state.player.hp <= 0) {
        setResult({ runId: state.runId, score: state.score, wave: state.wave, kills: state.kills, maxCombo: state.maxCombo, elapsed: state.elapsed });
        setSubmitStatus("");
        changeScreen("gameover");
        void fetchLeaderboard();
        return;
      }
      if (state.pendingUpgrade) {
        const choices = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
        setUpgrades(choices);
        changeScreen("upgrade");
        return;
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [screen, changeScreen, fetchLeaderboard]);

  const startRun = () => {
    const normalized = playerName.trim().slice(0, 18) || "FIGHTER";
    setPlayerName(normalized);
    localStorage.setItem("camo-clash-name", normalized);
    gameRef.current = freshRun(selectedPant);
    setResult(null);
    setSubmitted(false);
    setHud({ health: 100, maxHealth: 100, score: 0, wave: 1, combo: 0, kills: 0, abilityCd: 0, dashCd: 0, enemies: 0, weapon: "fists", ammo: 0, reserve: 0, durability: 0, reloading: false, nearWeapon: null });
    changeScreen("playing");
  };

  const chooseUpgrade = (upgrade: Upgrade) => {
    const state = gameRef.current;
    if (!state) return;
    upgrade.apply(state.player);
    state.pendingUpgrade = false;
    changeScreen("playing");
  };

  const submitScore = async () => {
    if (!result || submitted) return;
    const normalized = playerName.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (Array.from(normalized).length < 2) { setSubmitStatus("Enter at least two characters."); return; }
    setSubmitStatus("Posting your street record…");
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, playerName: normalized, pantId: selectedPant }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Submission failed");
      setSubmitted(true);
      setSubmitStatus("Score locked in.");
      localStorage.setItem("camo-clash-name", normalized);
      await fetchLeaderboard();
    } catch (cause) {
      setSubmitStatus(cause instanceof Error ? cause.message : "Could not submit this score yet.");
    }
  };

  const openLeaderboard = () => { void fetchLeaderboard(); changeScreen("leaderboard"); };
  const backFromBoard = () => changeScreen(result ? "gameover" : "menu");

  const handleJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const stick = event.currentTarget;
    const rect = stick.getBoundingClientRect();
    const rawX = event.clientX - (rect.left + rect.width / 2);
    const rawY = event.clientY - (rect.top + rect.height / 2);
    const maxTravel = Math.max(28, rect.width * 0.34);
    const rawLength = Math.hypot(rawX, rawY);
    const scale = rawLength > maxTravel ? maxTravel / rawLength : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    actionsRef.current.dx = x / maxTravel;
    actionsRef.current.dy = y / maxTravel;
    joystickRef.current.x = x;
    joystickRef.current.y = y;
    stick.style.setProperty("--stick-x", `${x}px`);
    stick.style.setProperty("--stick-y", `${y}px`);
  };

  const releaseJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    actionsRef.current.dx = 0; actionsRef.current.dy = 0;
    event.currentTarget.style.setProperty("--stick-x", "0px");
    event.currentTarget.style.setProperty("--stick-y", "0px");
  };

  const healthPercent = clamp((hud.health / hud.maxHealth) * 100, 0, 100);
  const threat = Math.min(5, 1 + Math.floor((hud.wave - 1) / 3));

  return (
    <main className="game-shell" style={{ "--pant-accent": "#f2f2f2" } as React.CSSProperties}>
      {screen === "menu" && (
        <section className="menu-screen">
          <div className="brand-line"><span>AESTRAWEAR</span><span>GAME DIVISION // 002</span></div>
          <div className="menu-grid">
            <header className="hero-copy">
              <p className="eyebrow">ENDLESS STREET SURVIVAL</p>
              <h1>CAMO<br /><span>CLASH</span></h1>
              <p className="hero-lede">Own the block with fists, steel, and firepower. Break every wave. Wear the power.</p>
              <div className="name-field">
                <label htmlFor="fighter-name">Fighter name</label>
                <input id="fighter-name" maxLength={18} value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
              </div>
              <div className="hero-actions">
                <button className="primary-button" onClick={startRun}>ENTER THE STREET <span>-&gt;</span></button>
                <button className="text-button" onClick={openLeaderboard}>TOP SCORES</button>
              </div>
              <p className="control-copy">WASD / ARROWS MOVE | SPACE / J ATTACK | SHIFT / K DASH | E / L POWER | Q SWAP | R RELOAD</p>
            </header>

            <div className="fighter-hero" aria-label={`${pant.name} pants selected`}>
              <div className="poster-word">{pant.callSign}</div>
              {/* Product photography is intentionally shown at full fidelity here. */}
              <img src={pant.asset} alt={`${pant.name} AESTRAWEAR camouflage pants`} />
              <div className="fighter-shadow" />
              <div className="selection-stamp">SELECTED // {PANTS.findIndex((item) => item.id === selectedPant) + 1}</div>
            </div>

            <aside className="ability-dossier cut-panel">
              <p className="eyebrow">PANT ABILITY</p>
              <p className="dossier-index">0{PANTS.findIndex((item) => item.id === selectedPant) + 1}</p>
              <h2>{pant.ability}</h2>
              <p className="ability-copy">{pant.abilityLabel}</p>
              <dl>
                <div><dt>STYLE</dt><dd>{pant.description}</dd></div>
                <div><dt>COOLDOWN</dt><dd>{pant.cooldown}s</dd></div>
                <div><dt>RANK</dt><dd>STREET ISSUE</dd></div>
              </dl>
              <div className="future-note"><strong>ARMED STREETS</strong><span>Weapons drop in combat. Zombie-class enemies enter at wave 08.</span></div>
            </aside>
          </div>

          <div className="pants-rail" aria-label="Choose your pants">
            {PANTS.map((item, index) => (
              <button key={item.id} className={`pant-card ${selectedPant === item.id ? "selected" : ""}`} onClick={() => setSelectedPant(item.id)}>
                <span className="pant-number">0{index + 1}</span>
                <img src={item.asset} alt="" />
                <span><strong>{item.name}</strong><small>{item.callSign}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {screen !== "menu" && screen !== "leaderboard" && (
        <section className="arena-screen">
          <canvas ref={canvasRef} className="fight-canvas" aria-label="Camo Clash fight arena. Survive progressively harder enemy waves." />
          <div className="hud">
            <div className="hud-player cut-panel">
              <div className="hud-name"><span>{playerName}</span><small>{pant.callSign}</small></div>
              <div className="health-track" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={hud.maxHealth} aria-valuenow={Math.round(hud.health)}>
                <span style={{ width: `${healthPercent}%` }} />
              </div>
              <div className="health-label">HP {Math.ceil(hud.health)} / {hud.maxHealth}</div>
            </div>
            <div className="wave-hud">
              <small>WAVE</small><strong>{String(hud.wave).padStart(2, "0")}</strong>
              <div className="threat-pips" aria-label={`Threat level ${threat} of 5`}>{[1, 2, 3, 4, 5].map((level) => <i key={level} className={level <= threat ? "active" : ""} />)}</div>
              <span>{hud.enemies} ON BLOCK</span>
            </div>
            <div className="score-hud"><small>SCORE</small><strong>{hud.score.toLocaleString().padStart(7, "0")}</strong>{hud.combo > 1 && <span>x{hud.combo} COMBO</span>}</div>
          </div>
          <span className="sr-status" aria-live="polite">Wave {hud.wave}. {hud.abilityCd <= 0 ? `${pant.ability} ready.` : ""}</span>
          <div className="weapon-hud" aria-label={`${WEAPONS[hud.weapon].label} weapon status`}>
            <div className="weapon-slot active cut-panel">
              <img src={WEAPONS[hud.weapon].icon} alt="" />
              <span><strong>{WEAPONS[hud.weapon].label}</strong>{WEAPONS[hud.weapon].firearm ? (hud.reloading ? "RELOADING" : `${hud.ammo} / ${hud.reserve}`) : hud.weapon === "fists" ? "UNBREAKABLE" : `DUR ${hud.durability}`}</span>
            </div>
            {hud.nearWeapon && <span className="weapon-prompt">Q / SWAP FOR {WEAPONS[hud.nearWeapon].label}</span>}
          </div>
          <div className="desktop-controls"><span>WASD MOVE</span><span>SPACE ATTACK</span><span>SHIFT DASH</span><span>E ABILITY</span><span>Q SWAP</span><span>R RELOAD</span></div>
          <button type="button" className="pause-button" onClick={() => changeScreen("paused")} aria-label="Pause game">II</button>
          <button
            className={`ability-button ${hud.abilityCd <= 0 ? "ready" : ""}`}
            onPointerDown={() => { actionsRef.current.ability = true; }}
            aria-label={`${pant.ability}. ${hud.abilityCd <= 0 ? "Ready" : `${hud.abilityCd.toFixed(1)} seconds remaining`}`}
          >
            <small>ABILITY</small><strong>{hud.abilityCd <= 0 ? "READY" : hud.abilityCd.toFixed(1)}</strong><span>{pant.ability}</span>
          </button>
          <div className="touch-controls" aria-label="Touch controls">
            <div className="joystick" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); handleJoystick(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) handleJoystick(event); }} onPointerUp={releaseJoystick} onPointerCancel={releaseJoystick}><i /></div>
            <div className="action-cluster">
              <button type="button" className="touch-weapon" aria-label="Swap or drop weapon" onPointerDown={() => { actionsRef.current.swap = true; }}><img className="touch-icon" src={WEAPONS[hud.weapon].icon} alt="" /><span>SWAP</span></button>
              <button type="button" className={`touch-ability ${hud.abilityCd <= 0 ? "ready" : "cooldown"}`} aria-label={`${pant.ability} ability`} onPointerDown={() => { actionsRef.current.ability = true; }}><span>{hud.abilityCd <= 0 ? "POWER" : hud.abilityCd.toFixed(1)}</span></button>
              <button type="button" className="touch-attack" aria-label={WEAPONS[hud.weapon].firearm ? "Fire weapon" : "Attack"} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); actionsRef.current.attack = true; }} onPointerUp={() => { actionsRef.current.attack = false; }} onPointerCancel={() => { actionsRef.current.attack = false; }} onLostPointerCapture={() => { actionsRef.current.attack = false; }}><img className="touch-icon" src={WEAPONS[hud.weapon].icon} alt="" /><span>{WEAPONS[hud.weapon].firearm ? "FIRE" : "HIT"}</span></button>
              <button type="button" className={`touch-reload ${hud.reloading ? "reloading" : ""}`} aria-label="Reload weapon" disabled={!WEAPONS[hud.weapon].firearm} onPointerDown={() => { actionsRef.current.reload = true; }}><img className="touch-icon" src="/pixel/icons/reload.png" alt="" /><span>{WEAPONS[hud.weapon].firearm ? `${hud.ammo}/${hud.reserve}` : "LOAD"}</span></button>
              <button type="button" className="touch-dash" aria-label="Dash" onPointerDown={() => { actionsRef.current.dash = true; }}><img className="touch-icon" src="/pixel/icons/dash.png" alt="" /><span>DASH</span></button>
            </div>
          </div>

          {screen === "paused" && (
            <div className="modal-backdrop">
              <div className="pause-panel cut-panel"><p className="eyebrow">FIGHT ON HOLD</p><h2>PAUSED</h2><button className="primary-button" onClick={() => changeScreen("playing")}>BACK TO THE BLOCK</button><button className="text-button" onClick={() => changeScreen("menu")}>QUIT RUN</button></div>
            </div>
          )}

          {screen === "upgrade" && (
            <div className="modal-backdrop">
              <div className="upgrade-panel">
                <p className="eyebrow">WAVE CLEARED // CHOOSE ONE</p><h2>LEVEL UP THE FIT</h2>
                <div className="upgrade-grid">{upgrades.map((upgrade, index) => <button key={upgrade.id} onClick={() => chooseUpgrade(upgrade)}><span>0{index + 1}</span><strong>{upgrade.name}</strong><small>{upgrade.description}</small></button>)}</div>
              </div>
            </div>
          )}

          {screen === "gameover" && result && (
            <div className="modal-backdrop results-backdrop">
              <div className="results-panel cut-panel">
                <div><p className="eyebrow">RUN TERMINATED</p><h2>OVERRUN</h2><p className="result-score">{result.score.toLocaleString()}</p><span className="score-caption">FINAL SCORE</span></div>
                <div className="result-stats"><div><strong>{result.wave}</strong><span>WAVE</span></div><div><strong>{result.kills}</strong><span>KOs</span></div><div><strong>x{result.maxCombo}</strong><span>MAX COMBO</span></div><div><strong>{formatTime(result.elapsed)}</strong><span>SURVIVED</span></div></div>
                <div className="submit-block"><label htmlFor="result-name">FIGHTER NAME</label><input id="result-name" maxLength={18} value={playerName} onChange={(event) => setPlayerName(event.target.value)} /><button className="primary-button" disabled={submitted} onClick={submitScore}>{submitted ? "SCORE LOCKED" : "SUBMIT SCORE"}</button><p role="status">{submitStatus}</p></div>
                <div className="result-actions"><button onClick={startRun}>FIGHT AGAIN</button><button onClick={() => { setResult(null); changeScreen("menu"); }}>CHANGE PANTS</button><button onClick={openLeaderboard}>LEADERBOARD</button></div>
              </div>
            </div>
          )}
        </section>
      )}

      {screen === "leaderboard" && (
        <section className="leaderboard-screen">
          <div className="board-header"><div><p className="eyebrow">ALL-TIME STREET RECORDS</p><h1>TOP<br /><span>FIGHTERS</span></h1></div><button className="close-board" onClick={backFromBoard}>BACK X</button></div>
          {boardStatus && <p className="board-status">{boardStatus}</p>}
          {leaderboard.length > 0 && (
            <div className="leaderboard-table" role="table" aria-label="Top Camo Clash scores">
              <div className="board-row board-labels" role="row"><span>RANK</span><span>FIGHTER</span><span>FIT</span><span>WAVE</span><span>KOs</span><span>SCORE</span></div>
              {leaderboard.map((entry) => {
                const entryPant = getPant(entry.pantId);
                return <div className={`board-row ${entry.rank <= 3 ? "podium" : ""}`} role="row" key={entry.id} style={{ "--row-accent": entryPant.color } as React.CSSProperties}><span>#{String(entry.rank).padStart(2, "0")}</span><strong>{entry.playerName}</strong><span className="board-fit"><img src={entryPant.asset} alt="" />{entryPant.callSign}</span><span>{entry.wave}</span><span>{entry.kills}</span><b>{entry.score.toLocaleString()}</b></div>;
              })}
            </div>
          )}
          <p className="honor-note">Leaderboard scores are public run records. Competitive anti-cheat validation will be strengthened as the game grows.</p>
        </section>
      )}
    </main>
  );
}
