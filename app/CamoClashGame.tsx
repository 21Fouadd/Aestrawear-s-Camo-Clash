"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZombieAudio, type ZombieSoundId } from "../lib/game-audio";
import { getPant, PANTS, type PantId } from "../lib/game-config";

const WORLD_W = 1280;
const WORLD_H = 720;
const ARENA = { left: 72, right: 1208, top: 250, bottom: 630 };

type Screen = "menu" | "playing" | "paused" | "upgrade" | "gameover" | "leaderboard";
type EnemyKind = "thug" | "runner" | "brute" | "thrower" | "walker";
type EnemyState = "enter" | "chase" | "windup" | "active" | "recover" | "hurt" | "dead";
type PlayerAction = "idle" | "attack" | "dash" | "reload" | "hurt" | "dead";
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
  attackX: number;
  attackY: number;
  attackFacing: number;
  animTime: number;
  hitFlash: number;
  deathTimer: number;
  zombieVariant: 0 | 1;
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
  pickupLock: number;
};
type Effect = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  text?: string;
  radius?: number;
  angle?: number;
  strength?: number;
  seed?: number;
  kind: "hit" | "ring" | "text" | "trail" | "bolt" | "slash" | "burst" | "dust" | "muzzle";
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
  attackHeld: boolean;
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
  slowTimer: number;
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
  audioEvents: Array<{ sound: ZombieSoundId; x: number; entityId?: number; volume?: number }>;
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
  upgradeAfterClear: boolean;
  waveClearTimer: number;
  gameOverTimer: number;
  elapsed: number;
  cameraTrauma: number;
  cameraZoom: number;
  cameraPhase: number;
  cameraFocusX: number;
  cameraFocusY: number;
  screenFlash: number;
  hitStop: number;
  nextProjectileId: number;
  nextPickupId: number;
  killsSinceDrop: number;
  waveSpawnCount: number;
};

type Hud = {
  health: number;
  maxHealth: number;
  score: number;
  wave: number;
  combo: number;
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

type ArenaLayers = {
  far: HTMLCanvasElement;
  near: HTMLCanvasElement;
  street: HTMLCanvasElement;
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
  thug: { hp: 55, speed: 92, damage: 10, radius: 24, cost: 1, score: 100, unlock: 1, windup: 0.28, active: 0.08, recovery: 0.48, attackRange: 72, lunge: 75, mass: 1, color: "#e77d5a" },
  runner: { hp: 36, speed: 150, damage: 8, radius: 20, cost: 1.4, score: 135, unlock: 2, windup: 0.18, active: 0.07, recovery: 0.38, attackRange: 70, lunge: 175, mass: 0.75, color: "#f6c453" },
  brute: { hp: 160, speed: 62, damage: 22, radius: 34, cost: 3.5, score: 340, unlock: 4, windup: 0.75, active: 0.14, recovery: 0.75, attackRange: 106, lunge: 42, mass: 1.8, color: "#d14f73" },
  thrower: { hp: 65, speed: 78, damage: 9, radius: 23, cost: 2.4, score: 235, unlock: 6, windup: 0.55, active: 0.04, recovery: 0.7, attackRange: 430, lunge: 0, mass: 0.95, color: "#9b82ff" },
  walker: { hp: 110, speed: 72, damage: 15, radius: 27, cost: 2.2, score: 260, unlock: 8, windup: 0.48, active: 0.12, recovery: 0.6, attackRange: 80, lunge: 58, mass: 1.25, color: "#8fd36b" },
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

const BACKGROUND_MARGIN = 64;
const BACKGROUND_W = WORLD_W + BACKGROUND_MARGIN * 2;
const MAX_EFFECTS = 96;
const FRAME_INTERVAL = 1000 / 60;

const UPGRADES: Upgrade[] = [
  { id: "hands", name: "Heavy Hands", description: "+15% strike damage", apply: (p) => { p.damageMult += 0.15; } },
  { id: "stitch", name: "Hard Stitch", description: "+20 max health and heal 20", apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: "feet", name: "Quick Feet", description: "+10% movement speed", apply: (p) => { p.speedMult += 0.1; } },
  { id: "thread", name: "Fast Thread", description: "Pant ability recharges 12% faster", apply: (p) => { p.cooldownMult = Math.max(0.58, p.cooldownMult - 0.12); } },
  { id: "reach", name: "Long Reach", description: "+12% attack reach", apply: (p) => { p.rangeMult += 0.12; } },
  { id: "wind", name: "Second Wind", description: "+5 health after every wave", apply: (p) => { p.waveHeal += 5; } },
];

function pickUpgradeChoices(player: Player) {
  const pool = UPGRADES.filter((upgrade) => upgrade.id !== "thread" || player.cooldownMult > 0.581);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, 3);
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const distanceSquared = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
const budgetForWave = (wave: number) => {
  const base = Math.min(80, 5 + wave * 1.55 + Math.floor(wave / 5) * 2.5);
  return base * (wave % 5 === 0 ? 1.18 : 1);
};
const COLORS = {
  paper: "#f4f0e8",
  skin: "#cfa17c",
  shirt: "#171d2a",
  hitFlash: "#fff6d8",
  impact: "#ffb224",
  muzzle: "#fff1a8",
  bullet: "#ffe28a",
  enemyBullet: "#ff5a73",
  toxic: "#8fd36b",
  danger: "#ff4d67",
  score: "#d8ff3e",
  elite: "#ffd166",
};

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createArenaLayers(images: Record<string, HTMLImageElement>): ArenaLayers {
  const far = createCanvas(BACKGROUND_W, WORLD_H);
  const near = createCanvas(BACKGROUND_W, WORLD_H);
  const street = createCanvas(WORLD_W, WORLD_H);
  const farCtx = far.getContext("2d");
  const nearCtx = near.getContext("2d");
  const streetCtx = street.getContext("2d");
  if (!farCtx || !nearCtx || !streetCtx) return { far, near, street };

  farCtx.imageSmoothingEnabled = false;
  nearCtx.imageSmoothingEnabled = false;
  farCtx.fillStyle = "#07101d";
  farCtx.fillRect(0, 0, BACKGROUND_W, WORLD_H);
  const premiumCity = images["city-premium"];
  if (premiumCity) {
    farCtx.save();
    farCtx.filter = "saturate(1.05) contrast(1.04) brightness(.82)";
    farCtx.drawImage(premiumCity, 0, 0, BACKGROUND_W, WORLD_H);
    farCtx.restore();
  } else {
    CITY_LAYERS.forEach((_, index) => {
      const image = images[`city-${index}`];
      if (!image) return;
      const target = index < 6 ? farCtx : nearCtx;
      target.save();
      target.filter = `sepia(.4) saturate(2.1) hue-rotate(${160 + index * 2}deg) brightness(${index < 5 ? .56 : .68}) contrast(1.22)`;
      target.globalAlpha = index === 0 ? 0.92 : 0.86;
      target.drawImage(image, BACKGROUND_MARGIN - 55, 20, WORLD_W + 110, 500);
      target.restore();
    });
  }

  const industrial = images.industrial;
  if (industrial) {
    nearCtx.save();
    nearCtx.globalAlpha = premiumCity ? 0.34 : 0.62;
    nearCtx.filter = "sepia(.48) saturate(2.1) hue-rotate(150deg) brightness(.72) contrast(1.35)";
    nearCtx.drawImage(industrial, 128, 64, 64, 48, BACKGROUND_MARGIN + 72, 254, 160, 120);
    nearCtx.drawImage(industrial, 192, 144, 96, 48, BACKGROUND_MARGIN + 958, 286, 240, 120);
    nearCtx.restore();
  }

  const haze = streetCtx.createLinearGradient(0, 250, 0, 500);
  haze.addColorStop(0, "rgba(38,58,84,0)");
  haze.addColorStop(.5, "rgba(38,58,84,.18)");
  haze.addColorStop(1, "rgba(38,58,84,0)");
  streetCtx.fillStyle = haze;
  streetCtx.fillRect(0, 250, WORLD_W, 250);

  const streetGradient = streetCtx.createLinearGradient(0, 420, 0, WORLD_H);
  streetGradient.addColorStop(0, "rgba(10,16,26,.08)");
  streetGradient.addColorStop(1, "rgba(8,12,19,.82)");
  streetCtx.fillStyle = streetGradient;
  streetCtx.fillRect(0, 410, WORLD_W, WORLD_H - 410);
  streetCtx.strokeStyle = "rgba(99,216,255,.045)";
  streetCtx.lineWidth = 2;
  for (let y = 470; y < 700; y += 86) {
    streetCtx.beginPath();
    streetCtx.moveTo(0, y);
    streetCtx.lineTo(WORLD_W, y);
    streetCtx.stroke();
  }
  for (let x = -100; x < WORLD_W + 100; x += 160) {
    streetCtx.beginPath();
    streetCtx.moveTo(x, 720);
    streetCtx.lineTo(x + 120, 410);
    streetCtx.stroke();
  }
  for (const puddle of [{ x: 170, y: 568, w: 230 }, { x: 720, y: 620, w: 300 }, { x: 1030, y: 520, w: 170 }]) {
    streetCtx.fillStyle = "rgba(48,91,118,.1)";
    streetCtx.strokeStyle = "rgba(99,216,255,.14)";
    streetCtx.beginPath();
    streetCtx.ellipse(puddle.x, puddle.y, puddle.w / 2, 10, -.04, 0, Math.PI * 2);
    streetCtx.fill();
    streetCtx.stroke();
  }
  return { far, near, street };
}

function hudMatches(a: Hud, b: Hud) {
  return a.health === b.health
    && a.maxHealth === b.maxHealth
    && a.score === b.score
    && a.wave === b.wave
    && a.combo === b.combo
    && a.abilityCd === b.abilityCd
    && a.dashCd === b.dashCd
    && a.enemies === b.enemies
    && a.weapon === b.weapon
    && a.ammo === b.ammo
    && a.reserve === b.reserve
    && a.durability === b.durability
    && a.reloading === b.reloading
    && a.nearWeapon === b.nearWeapon;
}

const INITIAL_HUD: Hud = {
  health: 100,
  maxHealth: 100,
  score: 0,
  wave: 1,
  combo: 0,
  abilityCd: 0,
  dashCd: 0,
  enemies: 0,
  weapon: "fists",
  ammo: 0,
  reserve: 0,
  durability: 0,
  reloading: false,
  nearWeapon: null,
};

function makeWeapon(kind: WeaponKind): HeldWeapon {
  const definition = WEAPONS[kind];
  return {
    kind,
    ammo: definition.firearm ? definition.magazine : 0,
    reserve: definition.firearm ? definition.pickupReserve : 0,
    durability: definition.maxDurability,
  };
}

function segmentPointDistanceSquared(
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
  return distanceSquared(ax + abx * t, ay + aby * t, px, py);
}

function nearestLivingEnemy(state: GameState, range: number) {
  const player = state.player;
  const rangeSquared = range * range;
  let nearest: Enemy | undefined;
  let nearestScore = Number.POSITIVE_INFINITY;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const squared = distanceSquared(player.x, player.y, enemy.x, enemy.y);
    if (squared > rangeSquared) continue;
    const behindPenalty = (enemy.x - player.x) * player.facing < -10 ? 22500 : 0;
    const score = squared + behindPenalty;
    if (score < nearestScore) {
      nearest = enemy;
      nearestScore = score;
    }
  }
  return nearest;
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
      attackHeld: false,
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
      slowTimer: 0,
      aimAngle: 0,
      weapon: makeWeapon("fists"),
      nearPickupId: null,
    },
    enemies: [],
    projectiles: [],
    pickups: [
      { id: 1, x: 710, y: 505, weapon: makeWeapon("bat"), life: 999, bob: 0, pickupLock: 0 },
    ],
    effects: [],
    audioEvents: [],
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
    upgradeAfterClear: false,
    waveClearTimer: 0,
    gameOverTimer: 0,
    elapsed: 0,
    cameraTrauma: 0,
    cameraZoom: 0,
    cameraPhase: 0,
    cameraFocusX: WORLD_W / 2,
    cameraFocusY: WORLD_H / 2,
    screenFlash: 0,
    hitStop: 0,
    nextProjectileId: 1,
    nextPickupId: 2,
    killsSinceDrop: 0,
    waveSpawnCount: 0,
  };
}

function addEffect(state: GameState, effect: Omit<Effect, "maxLife">) {
  if (state.effects.length >= MAX_EFFECTS) state.effects.splice(0, state.effects.length - MAX_EFFECTS + 1);
  state.effects.push({ ...effect, maxLife: effect.life });
}

function tickEffects(state: GameState, dt: number) {
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter((effect) => effect.life > 0);
}

function emitZombieSound(state: GameState, sound: ZombieSoundId, x: number, entityId?: number, volume?: number) {
  if (state.audioEvents.length >= 24) return;
  state.audioEvents.push({ sound, x, entityId, volume });
}

function spawnEnemy(state: GameState) {
  const unlocked = (Object.keys(ENEMIES) as EnemyKind[]).filter((kind) => {
    const def = ENEMIES[kind];
    return def.unlock <= state.wave && def.cost <= state.remainingBudget + 0.3;
  });
  const forceWaveEightHorde = state.wave === 8 && state.waveSpawnCount < 4;
  const kind: EnemyKind = forceWaveEightHorde ? "walker" : unlocked[Math.floor(Math.random() * unlocked.length)] ?? "thug";
  const def = ENEMIES[kind];
  const side = Math.random() > 0.5 ? 1 : -1;
  const elite = state.wave >= 5 && Math.random() < Math.min(0.36, 0.035 * Math.floor(state.wave / 5));
  const healthScale = 1 + 0.075 * (state.wave - 1) + 0.0015 * Math.pow(state.wave - 1, 1.55);
  const hp = Math.round(def.hp * healthScale * (elite ? 1.8 : 1));
  const enemyId = state.nextEnemyId++;
  const spawnX = side < 0 ? ARENA.left - 30 : ARENA.right + 30;
  const spawnY = ARENA.top + 70 + Math.random() * (ARENA.bottom - ARENA.top - 70);
  state.enemies.push({
    id: enemyId,
    kind,
    x: spawnX,
    y: spawnY,
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
    attackX: side < 0 ? 1 : -1,
    attackY: 0,
    attackFacing: side < 0 ? 1 : -1,
    animTime: Math.random() * Math.PI * 2,
    hitFlash: 0,
    deathTimer: 0,
    zombieVariant: kind === "walker" && (elite || Math.random() < 0.22) ? 1 : 0,
  });
  if (kind === "walker") emitZombieSound(state, "spawn", spawnX, enemyId, elite ? 0.62 : 0.44);
  state.waveSpawnCount += 1;
  state.remainingBudget -= def.cost;
}

function damagePlayer(state: GameState, amount: number, source?: Enemy) {
  const player = state.player;
  if (player.invuln > 0 || state.gameOverTimer > 0) return;
  const guarded = state.pantId === "guard" && player.abilityTimer > 0;
  const dealt = amount * (guarded ? 0.35 : 1);
  player.hp = Math.max(0, player.hp - dealt);
  player.invuln = 0.55;
  state.combo = 0;
  state.comboTimer = 0;
  state.cameraTrauma = Math.max(state.cameraTrauma, guarded ? 0.22 : 0.58);
  state.cameraZoom = Math.max(state.cameraZoom, guarded ? 0.01 : 0.028);
  state.cameraFocusX = player.x;
  state.cameraFocusY = player.y - 40;
  state.hitStop = Math.max(state.hitStop, guarded ? 0.025 : 0.06);
  player.hitFlash = 0.16;
  const defeated = player.hp <= 0;
  player.action = defeated ? "dead" : "hurt";
  player.actionTime = 0;
  player.actionDuration = defeated ? 0.78 : guarded ? 0.09 : 0.2;
  if (defeated) {
    state.gameOverTimer = 0.78;
    player.invuln = 999;
  }
  player.attackSpec = null;
  player.attackResolved = false;
  if (source?.kind === "walker") {
    player.slowTimer = Math.max(player.slowTimer, 1.35);
    addEffect(state, { x: player.x, y: player.y - 82, life: 0.7, color: COLORS.toxic, text: "INFECTED", kind: "text" });
  }
  if (source) {
    const awayX = player.x - source.x;
    const awayY = player.y - source.y;
    const awayLength = Math.hypot(awayX, awayY) || 1;
    player.vx += (awayX / awayLength) * (guarded ? 90 : 240);
    player.vy += (awayY / awayLength) * (guarded ? 70 : 170);
  }
  addEffect(state, { x: player.x, y: player.y - 50, life: 0.55, color: COLORS.danger, text: `-${Math.ceil(dealt)}`, kind: "text" });
  addEffect(state, { x: player.x, y: player.y - 48, life: 0.24, color: COLORS.danger, radius: defeated ? 58 : 34, strength: defeated ? 1.4 : 1, seed: state.kills + state.wave, kind: "burst" });
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

function dropWeaponAt(state: GameState, x: number, y: number, weapon: HeldWeapon, pickupLock = 0) {
  if (weapon.kind === "fists") return;
  state.pickups.push({ id: state.nextPickupId++, x, y, weapon: { ...weapon }, life: 20, bob: Math.random() * Math.PI * 2, pickupLock });
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
  enemy.stateDuration = enemy.kind === "walker" ? 1.05 : 0.88;
  enemy.deathTimer = enemy.stateDuration;
  if (enemy.kind === "walker") emitZombieSound(state, "death", enemy.x, enemy.id, enemy.elite ? 0.72 : 0.58);
  state.kills += 1;
  state.combo += 1;
  state.comboTimer = 2.5;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const base = ENEMIES[enemy.kind].score * (enemy.elite ? 1.6 : 1);
  const comboMult = Math.min(3, 1 + Math.floor(state.combo / 3) * 0.1);
  const points = Math.round(base * (1 + 0.03 * (state.wave - 1)) * comboMult);
  state.score += points;
  state.hitStop = Math.max(state.hitStop, 0.085);
  state.cameraTrauma = Math.max(state.cameraTrauma, enemy.elite ? 0.7 : 0.34);
  state.cameraZoom = Math.max(state.cameraZoom, enemy.elite ? 0.038 : 0.018);
  state.cameraFocusX = enemy.x;
  state.cameraFocusY = enemy.y - 42;
  rollWeaponDrop(state, enemy);
  addEffect(state, { x: enemy.x, y: enemy.y - 75, life: 0.8, color: COLORS.score, text: `+${points}`, kind: "text" });
  addEffect(state, { x: enemy.x, y: enemy.y - 44, life: 0.34, color: enemy.kind === "walker" ? COLORS.toxic : COLORS.impact, radius: enemy.radius * 1.45, strength: enemy.elite ? 1.6 : 1, seed: enemy.id, kind: "burst" });
  addEffect(state, { x: enemy.x, y: enemy.y + 2, life: 0.42, color: enemy.kind === "walker" ? COLORS.toxic : "#7c8798", radius: enemy.radius * 1.3, strength: 1, seed: enemy.id * 7, kind: "dust" });
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
  if (enemy.kind === "walker" && enemy.hp > 0) emitZombieSound(state, "hurt", enemy.x, enemy.id);
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
  state.cameraTrauma = Math.max(state.cameraTrauma, Math.min(0.36, 0.1 + knockback / 1800));
  state.cameraZoom = Math.max(state.cameraZoom, Math.min(0.02, hitStop * 0.25));
  state.cameraFocusX = enemy.x;
  state.cameraFocusY = enemy.y - 45;
  addEffect(state, { x: enemy.x, y: enemy.y - 45, life: 0.2, color: enemy.kind === "walker" ? COLORS.toxic : COLORS.impact, radius: 20, angle: Math.atan2(enemy.y - sourceY, enemy.x - sourceX), strength: 1, seed: enemy.id + state.kills, kind: "burst" });
  if (enemy.hp <= 0) defeatEnemy(state, enemy);
  return true;
}

function triggerAbility(state: GameState) {
  const player = state.player;
  if (player.abilityCd > 0) return;
  const pant = getPant(state.pantId);
  const pantColor = pant.color;
  const chainTargets = state.pantId === "chain"
    ? state.enemies
      .filter((enemy) => !enemy.dead && distanceSquared(player.x, player.y, enemy.x, enemy.y) < 360 * 360)
      .sort((a, b) => distanceSquared(player.x, player.y, a.x, a.y) - distanceSquared(player.x, player.y, b.x, b.y))
      .slice(0, 5)
    : [];
  if (state.pantId === "chain" && chainTargets.length === 0) {
    addEffect(state, { x: player.x, y: player.y - 80, life: 0.55, color: pantColor, text: "NO TARGET", kind: "text" });
    return;
  }
  player.abilityCd = pant.cooldown * player.cooldownMult;
  if (state.pantId === "ghost") {
    player.abilityTimer = 2.25;
    player.invuln = Math.max(player.invuln, 2.25);
    player.ghostPrimed = true;
    addEffect(state, { x: player.x, y: player.y, life: 0.8, color: pantColor, radius: 90, kind: "ring" });
  } else if (state.pantId === "chain") {
    chainTargets.forEach((enemy, index) => {
      hitEnemy(state, enemy, 48 * player.damageMult, 0.9, 80);
      addEffect(state, { x: enemy.x, y: enemy.y - 35, life: 0.35 + index * 0.05, color: pantColor, radius: 34, kind: "bolt" });
    });
    addEffect(state, { x: player.x, y: player.y - 40, life: 0.5, color: pantColor, radius: 260, kind: "ring" });
  } else if (state.pantId === "guard") {
    player.abilityTimer = 4;
    state.enemies.forEach((enemy) => {
      if (!enemy.dead && distance(player.x, player.y, enemy.x, enemy.y) < 190) {
        hitEnemy(state, enemy, 28 * player.damageMult, 0.55, 520);
      }
    });
    addEffect(state, { x: player.x, y: player.y, life: 0.7, color: pantColor, radius: 190, kind: "ring" });
  } else {
    player.abilityTimer = 5;
    addEffect(state, { x: player.x, y: player.y, life: 0.8, color: pantColor, radius: 120, kind: "ring" });
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
    addEffect(state, { x: player.x + Math.cos(player.aimAngle) * 52, y: player.y - 57 + Math.sin(player.aimAngle) * 20, life: 0.1, color: COLORS.muzzle, radius: player.weapon.kind === "shotgun" ? 30 : 17, angle: player.aimAngle, strength: player.weapon.kind === "shotgun" ? 1.5 : 1, kind: "muzzle" });
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
  addEffect(state, { x: player.x + forwardX * range * 0.52, y: player.y - 48 + forwardY * range * 0.34, life: 0.18, color: getPant(state.pantId).color, radius: range * 0.56, angle: player.aimAngle, strength: player.weapon.kind === "bat" ? 1.35 : player.weapon.kind === "knife" ? 0.82 : 1, kind: "slash" });
  if (ghostHit && targets.length) {
    player.ghostPrimed = false;
    player.abilityTimer = 0;
  }
  if (player.weapon.kind !== "fists" && targets.length > 0) {
    player.weapon.durability -= 1;
    if (player.weapon.durability <= 0) {
      addEffect(state, { x: player.x, y: player.y - 90, life: 0.8, color: COLORS.danger, text: "WEAPON BROKE", kind: "text" });
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
  addEffect(state, { x: player.x, y: player.y + 4, life: 0.32, color: getPant(state.pantId).color, radius: 32, angle: Math.atan2(player.dashY, player.dashX), strength: 1, seed: state.wave + state.kills, kind: "dust" });
}

function swapWeapon(state: GameState) {
  const player = state.player;
  const pickupIndex = state.pickups.findIndex((pickup) => pickup.id === player.nearPickupId);
  if (pickupIndex < 0) {
    if (player.weapon.kind !== "fists") {
      dropWeaponAt(state, player.x - player.facing * 72, player.y, player.weapon, 0.45);
      player.weapon = makeWeapon("fists");
      player.comboStep = 0;
    }
    return;
  }
  const pickup = state.pickups[pickupIndex];
  if (pickup.weapon.kind === player.weapon.kind) {
    const definition = WEAPONS[player.weapon.kind];
    if (definition.firearm) player.weapon.reserve = Math.min(definition.magazine * 4, player.weapon.reserve + pickup.weapon.ammo + pickup.weapon.reserve);
    else player.weapon.durability = Math.min(definition.maxDurability, player.weapon.durability + pickup.weapon.durability);
    state.pickups.splice(pickupIndex, 1);
    return;
  }
  const previous = player.weapon;
  player.weapon = { ...pickup.weapon };
  state.pickups.splice(pickupIndex, 1);
  dropWeaponAt(state, player.x - player.facing * 72, player.y + 4, previous, 0.45);
  player.comboStep = 0;
  player.comboWindow = 0;
}

function updateGame(
  state: GameState,
  dt: number,
  keys: Set<string>,
  actions: { dx: number; dy: number; attack: boolean; attackQueued: boolean; dash: boolean; ability: boolean; swap: boolean; reload: boolean },
) {
  const player = state.player;
  state.elapsed += dt;
  state.cameraPhase += dt * 52;
  state.cameraTrauma = Math.max(0, state.cameraTrauma - dt * 1.7);
  state.cameraZoom = Math.max(0, state.cameraZoom - dt * 0.1);
  state.screenFlash = Math.max(0, state.screenFlash - dt * 1.5);
  if (state.gameOverTimer > 0) {
    state.gameOverTimer = Math.max(0, state.gameOverTimer - dt);
    player.actionTime = Math.min(player.actionDuration, player.actionTime + dt);
    tickEffects(state, dt);
    return;
  }
  if (state.hitStop > 0) {
    state.hitStop = Math.max(0, state.hitStop - dt);
    return;
  }
  if (state.waveClearTimer > 0) {
    const previousClearTimer = state.waveClearTimer;
    state.waveClearTimer = Math.max(0, state.waveClearTimer - dt);
    if (previousClearTimer > 0 && state.waveClearTimer === 0 && state.upgradeAfterClear) {
      state.pendingUpgrade = true;
      state.upgradeAfterClear = false;
    }
  }
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.abilityCd = Math.max(0, player.abilityCd - dt);
  const abilityWasActive = player.abilityTimer > 0;
  player.abilityTimer = Math.max(0, player.abilityTimer - dt);
  if (state.pantId === "ghost" && abilityWasActive && player.abilityTimer === 0) player.ghostPrimed = false;
  player.invuln = Math.max(0, player.invuln - dt);
  player.slowTimer = Math.max(0, player.slowTimer - dt);
  player.comboWindow = Math.max(0, player.comboWindow - dt);
  player.attackBuffer = Math.max(0, player.attackBuffer - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  player.recoil = Math.max(0, player.recoil - dt * 8);
  const surgeActive = state.pantId === "surge" && player.abilityTimer > 0;
  if (!surgeActive) state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer === 0) state.combo = 0;

  let mx = actions.dx + (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  let my = actions.dy + (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  let moveLength = Math.hypot(mx, my);
  if (moveLength > 1) { mx /= moveLength; my /= moveLength; }
  moveLength = Math.min(1, moveLength);
  player.moveAmount += (moveLength - player.moveAmount) * Math.min(1, dt * 14);
  player.animTime += dt * (3.5 + player.moveAmount * 8);
  if (Math.abs(mx) > 0.05) player.facing = mx > 0 ? 1 : -1;

  let nearestPickup: WeaponPickup | undefined;
  let nearestPickupDistance = 88 * 88;
  for (const pickup of state.pickups) {
    if (pickup.pickupLock > 0) continue;
    const squared = distanceSquared(player.x, player.y, pickup.x, pickup.y);
    if (squared < nearestPickupDistance) {
      nearestPickup = pickup;
      nearestPickupDistance = squared;
    }
  }
  player.nearPickupId = nearestPickup?.id ?? null;
  if (nearestPickup && nearestPickup.life > 900 && player.weapon.kind === "fists" && nearestPickupDistance < 36 * 36) swapWeapon(state);

  if (actions.swap && player.action === "idle") swapWeapon(state);
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
      addEffect(state, { x: player.x - player.dashX * 28, y: player.y, life: 0.22, color: getPant(state.pantId).color, radius: 42, kind: "trail" });
    }
    if (player.actionTime >= player.actionDuration) {
      player.action = "idle";
      player.dashTimer = 0;
    }
  } else {
    const ghostSpeed = state.pantId === "ghost" && player.abilityTimer > 0 ? 1.35 : 1;
    const infectionSlow = player.slowTimer > 0 ? 0.72 : 1;
    const controlScale = player.action === "attack" ? 0.46 : player.action === "reload" ? 0.65 : player.action === "hurt" ? 0.18 : 1;
    player.x += mx * player.speed * player.speedMult * ghostSpeed * infectionSlow * controlScale * dt;
    player.y += my * player.speed * player.speedMult * ghostSpeed * infectionSlow * controlScale * 0.72 * dt;
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
  const attackPressed = actions.attackQueued || (attackHeld && !player.attackHeld);
  actions.attackQueued = false;
  player.attackHeld = attackHeld;
  if (attackPressed && player.action !== "idle" && player.action !== "dash" && player.action !== "hurt") player.attackBuffer = 0.16;
  if (player.action === "idle" && (attackPressed || player.attackBuffer > 0)) beginAttack(state);

  if (state.introTimer > 0 && state.waveClearTimer <= 0) state.introTimer = Math.max(0, state.introTimer - dt);
  const maxAlive = Math.min(18, 5 + Math.floor(state.wave / 2));
  let livingCount = 0;
  let attackingEnemies = 0;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    livingCount += 1;
    if (enemy.state === "windup" || enemy.state === "active") attackingEnemies += 1;
  }
  state.spawnTimer -= dt;
  if (state.introTimer <= 0 && state.remainingBudget > 0.15 && state.spawnTimer <= 0 && livingCount < maxAlive) {
    spawnEnemy(state);
    state.spawnTimer = Math.max(0.36, 1.2 - 0.035 * (state.wave - 1));
  }

  const attackLimit = Math.min(5, 1 + Math.floor((state.wave + 1) / 4));
  const aggression = Math.max(0.68, 1 - (state.wave - 1) * 0.009);
  for (const enemy of state.enemies) {
    const definition = ENEMIES[enemy.kind];
    const locomotionState = enemy.state === "chase" || enemy.state === "enter";
    enemy.animTime += dt * (locomotionState ? clamp(enemy.speed / 13, 4.5, 12) : 3);
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
    if (enemy.state === "enter" || enemy.state === "chase" || enemy.state === "recover") enemy.facing = dx >= 0 ? 1 : -1;

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
      const activeStartX = enemy.x;
      const activeStartY = enemy.y;
      if (definition.lunge > 0) {
        enemy.x += enemy.attackX * (definition.lunge * 0.55 / Math.max(0.04, definition.active)) * dt;
        enemy.y += enemy.attackY * (definition.lunge * 0.42 / Math.max(0.04, definition.active)) * dt;
      }
      if (!enemy.attackResolved) {
        enemy.attackResolved = true;
        if (enemy.kind === "thrower") {
          const shotX = enemy.x;
          const shotY = enemy.y - 46;
          state.projectiles.push({ id: state.nextProjectileId++, owner: "enemy", kind: "thrown", x: shotX, y: shotY, prevX: shotX, prevY: shotY, vx: enemy.attackX * 390, vy: enemy.attackY * 390, damage: enemy.damage, knockback: 110, life: 2.2, radius: 9, penetration: 0 });
        } else {
          const strikeX = enemy.x + enemy.attackX * definition.attackRange * 0.86;
          const strikeY = enemy.y + enemy.attackY * definition.attackRange * 0.72;
          const hitRadius = 28 + enemy.radius * 0.42;
          if (segmentPointDistanceSquared(activeStartX, activeStartY, strikeX, strikeY, player.x, player.y) < hitRadius * hitRadius) {
          damagePlayer(state, enemy.damage, enemy);
          }
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
          const throwX = player.x - enemy.x;
          const throwY = (player.y - 44) - (enemy.y - 46);
          const throwLength = Math.hypot(throwX, throwY) || 1;
          enemy.attackX = throwX / throwLength;
          enemy.attackY = throwY / throwLength;
          enemy.attackFacing = dx >= 0 ? 1 : -1;
          enemy.facing = enemy.attackFacing;
          enemy.attackCd = 1.75 * aggression;
          attackingEnemies += 1;
        }
      } else {
        const attackRange = enemy.radius + definition.attackRange;
        const nearbyWalkers = enemy.kind === "walker"
          ? state.enemies.reduce((count, other) => count + (!other.dead && other.id !== enemy.id && other.kind === "walker" && distanceSquared(enemy.x, enemy.y, other.x, other.y) < 180 * 180 ? 1 : 0), 0)
          : 0;
        const packSpeed = enemy.kind === "walker" ? Math.min(1.42, 1.1 + nearbyWalkers * 0.08) : 1;
        if (length > attackRange) {
          enemy.x += (dx / length) * enemy.speed * packSpeed * dt;
          enemy.y += (dy / length) * enemy.speed * packSpeed * 0.72 * dt;
        } else if (enemy.attackCd <= 0 && attackingEnemies < attackLimit) {
          enemy.state = "windup";
          enemy.stateTimer = 0;
          enemy.stateDuration = definition.windup * Math.max(0.78, 1 - state.wave * 0.006);
          enemy.windup = enemy.stateDuration;
          enemy.attackX = dx / length;
          enemy.attackY = dy / length;
          enemy.attackFacing = dx >= 0 ? 1 : -1;
          enemy.facing = enemy.attackFacing;
          if (enemy.kind === "walker") emitZombieSound(state, "attack", enemy.x, enemy.id);
          enemy.attackCd = (enemy.kind === "brute" ? 1.65 : 1.05) * aggression;
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
      const minimumDistance = (first.radius + second.radius) * 0.66;
      const squared = dx * dx + dy * dy;
      if (squared >= minimumDistance * minimumDistance) continue;
      const length = Math.sqrt(squared) || 1;
      const overlap = minimumDistance - length;
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
      const hitRadius = 30 + projectile.radius;
      if (segmentPointDistanceSquared(projectile.prevX, projectile.prevY, projectile.x, projectile.y, player.x, player.y - 44) < hitRadius * hitRadius) {
        damagePlayer(state, projectile.damage);
        projectile.life = 0;
      }
    } else {
      for (const enemy of solidEnemies) {
        const hitRadius = enemy.radius * 0.72 + projectile.radius;
        if (segmentPointDistanceSquared(projectile.prevX, projectile.prevY, projectile.x, projectile.y, enemy.x, enemy.y - 48) < hitRadius * hitRadius) {
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
    pickup.pickupLock = Math.max(0, pickup.pickupLock - dt);
  }
  state.pickups = state.pickups.filter((pickup) => pickup.life > 0);
  tickEffects(state, dt);

  if (state.remainingBudget <= 0.15 && !state.enemies.some((enemy) => !enemy.dead) && state.introTimer <= 0) {
    const clearedWave = state.wave;
    state.score += 200 + 50 * clearedWave;
    player.hp = Math.min(player.maxHp, player.hp + player.waveHeal);
    state.projectiles = [];
    state.wave += 1;
    state.remainingBudget = budgetForWave(state.wave);
    state.waveSpawnCount = 0;
    state.spawnTimer = 0.8;
    state.introTimer = 1.9;
    state.waveClearTimer = 0.88;
    state.upgradeAfterClear = clearedWave % 3 === 0;
    state.cameraTrauma = Math.max(state.cameraTrauma, 0.22);
    state.cameraZoom = Math.max(state.cameraZoom, 0.014);
    state.cameraFocusX = WORLD_W / 2;
    state.cameraFocusY = 380;
    if (state.wave === 8) state.screenFlash = 0.72;
    addEffect(state, { x: WORLD_W / 2, y: 360, life: 1.4, color: COLORS.score, text: `WAVE ${clearedWave} CLEARED`, kind: "text" });
  }
}

function drawHeldWeapon(ctx: CanvasRenderingContext2D, kind: WeaponKind, x: number, y: number, rotation: number, recoil = 0) {
  ctx.save();
  ctx.translate(x - recoil * 8, y);
  ctx.rotate(rotation);
  ctx.lineCap = "square";
  if (kind === "bat") {
    ctx.strokeStyle = "#b56f3a";
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(58, 0); ctx.stroke();
    ctx.fillStyle = "#292d36"; ctx.fillRect(-15, -4, 18, 8);
  } else if (kind === "knife") {
    ctx.fillStyle = "#3a2638"; ctx.fillRect(-11, -4, 17, 8);
    ctx.fillStyle = "#d7e3ea"; ctx.beginPath(); ctx.moveTo(5, -7); ctx.lineTo(42, 0); ctx.lineTo(5, 7); ctx.closePath(); ctx.fill();
  } else if (kind === "pistol") {
    ctx.fillStyle = "#586574";
    ctx.fillRect(-7, -7, 35, 13); ctx.fillRect(5, 5, 10, 18);
    ctx.fillStyle = "#91a0b3"; ctx.fillRect(-3, -5, 24, 3);
  } else if (kind === "shotgun") {
    ctx.fillStyle = "#617082"; ctx.fillRect(-12, -6, 78, 11);
    ctx.fillStyle = "#8f5a3c"; ctx.fillRect(-6, 5, 28, 9); ctx.fillRect(29, 5, 24, 7);
  } else {
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath(); ctx.arc(4, 0, 8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFighter(ctx: CanvasRenderingContext2D, state: GameState, images: Record<string, HTMLImageElement>, reducedMotion: boolean) {
  const player = state.player;
  const movingPose = player.action === "idle" || player.action === "dash";
  const stride = reducedMotion || !movingPose ? 0 : Math.sin(player.animTime) * 10 * player.moveAmount * (player.action === "dash" ? 0 : 1);
  const bob = reducedMotion || !movingPose ? 0 : Math.abs(Math.sin(player.animTime)) * -3 * player.moveAmount;
  let strike = 0;
  if (player.action === "attack" && player.attackSpec) {
    const spec = player.attackSpec;
    if (player.actionTime < spec.startup) {
      const t = clamp(player.actionTime / Math.max(0.01, spec.startup), 0, 1);
      strike = -0.65 * (1 - Math.pow(1 - t, 3));
    } else if (player.actionTime < spec.startup + spec.active) {
      const t = clamp((player.actionTime - spec.startup) / Math.max(0.01, spec.active), 0, 1);
      strike = -0.65 + 1.65 * (1 - Math.pow(1 - t, 4));
    } else {
      const t = clamp((player.actionTime - spec.startup - spec.active) / Math.max(0.01, spec.recovery), 0, 1);
      strike = Math.pow(1 - t, 2);
    }
  }
  if (player.action === "dash" && !reducedMotion) {
    for (let echo = 3; echo >= 1; echo -= 1) {
      ctx.save();
      ctx.globalAlpha = 0.08 * (4 - echo);
      ctx.fillStyle = getPant(state.pantId).color;
      ctx.translate(player.x - player.dashX * echo * 30, player.y - player.dashY * echo * 22);
      ctx.beginPath(); ctx.ellipse(0, -42, 28, 61, -player.dashY * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.translate(player.x, player.y + bob);
  ctx.scale(player.facing, 1);
  const hurtProgress = player.action === "hurt" ? clamp(player.actionTime / Math.max(.01, player.actionDuration), 0, 1) : 0;
  const deadProgress = player.action === "dead" ? clamp(player.actionTime / Math.max(.01, player.actionDuration), 0, 1) : 0;
  const hurtLean = player.action === "hurt" ? -0.25 * Math.sin(hurtProgress * Math.PI) : 0;
  const dashLean = player.action === "dash" ? -0.16 : 0;
  const deadLean = player.action === "dead" ? deadProgress * 1.45 : 0;
  const attackLean = player.action === "attack" ? strike * .1 : 0;
  ctx.rotate(hurtLean + dashLean + deadLean + attackLean);
  if (player.action === "dead") ctx.globalAlpha = 1 - clamp((deadProgress - .78) / .22, 0, .42);
  if (state.pantId === "ghost" && player.abilityTimer > 0) ctx.globalAlpha = 0.42;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.beginPath(); ctx.ellipse(0, 7, player.action === "dash" ? 55 : 43, player.action === "dash" ? 8 : 13, 0, 0, Math.PI * 2); ctx.fill();

  const legLift = player.action === "dash" ? -9 : player.action === "attack" ? -Math.max(0, strike) * 3 : 0;
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 12; ctx.lineCap = "square";
  ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(-17 - stride * 0.45, 18 + legLift); ctx.moveTo(12, -12); ctx.lineTo(17 + stride * 0.45, 18 - legLift); ctx.stroke();
  ctx.fillStyle = "#050505"; ctx.fillRect(-33 - stride * 0.45, 16 + legLift, 30, 10); ctx.fillRect(5 + stride * 0.45, 16 - legLift, 31, 10);

  ctx.fillStyle = player.hitFlash > 0 ? COLORS.hitFlash : COLORS.shirt;
  ctx.beginPath(); ctx.moveTo(-19, -89); ctx.lineTo(19, -89); ctx.lineTo(25, -47); ctx.lineTo(-24, -47); ctx.closePath(); ctx.fill();
  const image = images[state.pantId];
  if (image) {
    ctx.save(); ctx.filter = "saturate(.95) contrast(1.18) brightness(.98)"; ctx.drawImage(image, -33, -51, 66, 78); ctx.restore();
  } else { ctx.fillStyle = "#8b8b8b"; ctx.fillRect(-27, -50, 54, 70); }

  const localAimBase = player.facing > 0 ? player.aimAngle : Math.PI - player.aimAngle;
  const weaponKind = player.weapon.kind;
  const firearm = WEAPONS[weaponKind].firearm;
  const reloadTilt = player.action === "reload" ? -.72 + Math.sin(player.actionTime * 14) * .06 : 0;
  const localAim = localAimBase + reloadTilt;
  const reach = firearm ? 35 : 27 + Math.max(0, strike) * 36;
  const handX = reach * Math.cos(localAim);
  const handY = -66 + Math.sin(localAim) * 25 + (firearm ? 0 : strike * -3);
  ctx.strokeStyle = player.hitFlash > 0 ? COLORS.hitFlash : COLORS.skin; ctx.lineWidth = 7; ctx.lineCap = "round";
  const supportX = firearm || weaponKind === "bat" ? handX - 17 : -32 + stride * .25;
  const supportY = firearm || weaponKind === "bat" ? handY + 9 : -51;
  ctx.beginPath(); ctx.moveTo(-14, -77); ctx.lineTo(supportX, supportY); ctx.moveTo(14, -77); ctx.lineTo(handX, handY); ctx.stroke();
  drawHeldWeapon(ctx, weaponKind, handX, handY, localAim, player.recoil);

  ctx.fillStyle = player.hitFlash > 0 ? COLORS.hitFlash : COLORS.skin;
  ctx.beginPath(); ctx.arc(0, -104, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111"; ctx.fillRect(4, -108, 8, 3);
  if (state.pantId === "guard" && player.abilityTimer > 0) {
    ctx.strokeStyle = getPant(state.pantId).color; ctx.lineWidth = 4; ctx.globalAlpha = 0.72;
    ctx.beginPath(); ctx.arc(0, -43, 64, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function zombieFrame(enemy: Enemy) {
  const progress = clamp(enemy.stateTimer / Math.max(0.01, enemy.stateDuration), 0, 0.999);
  if (enemy.zombieVariant === 1) {
    if (enemy.state === "dead") return 13 + Math.min(3, Math.floor(clamp(enemy.stateTimer / 0.42, 0, .999) * 4));
    if (enemy.state === "hurt") return 12;
    if (enemy.state === "windup") return 8 + Math.min(1, Math.floor(progress * 2));
    if (enemy.state === "active") return 10;
    if (enemy.state === "recover") return 11;
    if (enemy.state === "chase" || enemy.state === "enter") return 4 + (Math.floor(enemy.animTime * 1.45) % 4);
    return Math.floor(enemy.animTime * .9) % 4;
  }
  if (enemy.state === "dead") return Math.min(4, Math.floor(clamp(enemy.stateTimer / 0.38, 0, .999) * 5));
  if (enemy.state === "hurt") return 5 + Math.floor(progress * 5);
  if (enemy.state === "windup") return 20 + Math.min(5, Math.floor(progress * 6));
  if (enemy.state === "active") return 26 + Math.min(2, Math.floor(progress * 3));
  if (enemy.state === "recover") return 29;
  if (enemy.state === "chase" || enemy.state === "enter") return 30 + (Math.floor(enemy.animTime * 1.2) % 10);
  return 10 + (Math.floor(enemy.animTime) % 10);
}

function drawEnemyTelegraph(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  if (enemy.state !== "windup") return;
  const progress = clamp(enemy.stateTimer / Math.max(.01, enemy.stateDuration), 0, 1);
  const pulse = .45 + progress * .45;
  const angle = Math.atan2(enemy.attackY, enemy.attackX);
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = progress > .78 ? COLORS.hitFlash : COLORS.danger;
  ctx.fillStyle = "rgba(255,77,103,.13)";
  ctx.lineWidth = progress > .78 ? 4 : 2;
  ctx.translate(enemy.x, enemy.y + 5);
  ctx.rotate(angle);
  if (enemy.kind === "thrower") {
    ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(20, -46); ctx.lineTo(410, -46); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(370, -46, 17 + progress * 8, 0, Math.PI * 2); ctx.stroke();
  } else if (enemy.kind === "runner") {
    ctx.fillRect(18, -18, 165 * progress, 36);
    ctx.strokeRect(18, -18, 165, 36);
  } else if (enemy.kind === "brute") {
    ctx.beginPath(); ctx.ellipse(72, 0, 92, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let crack = 0; crack < 4; crack += 1) {
      ctx.beginPath(); ctx.moveTo(30 + crack * 25, 0); ctx.lineTo(45 + crack * 27, (crack % 2 ? -1 : 1) * (10 + progress * 12)); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(95, -34); ctx.lineTo(95, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawEliteMark(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  if (!enemy.elite || enemy.dead) return;
  ctx.save();
  ctx.strokeStyle = COLORS.elite;
  ctx.fillStyle = COLORS.elite;
  ctx.lineWidth = 2;
  ctx.globalAlpha = .72 + Math.sin(enemy.animTime * 1.8) * .15;
  ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y + 6, enemy.radius * 1.35, 10, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.translate(enemy.x, enemy.y - 142);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
}

function drawZombie(ctx: CanvasRenderingContext2D, enemy: Enemy, image: HTMLImageElement) {
  const frameWidth = enemy.zombieVariant === 1 ? 24 : 32;
  const frameHeight = 32;
  const frame = zombieFrame(enemy);
  const targetHeight = enemy.elite ? 144 : 128;
  const targetWidth = enemy.zombieVariant === 1 ? targetHeight * .75 : targetHeight;
  const progress = clamp(enemy.stateTimer / Math.max(0.01, enemy.stateDuration), 0, 1);
  ctx.save();
  ctx.translate(enemy.x, enemy.y + (enemy.state === "dead" ? progress * 8 : 0));
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.beginPath(); ctx.ellipse(0, 7, enemy.radius * 1.35, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(enemy.facing, 1);
  const fade = enemy.state === "dead" ? 1 - clamp((enemy.stateTimer - .66) / .34, 0, 1) : 1;
  ctx.globalAlpha = fade;
  ctx.filter = enemy.hitFlash > 0 ? "brightness(2.3) saturate(.5)" : "none";
  ctx.drawImage(image, frame * frameWidth, 0, frameWidth, frameHeight, -targetWidth / 2, -targetHeight + 14, targetWidth, targetHeight);
  ctx.filter = "none";
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, images: Record<string, HTMLImageElement>) {
  const def = ENEMIES[enemy.kind];
  drawEnemyTelegraph(ctx, enemy);
  if (enemy.kind === "walker") {
    const zombieImage = images[enemy.zombieVariant === 1 ? "zombie-mutant" : "zombie-walker"];
    if (zombieImage) {
      drawZombie(ctx, enemy, zombieImage);
      drawEliteMark(ctx, enemy);
      if (!enemy.dead && (enemy.hp < enemy.maxHp || enemy.elite)) {
        const barW = enemy.radius * 2.6;
        ctx.fillStyle = "rgba(5,9,7,.8)"; ctx.fillRect(enemy.x - barW / 2, enemy.y - 132, barW, 6);
        ctx.fillStyle = enemy.elite ? COLORS.elite : COLORS.toxic;
        ctx.fillRect(enemy.x - barW / 2, enemy.y - 132, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 6);
      }
      return;
    }
  }
  const stride = enemy.state === "chase" || enemy.state === "enter" ? Math.sin(enemy.animTime) * 8 : 0;
  const stateProgress = clamp(enemy.stateTimer / Math.max(0.01, enemy.stateDuration), 0, 1);
  const fallProgress = enemy.state === "dead" ? clamp(enemy.stateTimer / .42, 0, 1) : 0;
  const windupLean = enemy.state === "windup" ? -0.18 * stateProgress : 0;
  const activeLean = enemy.state === "active" ? 0.28 : 0;
  const hurtLean = enemy.state === "hurt" ? -0.25 * enemy.facing * Math.sin(stateProgress * Math.PI) : 0;
  const deathLean = enemy.state === "dead" ? enemy.facing * fallProgress * 1.42 : 0;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.48)";
  ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y + 7, enemy.radius * (1.25 - fallProgress * .35), 10 - fallProgress * 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(enemy.x, enemy.y + (enemy.state === "dead" ? fallProgress * 9 : 0));
  ctx.scale(enemy.facing, enemy.state === "windup" ? 1 - stateProgress * 0.04 : 1);
  ctx.rotate(windupLean + activeLean + hurtLean + deathLean);
  if (enemy.state === "dead") ctx.globalAlpha = 1 - clamp((enemy.stateTimer - .56) / .3, 0, 1);
  const bodyW = enemy.kind === "brute" ? 61 : enemy.kind === "runner" ? 32 : enemy.kind === "thrower" ? 43 : 41;
  ctx.fillStyle = enemy.hitFlash > 0 ? COLORS.hitFlash : def.color;
  ctx.beginPath(); ctx.arc(0, -82, enemy.kind === "brute" ? 17 : 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = enemy.hitFlash > 0 ? COLORS.hitFlash : "#232b38";
  ctx.fillRect(-bodyW / 2, -68, bodyW, enemy.kind === "brute" ? 58 : 48);
  if (enemy.kind === "thug") {
    ctx.fillStyle = def.color; ctx.fillRect(-bodyW / 2, -65, 7, 44); ctx.fillRect(bodyW / 2 - 7, -65, 7, 44);
    ctx.fillStyle = "#111722"; ctx.fillRect(-bodyW / 2 + 9, -56, bodyW - 18, 5);
  } else if (enemy.kind === "runner") {
    ctx.fillStyle = "#111722"; ctx.fillRect(-17, -96, 32, 6); ctx.fillRect(9, -91, 19, 5);
    ctx.strokeStyle = def.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-14, -62); ctx.lineTo(-40 - stride, -50); ctx.stroke();
  } else if (enemy.kind === "brute") {
    ctx.fillStyle = def.color; ctx.fillRect(-38, -66, 17, 17); ctx.fillRect(21, -66, 17, 17);
    ctx.fillStyle = "#111722"; ctx.fillRect(-26, -33, 52, 8);
  } else if (enemy.kind === "thrower") {
    ctx.fillStyle = "#111722"; ctx.fillRect(-31, -66, 15, 42);
    ctx.strokeStyle = COLORS.enemyBullet; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-24, -45, 9, 0, Math.PI * 2); ctx.stroke();
  }
  const attackReach = enemy.state === "active" ? 30 : enemy.state === "windup" ? -14 * stateProgress : 0;
  ctx.strokeStyle = enemy.hitFlash > 0 ? COLORS.hitFlash : def.color; ctx.lineWidth = enemy.kind === "brute" ? 10 : 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-bodyW / 3, -52); ctx.lineTo(-bodyW / 2 - 12 - stride * 0.3, -20); ctx.moveTo(bodyW / 3, -52); ctx.lineTo(bodyW / 2 + 17 + attackReach, -27); ctx.stroke();
  ctx.strokeStyle = "#090909"; ctx.lineWidth = enemy.kind === "brute" ? 12 : 9;
  ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(-16 - stride * 0.5, 12); ctx.moveTo(12, -12); ctx.lineTo(17 + stride * 0.5, 12); ctx.stroke();
  ctx.restore();
  drawEliteMark(ctx, enemy);
  if (!enemy.dead && (enemy.hp < enemy.maxHp || enemy.elite)) {
    const barW = enemy.radius * 2.4;
    ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.fillRect(enemy.x - barW / 2, enemy.y - 124, barW, 5);
    ctx.fillStyle = enemy.elite ? COLORS.elite : def.color; ctx.fillRect(enemy.x - barW / 2, enemy.y - 124, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 5);
  }
}

function drawPickup(ctx: CanvasRenderingContext2D, pickup: WeaponPickup, nearby: boolean, reducedMotion: boolean) {
  const y = pickup.y - 20 + (reducedMotion ? 0 : Math.sin(pickup.bob) * 5);
  ctx.save();
  const beam = ctx.createLinearGradient(pickup.x, pickup.y - 92, pickup.x, pickup.y + 3);
  beam.addColorStop(0, "rgba(255,226,138,0)"); beam.addColorStop(1, nearby ? "rgba(255,226,138,.18)" : "rgba(255,226,138,.07)");
  ctx.fillStyle = beam; ctx.fillRect(pickup.x - 22, pickup.y - 92, 44, 95);
  ctx.fillStyle = "rgba(0,0,0,.58)"; ctx.beginPath(); ctx.ellipse(pickup.x, pickup.y + 4, 35, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(pickup.x, y); ctx.scale(0.72, 0.72); drawHeldWeapon(ctx, pickup.weapon.kind, -20, 0, -0.14); ctx.restore();
  ctx.save(); ctx.translate(pickup.x, y - 26); ctx.rotate(Math.PI / 4); ctx.fillStyle = nearby ? COLORS.score : "rgba(255,226,138,.72)"; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
  if (nearby) {
    ctx.save(); ctx.textAlign = "center"; ctx.font = "900 13px ui-monospace, monospace"; ctx.fillStyle = COLORS.score;
    ctx.fillText(`Q  ${WEAPONS[pickup.weapon.kind].label}`, pickup.x, y - 43); ctx.restore();
  }
}

function effectNoise(seed: number, index: number) {
  const value = Math.sin(seed * 91.73 + index * 47.21) * 43758.5453;
  return value - Math.floor(value);
}

function drawEffect(ctx: CanvasRenderingContext2D, effect: Effect, mobileProfile: boolean) {
  const alpha = clamp(effect.life / effect.maxLife, 0, 1);
  const progress = 1 - alpha;
  const angle = effect.angle ?? 0;
  const radius = effect.radius ?? 28;
  const strength = effect.strength ?? 1;
  const seed = effect.seed ?? effect.x * .013 + effect.y * .019;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = effect.color;
  ctx.fillStyle = effect.color;
  ctx.lineCap = "square";
  if (effect.kind === "text" && effect.text) {
    const big = effect.text.includes("WAVE");
    ctx.font = `900 ${big ? 54 : 26}px Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = big ? 12 : 5;
    ctx.fillText(effect.text, effect.x, effect.y - progress * 38);
  } else if (effect.kind === "ring") {
    ctx.lineWidth = Math.max(2, 7 * alpha);
    ctx.beginPath(); ctx.ellipse(effect.x, effect.y - 4, radius * (.65 + progress * 1.1), radius * (.2 + progress * .28), 0, 0, Math.PI * 2); ctx.stroke();
  } else if (effect.kind === "trail") {
    ctx.globalAlpha = alpha * .14;
    ctx.beginPath(); ctx.ellipse(effect.x, effect.y - 40, radius, radius * 1.35, angle, 0, Math.PI * 2); ctx.fill();
  } else if (effect.kind === "dust") {
    const count = mobileProfile ? 4 : 7;
    for (let i = 0; i < count; i += 1) {
      const side = effectNoise(seed, i) * 2 - 1;
      const rise = effectNoise(seed, i + 11);
      const size = 3 + effectNoise(seed, i + 23) * 7;
      ctx.globalAlpha = alpha * .38;
      ctx.fillRect(effect.x + side * (18 + progress * 44), effect.y + 4 - rise * progress * 28, size, size * .5);
    }
  } else if (effect.kind === "muzzle") {
    ctx.translate(effect.x, effect.y); ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha * 1.8);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo((34 + progress * 24) * strength, -9); ctx.lineTo(22, 0); ctx.lineTo((34 + progress * 24) * strength, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff6cf"; ctx.fillRect(0, -3, 22, 6);
  } else if (effect.kind === "slash") {
    ctx.translate(effect.x, effect.y); ctx.rotate(angle);
    ctx.lineWidth = Math.max(2, 10 * alpha * strength);
    ctx.beginPath(); ctx.arc(0, -30, radius * (.75 + progress * .35), -.92, .92); ctx.stroke();
    ctx.globalAlpha = alpha * .25; ctx.lineWidth += 8; ctx.stroke();
  } else if (effect.kind === "burst" || effect.kind === "hit") {
    const count = mobileProfile ? 5 : 9;
    ctx.translate(effect.x, effect.y - 38); ctx.rotate(angle);
    ctx.lineWidth = Math.max(2, 6 * alpha);
    for (let i = 0; i < count; i += 1) {
      const rayAngle = (effectNoise(seed, i) - .5) * 2.5;
      const length = (18 + effectNoise(seed, i + 12) * 38) * strength * (.7 + progress);
      ctx.beginPath(); ctx.moveTo(Math.cos(rayAngle) * 7, Math.sin(rayAngle) * 7); ctx.lineTo(Math.cos(rayAngle) * length, Math.sin(rayAngle) * length); ctx.stroke();
    }
  } else if (effect.kind === "bolt") {
    ctx.translate(effect.x, effect.y - 86);
    ctx.lineWidth = Math.max(2, 7 * alpha);
    ctx.shadowColor = effect.color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(0, -52);
    const segments = mobileProfile ? 4 : 6;
    for (let i = 1; i <= segments; i += 1) {
      const yy = -52 + i * (108 / segments);
      const xx = i === segments ? 0 : (effectNoise(seed, i) - .5) * 34;
      ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawGame(ctx: CanvasRenderingContext2D, state: GameState, images: Record<string, HTMLImageElement>, layers: ArenaLayers | null, reducedMotion: boolean, mobileProfile: boolean) {
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  ctx.save();
  if (!reducedMotion) {
    const trauma = state.cameraTrauma * state.cameraTrauma;
    const zoom = 1 + Math.min(mobileProfile ? .018 : .034, state.cameraZoom);
    const shakeX = Math.sin(state.cameraPhase * 1.67) * trauma * 13;
    const shakeY = Math.cos(state.cameraPhase * 2.31) * trauma * 8;
    ctx.translate(state.cameraFocusX, state.cameraFocusY);
    ctx.scale(zoom, zoom);
    ctx.translate(-state.cameraFocusX + shakeX, -state.cameraFocusY + shakeY);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#07101d"; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  if (layers) {
    const camera = reducedMotion ? 0 : (state.player.x / WORLD_W - 0.5) * 38;
    const farX = clamp(BACKGROUND_MARGIN + camera * 0.14, 0, BACKGROUND_MARGIN * 2);
    const nearX = clamp(BACKGROUND_MARGIN + camera * 0.62, 0, BACKGROUND_MARGIN * 2);
    ctx.drawImage(layers.far, farX, 0, WORLD_W, WORLD_H, 0, 0, WORLD_W, WORLD_H);
    ctx.drawImage(layers.near, nearX, 0, WORLD_W, WORLD_H, 0, 0, WORLD_W, WORLD_H);
    ctx.drawImage(layers.street, 0, 0);
  }

  const focus = ctx.createRadialGradient(state.player.x, state.player.y - 45, 16, state.player.x, state.player.y - 35, 170);
  focus.addColorStop(0, `${getPant(state.pantId).color}25`); focus.addColorStop(.6, "rgba(255,242,211,.035)"); focus.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = focus; ctx.fillRect(state.player.x - 180, state.player.y - 215, 360, 260);
  if (!reducedMotion) {
    ctx.strokeStyle = "rgba(156,210,228,.16)"; ctx.lineWidth = 2;
    const rainCount = mobileProfile ? 16 : 32;
    for (let i = 0; i < rainCount; i += 1) {
      const x = (i * 97 + state.elapsed * 145) % WORLD_W;
      const y = (i * 61 + state.elapsed * 440) % 590;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 19); ctx.stroke();
    }
  }

  for (const effect of state.effects) {
    if (effect.kind === "trail" || effect.kind === "ring" || effect.kind === "dust") drawEffect(ctx, effect, mobileProfile);
  }

  for (const pickup of state.pickups) drawPickup(ctx, pickup, pickup.id === state.player.nearPickupId, reducedMotion);
  const actors: Array<{ y: number; draw: () => void }> = state.enemies.map((enemy) => ({ y: enemy.y, draw: () => drawEnemy(ctx, enemy, images) }));
  actors.push({ y: state.player.y, draw: () => drawFighter(ctx, state, images, reducedMotion) });
  actors.sort((a, b) => a.y - b.y).forEach((actor) => actor.draw());

  for (const projectile of state.projectiles) {
    ctx.fillStyle = projectile.owner === "player" ? COLORS.bullet : COLORS.enemyBullet;
    ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = projectile.owner === "player" ? "rgba(255,226,138,.78)" : "rgba(255,90,115,.58)";
    ctx.lineWidth = projectile.kind === "pellet" ? 2 : 4; ctx.beginPath(); ctx.moveTo(projectile.x, projectile.y); ctx.lineTo(projectile.prevX, projectile.prevY); ctx.stroke();
  }
  for (const effect of state.effects) {
    if (effect.kind !== "trail" && effect.kind !== "ring" && effect.kind !== "dust") drawEffect(ctx, effect, mobileProfile);
  }
  ctx.restore();

  if (state.introTimer > 0) {
    const enter = clamp((1.9 - state.introTimer) / .28, 0, 1);
    const exit = clamp(state.introTimer / .25, 0, 1);
    const alpha = Math.min(enter, exit);
    const scale = .9 + enter * .1;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(WORLD_W / 2, 330); ctx.scale(scale, scale);
    ctx.textAlign = "center"; ctx.fillStyle = COLORS.paper; ctx.font = "900 72px Impact, sans-serif";
    ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 16; ctx.fillText(`WAVE ${String(state.wave).padStart(2, "0")}`, 0, 0);
    const waveCallout = state.wave === 1 ? "GRAB THE BAT // Q OR SWAP" : state.wave === 8 ? "INFECTED HORDE" : state.wave % 5 === 0 ? "ELITE RUSH" : state.wave > 8 ? "THE HORDE IS HERE" : "HOLD THE BLOCK";
    ctx.font = "700 18px Arial, sans-serif"; ctx.fillStyle = state.wave === 8 ? COLORS.toxic : state.wave % 5 === 0 ? COLORS.elite : COLORS.score; ctx.fillText(waveCallout, 0, 36);
    ctx.restore();
  }
  if (state.waveClearTimer > 0 || (state.wave === 8 && state.introTimer > 0)) {
    const barAlpha = state.waveClearTimer > 0 ? clamp(state.waveClearTimer / .24, 0, .72) : clamp(state.introTimer / 1.9, 0, .45);
    ctx.fillStyle = `rgba(3,6,11,${barAlpha})`; ctx.fillRect(0, 0, WORLD_W, 30); ctx.fillRect(0, WORLD_H - 30, WORLD_W, 30);
  }
  if (state.screenFlash > 0) {
    ctx.fillStyle = `rgba(177,255,71,${Math.min(.13, state.screenFlash * .18)})`; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
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
  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [result, setResult] = useState<Result | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [boardStatus, setBoardStatus] = useState("Loading the street records…");
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const actionsRef = useRef({ dx: 0, dy: 0, attack: false, attackQueued: false, dash: false, ability: false, swap: false, reload: false });
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const arenaLayersRef = useRef<ArenaLayers | null>(null);
  const audioRef = useRef<ZombieAudio | null>(null);
  const joystickRef = useRef<{ id: number | null; rect: DOMRect | null; maxTravel: number; x: number; y: number }>({ id: null, rect: null, maxTravel: 0, x: 0, y: 0 });
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
    const audio = new ZombieAudio();
    const savedMuted = localStorage.getItem("camo-clash-muted") === "true";
    audio.setMuted(savedMuted);
    audioRef.current = audio;
    const muteFrame = requestAnimationFrame(() => setMuted(savedMuted));
    return () => {
      cancelAnimationFrame(muteFrame);
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setPaused(screen !== "playing");
  }, [screen]);

  useEffect(() => {
    const savedName = localStorage.getItem("camo-clash-name");
    const nameFrame = savedName ? requestAnimationFrame(() => setPlayerName(savedName)) : 0;
    let cacheFrame = 0;
    let sceneryLoaded = 0;
    const rebuildArena = (releaseSources = false) => {
      cancelAnimationFrame(cacheFrame);
      cacheFrame = requestAnimationFrame(() => {
        arenaLayersRef.current = createArenaLayers(imagesRef.current);
        if (releaseSources) {
          CITY_LAYERS.forEach((_, index) => { delete imagesRef.current[`city-${index}`]; });
          delete imagesRef.current.industrial;
          delete imagesRef.current["city-premium"];
        }
      });
    };
    arenaLayersRef.current = createArenaLayers(imagesRef.current);
    for (const item of PANTS) {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => { imagesRef.current[item.id] = image; };
      image.src = item.asset;
    }
    for (const [key, source] of [["zombie-walker", "/zombies/walker-sheet.png"], ["zombie-mutant", "/zombies/mutant-sheet-v2.png"]] as const) {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => { imagesRef.current[key] = image; };
      image.src = source;
    }
    const premiumCity = new Image();
    premiumCity.decoding = "async";
    premiumCity.onload = () => {
      imagesRef.current["city-premium"] = premiumCity;
      sceneryLoaded += 1;
      rebuildArena(sceneryLoaded === CITY_LAYERS.length + 2);
    };
    premiumCity.src = "/pixel/city/camo-city-v2.webp";
    CITY_LAYERS.forEach((source, index) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        imagesRef.current[`city-${index}`] = image;
        sceneryLoaded += 1;
        rebuildArena(sceneryLoaded === CITY_LAYERS.length + 2);
      };
      image.src = source;
    });
    const industrial = new Image();
    industrial.decoding = "async";
    industrial.onload = () => {
      imagesRef.current.industrial = industrial;
      sceneryLoaded += 1;
      rebuildArena(sceneryLoaded === CITY_LAYERS.length + 2);
    };
    industrial.src = "/pixel/industrial-tileset.png";
    const boardFrame = requestAnimationFrame(() => { void fetchLeaderboard(); });
    return () => { if (nameFrame) cancelAnimationFrame(nameFrame); cancelAnimationFrame(boardFrame); cancelAnimationFrame(cacheFrame); };
  }, [fetchLeaderboard]);

  useEffect(() => {
    const resetInputs = () => {
      keysRef.current.clear();
      actionsRef.current.dx = 0;
      actionsRef.current.dy = 0;
      actionsRef.current.attack = false;
      actionsRef.current.attackQueued = false;
      actionsRef.current.dash = false;
      actionsRef.current.ability = false;
      actionsRef.current.swap = false;
      actionsRef.current.reload = false;
    };
    if (screen !== "playing") resetInputs();
    const onBlur = () => { resetInputs(); audioRef.current?.setPaused(true); };
    const onFocus = () => { audioRef.current?.setPaused(screenRef.current !== "playing"); };
    const onVisibility = () => {
      if (document.hidden) resetInputs();
      audioRef.current?.setPaused(document.hidden || screenRef.current !== "playing");
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [screen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const editing = Boolean(target?.isContentEditable || target?.matches("input, textarea, select"));
      if (editing) return;
      if (!event.repeat && (key === "escape" || key === "p")) {
        if (screenRef.current === "playing") changeScreen("paused");
        else if (screenRef.current === "paused") changeScreen("playing");
        return;
      }
      if (screenRef.current !== "playing") return;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
      keysRef.current.add(key);
      if (!event.repeat && (key === " " || key === "j")) actionsRef.current.attackQueued = true;
      if (!event.repeat && (key === "shift" || key === "k")) actionsRef.current.dash = true;
      if (!event.repeat && (key === "e" || key === "l")) actionsRef.current.ability = true;
      if (!event.repeat && key === "q") actionsRef.current.swap = true;
      if (!event.repeat && key === "r") actionsRef.current.reload = true;
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
    const mobileProfile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
    const renderScale = mobileProfile ? 0.75 : 1;
    canvas.width = Math.round(WORLD_W * renderScale);
    canvas.height = Math.round(WORLD_H * renderScale);
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    let frameId = 0;
    let last = performance.now();
    let hudClock = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const portraitHold = window.matchMedia("(orientation: portrait) and (any-pointer: coarse)");

    const frame = (now: number) => {
      const state = gameRef.current;
      if (!state || screenRef.current !== "playing") return;
      frameId = requestAnimationFrame(frame);
      if (portraitHold.matches) {
        last = now;
        return;
      }
      const elapsed = now - last;
      if (elapsed < FRAME_INTERVAL - 1) return;
      const dt = Math.min(0.033, elapsed / 1000);
      last = now - (elapsed % FRAME_INTERVAL);
      updateGame(state, dt, keysRef.current, actionsRef.current);
      if (state.audioEvents.length > 0) {
        const audio = audioRef.current;
        for (const event of state.audioEvents.splice(0)) {
          audio?.play(event.sound, {
            pan: clamp((event.x / WORLD_W) * 2 - 1, -0.8, 0.8),
            entityId: event.entityId,
            volume: event.volume,
          });
        }
      }
      drawGame(ctx, state, imagesRef.current, arenaLayersRef.current, reducedMotion, mobileProfile);
      hudClock += dt;
      if (hudClock > 0.1) {
        hudClock = 0;
        const nearPickup = state.pickups.find((pickup) => pickup.id === state.player.nearPickupId);
        let enemyCount = 0;
        for (const enemy of state.enemies) if (!enemy.dead) enemyCount += 1;
        const nextHud: Hud = {
          health: Math.round(state.player.hp * 10) / 10,
          maxHealth: state.player.maxHp,
          score: state.score,
          wave: state.wave,
          combo: state.combo,
          abilityCd: Math.ceil(state.player.abilityCd * 10) / 10,
          dashCd: Math.ceil(state.player.dashCd * 10) / 10,
          enemies: enemyCount,
          weapon: state.player.weapon.kind,
          ammo: state.player.weapon.ammo,
          reserve: state.player.weapon.reserve,
          durability: state.player.weapon.durability,
          reloading: state.player.action === "reload",
          nearWeapon: nearPickup?.weapon.kind ?? null,
        };
        setHud((current) => hudMatches(current, nextHud) ? current : nextHud);
      }
      if (state.player.hp <= 0 && state.gameOverTimer <= 0) {
        cancelAnimationFrame(frameId);
        setResult({ runId: state.runId, score: state.score, wave: state.wave, kills: state.kills, maxCombo: state.maxCombo, elapsed: state.elapsed });
        setSubmitStatus("");
        changeScreen("gameover");
        void fetchLeaderboard();
        return;
      }
      if (state.pendingUpgrade) {
        cancelAnimationFrame(frameId);
        const choices = pickUpgradeChoices(state.player);
        setUpgrades(choices);
        changeScreen("upgrade");
        return;
      }
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [screen, changeScreen, fetchLeaderboard]);

  const toggleSound = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    localStorage.setItem("camo-clash-muted", String(nextMuted));
    audioRef.current?.setMuted(nextMuted);
    if (!nextMuted) void audioRef.current?.unlock();
  };

  const startRun = () => {
    if (!muted) void audioRef.current?.unlock();
    const normalized = playerName.trim().slice(0, 18) || "FIGHTER";
    setPlayerName(normalized);
    localStorage.setItem("camo-clash-name", normalized);
    gameRef.current = freshRun(selectedPant);
    setResult(null);
    setSubmitted(false);
    setHud(INITIAL_HUD);
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
    const tracking = joystickRef.current;
    if (tracking.id !== event.pointerId) return;
    const rect = tracking.rect ?? stick.getBoundingClientRect();
    const rawX = event.clientX - (rect.left + rect.width / 2);
    const rawY = event.clientY - (rect.top + rect.height / 2);
    const maxTravel = tracking.maxTravel || Math.max(28, rect.width * 0.34);
    const rawLength = Math.hypot(rawX, rawY);
    const scale = rawLength > maxTravel ? maxTravel / rawLength : 1;
    const clampedX = rawX * scale;
    const clampedY = rawY * scale;
    const normalized = clamp(rawLength / maxTravel, 0, 1);
    const deadZone = 0.14;
    const magnitude = normalized <= deadZone ? 0 : (normalized - deadZone) / (1 - deadZone);
    const directionX = rawLength > 0 ? rawX / rawLength : 0;
    const directionY = rawLength > 0 ? rawY / rawLength : 0;
    const x = magnitude === 0 ? 0 : clampedX;
    const y = magnitude === 0 ? 0 : clampedY;
    actionsRef.current.dx = directionX * magnitude;
    actionsRef.current.dy = directionY * magnitude;
    joystickRef.current.x = x;
    joystickRef.current.y = y;
    stick.style.setProperty("--stick-x", `${x}px`);
    stick.style.setProperty("--stick-y", `${y}px`);
  };

  const startJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const stick = event.currentTarget;
    const rect = stick.getBoundingClientRect();
    joystickRef.current.id = event.pointerId;
    joystickRef.current.rect = rect;
    joystickRef.current.maxTravel = Math.max(28, rect.width * 0.34);
    stick.setPointerCapture(event.pointerId);
    handleJoystick(event);
  };

  const releaseJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickRef.current.id !== event.pointerId) return;
    actionsRef.current.dx = 0; actionsRef.current.dy = 0;
    joystickRef.current.id = null;
    joystickRef.current.rect = null;
    joystickRef.current.maxTravel = 0;
    joystickRef.current.x = 0;
    joystickRef.current.y = 0;
    event.currentTarget.style.setProperty("--stick-x", "0px");
    event.currentTarget.style.setProperty("--stick-y", "0px");
  };

  const healthPercent = clamp((hud.health / hud.maxHealth) * 100, 0, 100);
  const threat = Math.min(5, 1 + Math.floor((hud.wave - 1) / 3));

  return (
    <main className={`game-shell ${screen !== "menu" && screen !== "leaderboard" ? "is-fighting" : ""}`} style={{ "--pant-accent": pant.color } as React.CSSProperties}>
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
                <button type="button" className="text-button sound-menu-button" aria-pressed={muted} onClick={toggleSound}>SFX {muted ? "OFF" : "ON"}</button>
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
              <div className="future-note">
                <div className="zombie-models" role="img" aria-label="Walker and mutant zombie models"><i className="zombie-preview walker" /><i className="zombie-preview mutant" /></div>
                <div><strong>INFECTED STREETS</strong><span>Two animated zombie classes enter at wave 08—with positional sound.</span></div>
              </div>
            </aside>
          </div>

          <div className="pants-rail" aria-label="Choose your pants">
            {PANTS.map((item, index) => (
              <button key={item.id} type="button" aria-pressed={selectedPant === item.id} className={`pant-card ${selectedPant === item.id ? "selected" : ""}`} onClick={() => setSelectedPant(item.id)}>
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
          <canvas ref={canvasRef} className="fight-canvas" role="img" aria-label="Camo Clash fight arena. Survive progressively harder enemy waves.">Camo Clash is an action game. Use the listed keyboard or touch controls to fight.</canvas>
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
          <button type="button" className="sound-button" aria-pressed={muted} aria-label={muted ? "Turn zombie sound effects on" : "Mute zombie sound effects"} onClick={toggleSound}>SFX<br />{muted ? "OFF" : "ON"}</button>
          <button
            type="button"
            className={`ability-button ${hud.abilityCd <= 0 ? "ready" : ""}`}
            onPointerDown={() => { actionsRef.current.ability = true; }}
            aria-label={`${pant.ability}. ${hud.abilityCd <= 0 ? "Ready" : `${hud.abilityCd.toFixed(1)} seconds remaining`}`}
          >
            <small>ABILITY</small><strong>{hud.abilityCd <= 0 ? "READY" : hud.abilityCd.toFixed(1)}</strong><span>{pant.ability}</span>
          </button>
          <div className="touch-controls" aria-label="Touch controls">
            <div className="joystick" aria-label="Movement joystick" onPointerDown={startJoystick} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) handleJoystick(event); }} onPointerUp={releaseJoystick} onPointerCancel={releaseJoystick}><i /></div>
            <div className="action-cluster">
              <button type="button" className="touch-weapon" aria-label="Swap or drop weapon" onPointerDown={() => { actionsRef.current.swap = true; }}><img className="touch-icon" src={WEAPONS[hud.weapon].icon} alt="" /><span>SWAP</span></button>
              <button type="button" className={`touch-ability ${hud.abilityCd <= 0 ? "ready" : "cooldown"}`} aria-label={`${pant.ability} ability`} onPointerDown={() => { actionsRef.current.ability = true; }}><span>{hud.abilityCd <= 0 ? "POWER" : hud.abilityCd.toFixed(1)}</span></button>
              <button type="button" className="touch-attack" aria-label={WEAPONS[hud.weapon].firearm ? "Fire weapon" : "Attack"} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); actionsRef.current.attack = true; actionsRef.current.attackQueued = true; }} onPointerUp={() => { actionsRef.current.attack = false; }} onPointerCancel={() => { actionsRef.current.attack = false; }} onLostPointerCapture={() => { actionsRef.current.attack = false; }}><img className="touch-icon" src={WEAPONS[hud.weapon].icon} alt="" /><span>{WEAPONS[hud.weapon].firearm ? "FIRE" : "HIT"}</span></button>
              <button type="button" className={`touch-reload ${hud.reloading ? "reloading" : ""}`} aria-label="Reload weapon" disabled={!WEAPONS[hud.weapon].firearm} onPointerDown={() => { actionsRef.current.reload = true; }}><img className="touch-icon" src="/pixel/icons/reload.png" alt="" /><span>{WEAPONS[hud.weapon].firearm ? `${hud.ammo}/${hud.reserve}` : "—"}</span></button>
              <button type="button" className={`touch-dash ${hud.dashCd <= 0 ? "ready" : "cooldown"}`} aria-label={hud.dashCd <= 0 ? "Dash ready" : `Dash ready in ${hud.dashCd.toFixed(1)} seconds`} onPointerDown={() => { actionsRef.current.dash = true; }}><img className="touch-icon" src="/pixel/icons/dash.png" alt="" /><span>{hud.dashCd <= 0 ? "DASH" : hud.dashCd.toFixed(1)}</span></button>
            </div>
          </div>
          {screen === "playing" && <div className="rotate-notice" role="status"><img src="/pixel/icons/dash.png" alt="" /><strong>TURN YOUR PHONE</strong><span>Camo Clash is optimized for landscape combat.</span></div>}

          {screen === "paused" && (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pause-title">
              <div className="pause-panel cut-panel"><p className="eyebrow">FIGHT ON HOLD</p><h2 id="pause-title">PAUSED</h2><button className="primary-button" onClick={() => { if (!muted) void audioRef.current?.unlock(); changeScreen("playing"); }}>BACK TO THE BLOCK</button><button type="button" className="text-button" aria-pressed={muted} onClick={toggleSound}>ZOMBIE SFX: {muted ? "OFF" : "ON"}</button><button className="text-button" onClick={() => changeScreen("menu")}>QUIT RUN</button></div>
            </div>
          )}

          {screen === "upgrade" && (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
              <div className="upgrade-panel">
                <p className="eyebrow">WAVE CLEARED // CHOOSE ONE</p><h2 id="upgrade-title">LEVEL UP THE FIT</h2>
                <div className="upgrade-grid">{upgrades.map((upgrade, index) => <button key={upgrade.id} onClick={() => chooseUpgrade(upgrade)}><span>0{index + 1}</span><strong>{upgrade.name}</strong><small>{upgrade.description}</small></button>)}</div>
              </div>
            </div>
          )}

          {screen === "gameover" && result && (
            <div className="modal-backdrop results-backdrop" role="dialog" aria-modal="true" aria-labelledby="results-title">
              <div className="results-panel cut-panel">
                <div><p className="eyebrow">RUN TERMINATED</p><h2 id="results-title">OVERRUN</h2><p className="result-score">{result.score.toLocaleString()}</p><span className="score-caption">FINAL SCORE</span></div>
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
