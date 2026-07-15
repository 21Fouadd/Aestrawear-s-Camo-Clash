"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZombieAudio, type GameCueId, type ZombieSoundId } from "../lib/game-audio";
import { getPant, PANTS, type PantId } from "../lib/game-config";
import {
  buildCoopInviteUrl,
  createCoopRoom,
  joinCoopRoom,
  parseCoopInvite,
  type CoopConnection,
  type CoopMessage,
  type CoopRole,
} from "../lib/coop-network";
import CoopLobby, { type CoopLobbyPhase, type CoopLobbyView, type CoopPlayerSlot } from "./CoopLobby";

const WORLD_W = 1280;
const WORLD_H = 720;
const ARENA = { left: 72, right: 1208, top: 250, bottom: 630 };
const STREET_HORIZON = ARENA.top - 38;

type Screen = "menu" | "playing" | "paused" | "upgrade" | "gameover" | "leaderboard";
type FighterId = "host" | "guest";
type GameMode = "solo" | "coop";
type EnemyKind = "thug" | "runner" | "brute" | "thrower" | "walker";
type EnemyState = "enter" | "chase" | "windup" | "active" | "recover" | "hurt" | "dead";
type PlayerAction = "idle" | "attack" | "dash" | "reload" | "hurt" | "dead";
type WeaponKind = "fists" | "bat" | "knife" | "pistol" | "shotgun";
type CityId = "neon" | "harbor" | "blackout";

type CityDefinition = {
  id: CityId;
  name: string;
  code: string;
  tagline: string;
  accent: string;
  accentAlt: string;
  sky: string;
  streetTop: string;
  streetBottom: string;
  filter: string;
  rain: number;
  farParallax: number;
  nearParallax: number;
};

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
  targetPlayerId: FighterId;
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
  kind: "hit" | "ring" | "text" | "trail" | "bolt" | "slash" | "burst" | "dust" | "muzzle" | "tracer";
};

type Player = {
  id: FighterId;
  name: string;
  pantId: PantId;
  connected: boolean;
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
  dashRewardReady: boolean;
  trailTimer: number;
  vx: number;
  vy: number;
  inputX: number;
  inputY: number;
  animTime: number;
  moveAmount: number;
  hitFlash: number;
  recoil: number;
  slowTimer: number;
  aimAngle: number;
  weapon: HeldWeapon;
  nearPickupId: number | null;
};

type PlayerInputState = {
  dx: number;
  dy: number;
  attack: boolean;
  attackQueued: boolean;
  dash: boolean;
  ability: boolean;
  swap: boolean;
  reload: boolean;
};

type FighterSetup = { id: FighterId; name: string; pantId: PantId };
type CoopIdentity = { name: string; pantId: PantId };

type GameState = {
  runId: string;
  mode: GameMode;
  pantId: PantId;
  player: Player;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: WeaponPickup[];
  effects: Effect[];
  audioEvents: Array<{ sound?: ZombieSoundId; cue?: GameCueId; x: number; entityId?: number; volume?: number; intensity?: number }>;
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
  damageFlash: number;
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
  partnerHealth: number;
  partnerMaxHealth: number;
  partnerName: string;
  partnerPant: PantId | null;
  partnerConnected: boolean;
};

type ArenaLayers = {
  far: HTMLCanvasElement;
  near: HTMLCanvasElement;
  street: HTMLCanvasElement;
};

type RenderTextures = {
  vignette: HTMLCanvasElement;
  danger: HTMLCanvasElement;
  haze: HTMLCanvasElement;
  pickupBeam: HTMLCanvasElement;
  pantGlows: Record<PantId, HTMLCanvasElement>;
};

type Result = { runId: string; score: number; wave: number; kills: number; maxCombo: number; elapsed: number; mode: GameMode };
type LeaderboardEntry = {
  id: number;
  rank: number;
  playerName: string;
  score: number;
  wave: number;
  kills: number;
  pantId: PantId;
  mode: GameMode;
};

type Upgrade = {
  id: string;
  name: string;
  description: string;
  apply: (player: Player) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPantId(value: unknown): value is PantId {
  return typeof value === "string" && PANTS.some((item) => item.id === value);
}

function normalizeFighterName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 18) || fallback;
}

function readCoopIdentity(value: unknown, fallback: string): CoopIdentity | null {
  if (!isRecord(value) || !isPantId(value.pantId)) return null;
  return { name: normalizeFighterName(value.name, fallback), pantId: value.pantId };
}

function isCoopSnapshot(value: unknown): value is GameState {
  if (!isRecord(value) || value.mode !== "coop" || !Array.isArray(value.players) || value.players.length !== 2) return false;
  if (!Array.isArray(value.enemies) || !Array.isArray(value.projectiles) || !Array.isArray(value.pickups) || !Array.isArray(value.effects) || !Array.isArray(value.audioEvents)) return false;
  if (typeof value.runId !== "string" || typeof value.wave !== "number" || typeof value.score !== "number") return false;
  return value.players.every((fighter) => isRecord(fighter)
    && (fighter.id === "host" || fighter.id === "guest")
    && isPantId(fighter.pantId)
    && typeof fighter.x === "number"
    && typeof fighter.y === "number"
    && typeof fighter.hp === "number"
    && isRecord(fighter.weapon));
}

function readResult(value: unknown): Result | null {
  if (!isRecord(value) || typeof value.runId !== "string" || value.mode !== "coop") return null;
  const numeric = [value.score, value.wave, value.kills, value.maxCombo, value.elapsed];
  if (!numeric.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
  return {
    runId: value.runId,
    score: value.score as number,
    wave: value.wave as number,
    kills: value.kills as number,
    maxCombo: value.maxCombo as number,
    elapsed: value.elapsed as number,
    mode: "coop",
  };
}

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

const ENEMY_KINDS: EnemyKind[] = ["thug", "runner", "brute", "thrower", "walker"];
const MIN_WINDUPS: Record<EnemyKind, number> = {
  thug: .24,
  runner: .2,
  brute: .62,
  thrower: .45,
  walker: .36,
};
const ENEMY_SKIN_TONES = ["#c98e67", "#9b6547", "#d6a17b", "#77503c"];
const solidEnemiesScratch: Enemy[] = [];

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
    attacks: [{ startup: 0.16, active: 0.02, recovery: 0.58, damage: 52, range: 530, arc: 30, knockback: 300, stun: 0.24, maxTargets: 4, hitStop: 0.055, pellets: 1, spread: 28, bulletSpeed: 980, projectileLife: 0.5 }],
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

const CITIES: CityDefinition[] = [
  {
    id: "neon",
    name: "Neon Ward",
    code: "NW-01",
    tagline: "Rain, reflections, midnight pressure",
    accent: "#4fe0ff",
    accentAlt: "#ed4bff",
    sky: "#050b18",
    streetTop: "#182435",
    streetBottom: "#070b13",
    filter: "saturate(1.12) contrast(1.08) brightness(.8)",
    rain: 1,
    farParallax: .14,
    nearParallax: .62,
  },
  {
    id: "harbor",
    name: "Iron Harbor",
    code: "IH-07",
    tagline: "Industrial fog, amber warning lights",
    accent: "#ffb347",
    accentAlt: "#4fd6c8",
    sky: "#10141b",
    streetTop: "#292b2c",
    streetBottom: "#0c0e11",
    filter: "sepia(.34) saturate(1.35) hue-rotate(340deg) brightness(.58) contrast(1.3)",
    rain: .38,
    farParallax: .2,
    nearParallax: .76,
  },
  {
    id: "blackout",
    name: "Blackout Heights",
    code: "BH-13",
    tagline: "Dead grid, emergency red, hard shadows",
    accent: "#ff4d67",
    accentAlt: "#8da8ff",
    sky: "#030407",
    streetTop: "#151820",
    streetBottom: "#050609",
    filter: "grayscale(.68) saturate(.55) contrast(1.32) brightness(.48)",
    rain: .62,
    farParallax: .09,
    nearParallax: .48,
  },
];

function getCity(id: CityId) {
  return CITIES.find((city) => city.id === id) ?? CITIES[0];
}

const BACKGROUND_MARGIN = 64;
const BACKGROUND_W = WORLD_W + BACKGROUND_MARGIN * 2;
const MAX_EFFECTS = 96;
const FIXED_STEP = 1 / 60;

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
const budgetForWave = (wave: number, mode: GameMode = "solo") => {
  const base = Math.min(80, 5 + wave * 1.55 + Math.floor(wave / 5) * 2.5);
  return base * (wave % 5 === 0 ? 1.18 : 1) * (mode === "coop" ? 1.65 : 1);
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

function createRenderTextures(): RenderTextures {
  const vignette = createCanvas(WORLD_W, WORLD_H);
  const vignetteCtx = vignette.getContext("2d");
  if (vignetteCtx) {
    const gradient = vignetteCtx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 220, WORLD_W / 2, WORLD_H / 2, 760);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(.7, "rgba(0,0,0,.03)");
    gradient.addColorStop(1, "rgba(0,0,0,.3)");
    vignetteCtx.fillStyle = gradient;
    vignetteCtx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  const danger = createCanvas(WORLD_W, WORLD_H);
  const dangerCtx = danger.getContext("2d");
  if (dangerCtx) {
    const gradient = dangerCtx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 250, WORLD_W / 2, WORLD_H / 2, 760);
    gradient.addColorStop(0, "rgba(255,40,70,0)");
    gradient.addColorStop(.66, "rgba(255,40,70,.15)");
    gradient.addColorStop(1, "rgba(255,40,70,1)");
    dangerCtx.fillStyle = gradient;
    dangerCtx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  const haze = createCanvas(720, 112);
  const hazeCtx = haze.getContext("2d");
  if (hazeCtx) {
    const gradient = hazeCtx.createLinearGradient(0, 0, haze.width, 0);
    gradient.addColorStop(0, "rgba(130,174,197,0)");
    gradient.addColorStop(.5, "rgba(130,174,197,.12)");
    gradient.addColorStop(1, "rgba(130,174,197,0)");
    hazeCtx.fillStyle = gradient;
    hazeCtx.fillRect(0, 0, haze.width, haze.height);
  }

  const pickupBeam = createCanvas(54, 104);
  const beamCtx = pickupBeam.getContext("2d");
  if (beamCtx) {
    const gradient = beamCtx.createLinearGradient(0, 0, 0, pickupBeam.height);
    gradient.addColorStop(0, "rgba(255,226,138,0)");
    gradient.addColorStop(1, "rgba(255,226,138,1)");
    beamCtx.fillStyle = gradient;
    beamCtx.fillRect(0, 0, pickupBeam.width, pickupBeam.height);
  }

  const pantGlows = {} as Record<PantId, HTMLCanvasElement>;
  for (const pant of PANTS) {
    const glow = createCanvas(360, 260);
    const glowCtx = glow.getContext("2d");
    if (glowCtx) {
      const gradient = glowCtx.createRadialGradient(180, 170, 14, 180, 170, 170);
      gradient.addColorStop(0, `${pant.color}28`);
      gradient.addColorStop(.6, "rgba(255,242,211,.035)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      glowCtx.fillStyle = gradient;
      glowCtx.fillRect(0, 0, glow.width, glow.height);
    }
    pantGlows[pant.id] = glow;
  }
  return { vignette, danger, haze, pickupBeam, pantGlows };
}

function createArenaLayers(images: Record<string, HTMLImageElement>, cityId: CityId): ArenaLayers {
  const city = getCity(cityId);
  const far = createCanvas(BACKGROUND_W, WORLD_H);
  const near = createCanvas(BACKGROUND_W, WORLD_H);
  const street = createCanvas(WORLD_W, WORLD_H);
  const farCtx = far.getContext("2d");
  const nearCtx = near.getContext("2d");
  const streetCtx = street.getContext("2d");
  if (!farCtx || !nearCtx || !streetCtx) return { far, near, street };

  farCtx.imageSmoothingEnabled = false;
  nearCtx.imageSmoothingEnabled = false;
  streetCtx.imageSmoothingEnabled = false;
  farCtx.fillStyle = city.sky;
  farCtx.fillRect(0, 0, BACKGROUND_W, WORLD_H);
  const premiumCity = images["city-premium"];
  if (premiumCity && city.id !== "harbor") {
    farCtx.save();
    farCtx.filter = city.filter;
    const cityLift = Math.max(0, 505 - STREET_HORIZON);
    farCtx.drawImage(premiumCity, 0, -cityLift, BACKGROUND_W, WORLD_H);
    farCtx.restore();
  } else {
    CITY_LAYERS.forEach((_, index) => {
      const image = images[`city-${index}`];
      if (!image) return;
      const target = index < 7 ? farCtx : nearCtx;
      target.save();
      target.filter = city.filter;
      target.globalAlpha = index === 0 ? .72 : .88;
      target.drawImage(image, BACKGROUND_MARGIN - 70, 0, WORLD_W + 140, STREET_HORIZON + 42);
      target.restore();
    });
  }

  const skylineGrade = farCtx.createLinearGradient(0, 0, 0, STREET_HORIZON + 30);
  skylineGrade.addColorStop(0, city.id === "blackout" ? "rgba(0,0,0,.3)" : "rgba(3,8,16,.08)");
  skylineGrade.addColorStop(.7, "rgba(5,8,14,.02)");
  skylineGrade.addColorStop(1, city.id === "harbor" ? "rgba(255,154,61,.12)" : "rgba(0,0,0,.28)");
  farCtx.fillStyle = skylineGrade;
  farCtx.fillRect(0, 0, BACKGROUND_W, STREET_HORIZON + 30);

  const industrial = images.industrial;
  if (industrial) {
    nearCtx.save();
    nearCtx.globalAlpha = city.id === "harbor" ? .82 : city.id === "blackout" ? .28 : .2;
    nearCtx.filter = city.filter;
    nearCtx.drawImage(industrial, 128, 64, 64, 48, BACKGROUND_MARGIN + 54, STREET_HORIZON - 148, 176, 132);
    nearCtx.drawImage(industrial, 192, 144, 96, 48, BACKGROUND_MARGIN + 970, STREET_HORIZON - 120, 246, 112);
    nearCtx.restore();
  }

  nearCtx.save();
  nearCtx.translate(BACKGROUND_MARGIN, 0);
  if (city.id === "neon") {
    for (const sign of [{ x: 82, y: STREET_HORIZON - 134, w: 76, color: city.accentAlt }, { x: 1090, y: STREET_HORIZON - 174, w: 68, color: city.accent }]) {
      nearCtx.fillStyle = "rgba(5,8,14,.9)"; nearCtx.fillRect(sign.x, sign.y, sign.w, 38);
      nearCtx.strokeStyle = sign.color; nearCtx.lineWidth = 3; nearCtx.strokeRect(sign.x, sign.y, sign.w, 38);
      nearCtx.fillStyle = sign.color; nearCtx.globalAlpha = .74; nearCtx.fillRect(sign.x + 9, sign.y + 17, sign.w - 18, 4);
    }
  } else if (city.id === "harbor") {
    nearCtx.fillStyle = "rgba(255,179,71,.14)"; nearCtx.fillRect(0, STREET_HORIZON - 35, WORLD_W, 15);
    nearCtx.strokeStyle = city.accent; nearCtx.lineWidth = 3;
    for (let x = 46; x < WORLD_W; x += 154) { nearCtx.beginPath(); nearCtx.moveTo(x, STREET_HORIZON - 38); nearCtx.lineTo(x + 35, STREET_HORIZON - 15); nearCtx.stroke(); }
  } else {
    nearCtx.fillStyle = city.accent;
    for (const light of [{ x: 126, y: STREET_HORIZON - 102 }, { x: 628, y: STREET_HORIZON - 134 }, { x: 1138, y: STREET_HORIZON - 88 }]) {
      nearCtx.globalAlpha = .55; nearCtx.fillRect(light.x, light.y, 7, 7);
      nearCtx.globalAlpha = .12; nearCtx.fillRect(light.x - 14, light.y - 14, 35, 35);
    }
  }
  nearCtx.restore();

  const streetGradient = streetCtx.createLinearGradient(0, STREET_HORIZON, 0, WORLD_H);
  streetGradient.addColorStop(0, city.streetTop);
  streetGradient.addColorStop(.16, city.id === "neon" ? "#172333" : city.id === "harbor" ? "#242526" : "#11141b");
  streetGradient.addColorStop(1, city.streetBottom);
  streetCtx.fillStyle = streetGradient;
  streetCtx.fillRect(0, STREET_HORIZON, WORLD_W, WORLD_H - STREET_HORIZON);
  streetCtx.fillStyle = "rgba(2,4,8,.72)";
  streetCtx.fillRect(0, STREET_HORIZON, WORLD_W, 13);
  streetCtx.fillStyle = city.accent;
  streetCtx.globalAlpha = .42;
  streetCtx.fillRect(0, STREET_HORIZON + 13, WORLD_W, 3);
  streetCtx.globalAlpha = 1;

  streetCtx.strokeStyle = `${city.accent}24`;
  streetCtx.lineWidth = 2;
  const streetDepth = WORLD_H - STREET_HORIZON;
  for (const ratio of [.18, .38, .64, .94]) {
    const y = STREET_HORIZON + streetDepth * ratio;
    streetCtx.beginPath();
    streetCtx.moveTo(0, y);
    streetCtx.lineTo(WORLD_W, y);
    streetCtx.stroke();
  }
  for (let x = -80; x < WORLD_W + 90; x += 145) {
    streetCtx.beginPath();
    streetCtx.moveTo(WORLD_W / 2 + (x - WORLD_W / 2) * .17, STREET_HORIZON + 10);
    streetCtx.lineTo(x, WORLD_H);
    streetCtx.stroke();
  }

  for (const puddle of [{ x: 170, y: 555, w: 230 }, { x: 720, y: 622, w: 300 }, { x: 1050, y: 520, w: 170 }]) {
    streetCtx.fillStyle = `${city.accent}12`;
    streetCtx.strokeStyle = `${city.accentAlt}2b`;
    streetCtx.beginPath();
    streetCtx.ellipse(puddle.x, puddle.y, puddle.w / 2, 10, -.04, 0, Math.PI * 2);
    streetCtx.fill();
    streetCtx.stroke();
  }
  for (const pool of [{ x: 54, y: 508, color: city.accentAlt, width: 138 }, { x: 444, y: 512, color: city.accent, width: 154 }, { x: 1040, y: 510, color: city.accentAlt, width: 142 }]) {
    const glow = streetCtx.createRadialGradient(pool.x, pool.y, 2, pool.x, pool.y, pool.width);
    glow.addColorStop(0, `${pool.color}1f`); glow.addColorStop(1, "rgba(0,0,0,0)");
    streetCtx.fillStyle = glow; streetCtx.fillRect(pool.x - pool.width, pool.y - 40, pool.width * 2, 110);
  }

  if (city.id === "harbor") {
    streetCtx.save(); streetCtx.globalAlpha = .46; streetCtx.strokeStyle = city.accent; streetCtx.lineWidth = 9;
    for (let x = -60; x < 310; x += 42) { streetCtx.beginPath(); streetCtx.moveTo(x, 687); streetCtx.lineTo(x + 70, 638); streetCtx.stroke(); }
    streetCtx.restore();
  } else if (city.id === "blackout") {
    streetCtx.strokeStyle = "rgba(186,198,224,.18)"; streetCtx.lineWidth = 3;
    for (const crack of [{ x: 210, y: 584 }, { x: 814, y: 542 }, { x: 1120, y: 620 }]) {
      streetCtx.beginPath(); streetCtx.moveTo(crack.x, crack.y); streetCtx.lineTo(crack.x + 24, crack.y + 13); streetCtx.lineTo(crack.x + 9, crack.y + 31); streetCtx.lineTo(crack.x + 45, crack.y + 47); streetCtx.stroke();
    }
  }

  streetCtx.fillStyle = "rgba(190,209,224,.15)";
  for (let index = 0; index < 14; index += 1) {
    const x = 70 + ((index * 193) % 1130);
    const y = 488 + ((index * 47) % 188);
    streetCtx.save(); streetCtx.translate(x, y); streetCtx.rotate((index % 5 - 2) * .18); streetCtx.fillRect(-4, -1, 8 + (index % 3) * 4, 2); streetCtx.restore();
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
    && a.nearWeapon === b.nearWeapon
    && a.partnerHealth === b.partnerHealth
    && a.partnerMaxHealth === b.partnerMaxHealth
    && a.partnerName === b.partnerName
    && a.partnerPant === b.partnerPant
    && a.partnerConnected === b.partnerConnected;
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
  partnerHealth: 0,
  partnerMaxHealth: 100,
  partnerName: "FIGHTER 02",
  partnerPant: null,
  partnerConnected: false,
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

function nearestLivingEnemy(state: GameState, player: Player, range: number) {
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

function createPlayer(setup: FighterSetup, x: number): Player {
  return {
      id: setup.id,
      name: setup.name,
      pantId: setup.pantId,
      connected: true,
      x,
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
      facing: setup.id === "guest" ? -1 : 1,
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
      dashX: setup.id === "guest" ? -1 : 1,
      dashY: 0,
      dashTimer: 0,
      dashRewardReady: false,
      trailTimer: 0,
      vx: 0,
      vy: 0,
      inputX: 0,
      inputY: 0,
      animTime: 0,
      moveAmount: 0,
      hitFlash: 0,
      recoil: 0,
      slowTimer: 0,
      aimAngle: setup.id === "guest" ? Math.PI : 0,
      weapon: makeWeapon("fists"),
      nearPickupId: null,
  };
}

function createRunId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function freshRun(hostInput: PantId | FighterSetup, guest?: FighterSetup): GameState {
  const host: FighterSetup = typeof hostInput === "string"
    ? { id: "host", name: "FIGHTER 01", pantId: hostInput }
    : hostInput;
  const mode: GameMode = guest ? "coop" : "solo";
  const hostPlayer = createPlayer(host, WORLD_W / 2 - (guest ? 44 : 0));
  const players = guest ? [hostPlayer, createPlayer(guest, WORLD_W / 2 + 44)] : [hostPlayer];
  return {
    runId: createRunId(),
    mode,
    pantId: host.pantId,
    player: hostPlayer,
    players,
    enemies: [],
    projectiles: [],
    pickups: [
      { id: 1, x: 710, y: 505, weapon: makeWeapon("bat"), life: 999, bob: 0, pickupLock: 0 },
      ...(guest ? [{ id: 2, x: 570, y: 505, weapon: makeWeapon("knife"), life: 999, bob: 1.4, pickupLock: 0 }] : []),
    ],
    effects: [],
    audioEvents: [],
    wave: 1,
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    remainingBudget: budgetForWave(1, mode),
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
    damageFlash: 0,
    hitStop: 0,
    nextProjectileId: 1,
    nextPickupId: guest ? 3 : 2,
    killsSinceDrop: 0,
    waveSpawnCount: 0,
  };
}

function addEffect(state: GameState, effect: Omit<Effect, "maxLife">) {
  if (state.effects.length >= MAX_EFFECTS) state.effects.splice(0, state.effects.length - MAX_EFFECTS + 1);
  state.effects.push({ ...effect, maxLife: effect.life });
}

function tickEffects(state: GameState, dt: number) {
  let writeIndex = 0;
  for (let index = 0; index < state.effects.length; index += 1) {
    const effect = state.effects[index];
    effect.life -= dt;
    if (effect.life > 0) state.effects[writeIndex++] = effect;
  }
  state.effects.length = writeIndex;
}

function emitZombieSound(state: GameState, sound: ZombieSoundId, x: number, entityId?: number, volume?: number) {
  if (state.audioEvents.length >= 24) return;
  state.audioEvents.push({ sound, x, entityId, volume });
}

function emitGameCue(state: GameState, cue: GameCueId, x: number, volume?: number, intensity?: number) {
  if (state.audioEvents.length >= 24) return;
  state.audioEvents.push({ cue, x, volume, intensity });
}

function chooseEnemyKind(state: GameState, forcedElite: boolean) {
  const livingByKind: Record<EnemyKind, number> = { thug: 0, runner: 0, brute: 0, thrower: 0, walker: 0 };
  for (const enemy of state.enemies) if (!enemy.dead) livingByKind[enemy.kind] += 1;
  const forceHordeArrival = (state.wave === 8 && state.waveSpawnCount < 4)
    || (state.wave > 8 && state.waveSpawnCount < Math.min(3, 1 + Math.floor((state.wave - 8) / 4)));
  if (forcedElite && state.wave === 5 && ENEMIES.brute.cost <= state.remainingBudget + .3) return "brute";
  if (forceHordeArrival && ENEMIES.walker.cost <= state.remainingBudget + .3) return "walker";

  let totalWeight = 0;
  const weightedKinds: Array<{ kind: EnemyKind; weight: number }> = [];
  for (const kind of ENEMY_KINDS) {
    const def = ENEMIES[kind];
    if (def.unlock > state.wave || def.cost > state.remainingBudget + .3) continue;
    let weight = kind === "thug" ? (state.wave < 8 ? 5 : 2.4)
      : kind === "runner" ? 3.2
        : kind === "brute" ? (livingByKind.brute >= 2 ? 0 : 1.25 + Math.min(1.1, state.wave * .035))
          : kind === "thrower" ? (livingByKind.thrower >= 2 ? 0 : 1.15)
            : 2.8 + Math.min(3.2, Math.max(0, state.wave - 8) * .24);
    if (forcedElite && (kind === "brute" || kind === "walker")) weight *= 2.2;
    if (weight <= 0) continue;
    totalWeight += weight;
    weightedKinds.push({ kind, weight });
  }
  if (weightedKinds.length === 0) return "thug";
  let roll = Math.random() * totalWeight;
  for (const entry of weightedKinds) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return weightedKinds[weightedKinds.length - 1].kind;
}

function spawnEnemy(state: GameState) {
  const forcedElite = state.wave % 5 === 0 && state.waveSpawnCount === 0;
  const kind = chooseEnemyKind(state, forcedElite);
  const def = ENEMIES[kind];
  const side = Math.random() > 0.5 ? 1 : -1;
  const elite = forcedElite || (state.wave >= 5 && Math.random() < Math.min(0.36, 0.035 * Math.floor(state.wave / 5)));
  const healthScale = 1 + 0.075 * (state.wave - 1) + 0.0015 * Math.pow(state.wave - 1, 1.55);
  const hp = Math.round(def.hp * healthScale * (state.mode === "coop" ? 1.2 : 1) * (elite ? 1.8 : 1));
  const enemyId = state.nextEnemyId++;
  const spawnX = side < 0 ? ARENA.left - 30 : ARENA.right + 30;
  let spawnY = ARENA.top + 70 + Math.random() * (ARENA.bottom - ARENA.top - 70);
  let bestClearance = -1;
  for (let sample = 0; sample < 4; sample += 1) {
    const candidateY = ARENA.top + 70 + Math.random() * (ARENA.bottom - ARENA.top - 70);
    let clearance = 999;
    for (const other of state.enemies) {
      const sameEntrance = other.state === "enter" && (side < 0 ? other.x < WORLD_W / 2 : other.x >= WORLD_W / 2);
      if (sameEntrance) clearance = Math.min(clearance, Math.abs(candidateY - other.y));
    }
    if (clearance > bestClearance) { bestClearance = clearance; spawnY = candidateY; }
  }
  state.enemies.push({
    id: enemyId,
    kind,
    x: spawnX,
    y: spawnY,
    hp,
    maxHp: hp,
    speed: def.speed * Math.min(1.3, 1 + 0.008 * (state.wave - 1)),
    damage: def.damage * Math.min(2.6, 1 + 0.035 * (state.wave - 1)) * (state.mode === "coop" ? 1.08 : 1) * (elite ? 1.25 : 1),
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
    targetPlayerId: state.players[enemyId % state.players.length]?.id ?? "host",
  });
  const entranceX = side < 0 ? ARENA.left + 6 : ARENA.right - 6;
  addEffect(state, { x: entranceX, y: spawnY + 3, life: 0.46, color: elite ? COLORS.elite : kind === "walker" ? COLORS.toxic : def.color, radius: enemyId % 2 ? 32 : 38, seed: enemyId, kind: "dust" });
  addEffect(state, { x: entranceX, y: spawnY + 4, life: 0.34, color: elite ? COLORS.elite : "rgba(216,226,239,.5)", radius: enemyId % 2 ? 24 : 30, kind: "ring" });
  if (kind === "walker") emitZombieSound(state, "spawn", spawnX, enemyId, elite ? 0.62 : 0.44);
  state.waveSpawnCount += 1;
  state.remainingBudget -= def.cost;
}

function damagePlayer(state: GameState, player: Player, amount: number, source?: Enemy) {
  if (state.gameOverTimer > 0) return;
  if (player.invuln > 0) {
    if (player.action === "dash" && player.dashRewardReady) {
      player.dashRewardReady = false;
      player.abilityCd = Math.max(0, player.abilityCd - .75);
      state.comboTimer = Math.max(state.comboTimer, 2.5);
      addEffect(state, { x: player.x, y: player.y - 86, life: .72, color: COLORS.score, text: "PERFECT DODGE", kind: "text" });
      addEffect(state, { x: player.x, y: player.y, life: .4, color: COLORS.score, radius: 52, strength: 1.1, kind: "ring" });
      emitGameCue(state, "pickup", player.x, .48, 1.1);
    }
    return;
  }
  const guarded = player.pantId === "guard" && player.abilityTimer > 0;
  const dealt = amount * (guarded ? 0.35 : 1);
  player.hp = Math.max(0, player.hp - dealt);
  const defeated = player.hp <= 0;
  player.invuln = 0.55;
  if (!guarded) {
    state.combo = 0;
    state.comboTimer = 0;
  }
  state.cameraTrauma = Math.max(state.cameraTrauma, guarded ? 0.22 : 0.58);
  state.cameraZoom = Math.max(state.cameraZoom, guarded ? 0.01 : 0.028);
  state.cameraFocusX = player.x;
  state.cameraFocusY = player.y - 40;
  state.damageFlash = Math.max(state.damageFlash, guarded ? 0.2 : defeated ? 1 : 0.62);
  state.hitStop = Math.max(state.hitStop, guarded ? 0.025 : 0.06);
  player.hitFlash = 0.16;
  player.action = defeated ? "dead" : "hurt";
  player.actionTime = 0;
  player.actionDuration = defeated ? 0.78 : guarded ? 0.09 : 0.2;
  if (defeated) {
    player.invuln = 999;
    if (state.players.filter((fighter) => fighter.connected).every((fighter) => fighter.hp <= 0)) {
      state.gameOverTimer = 0.78;
    } else {
      addEffect(state, { x: player.x, y: player.y - 94, life: .9, color: COLORS.danger, text: "DOWN — CLEAR WAVE TO REVIVE", kind: "text" });
    }
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
  emitGameCue(state, "playerHurt", player.x, guarded ? .52 : .78, defeated ? 1.4 : guarded ? .55 : 1);
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
  emitGameCue(state, "impact", enemy.x, enemy.elite ? .72 : .5, enemy.elite ? 1.3 : Math.min(1.15, .72 + knockback / 900));
  if (enemy.hp <= 0) defeatEnemy(state, enemy);
  return true;
}

function triggerAbility(state: GameState, player: Player) {
  if (player.abilityCd > 0) return;
  const pant = getPant(player.pantId);
  const pantColor = pant.color;
  const chainTargets = player.pantId === "chain"
    ? state.enemies
      .filter((enemy) => !enemy.dead && distanceSquared(player.x, player.y, enemy.x, enemy.y) < 360 * 360)
      .sort((a, b) => distanceSquared(player.x, player.y, a.x, a.y) - distanceSquared(player.x, player.y, b.x, b.y))
      .slice(0, 5)
    : [];
  if (player.pantId === "chain" && chainTargets.length === 0) {
    addEffect(state, { x: player.x, y: player.y - 80, life: 0.55, color: pantColor, text: "NO TARGET", kind: "text" });
    return;
  }
  player.abilityCd = pant.cooldown * player.cooldownMult;
  if (player.pantId === "ghost") {
    player.abilityTimer = 2.25;
    player.invuln = Math.max(player.invuln, 2.25);
    player.ghostPrimed = true;
    addEffect(state, { x: player.x, y: player.y, life: 0.8, color: pantColor, radius: 90, kind: "ring" });
  } else if (player.pantId === "chain") {
    chainTargets.forEach((enemy, index) => {
      hitEnemy(state, enemy, 48 * player.damageMult, 0.9, 80, player.x, player.y);
      addEffect(state, { x: enemy.x, y: enemy.y - 35, life: 0.35 + index * 0.05, color: pantColor, radius: 34, kind: "bolt" });
    });
    addEffect(state, { x: player.x, y: player.y - 40, life: 0.5, color: pantColor, radius: 260, kind: "ring" });
  } else if (player.pantId === "guard") {
    player.abilityTimer = 4;
    state.enemies.forEach((enemy) => {
      if (!enemy.dead && distance(player.x, player.y, enemy.x, enemy.y) < 190) {
        hitEnemy(state, enemy, 28 * player.damageMult, 0.55, 520, player.x, player.y);
      }
    });
    addEffect(state, { x: player.x, y: player.y, life: 0.7, color: pantColor, radius: 190, kind: "ring" });
  } else {
    player.abilityTimer = 5;
    addEffect(state, { x: player.x, y: player.y, life: 0.8, color: pantColor, radius: 120, kind: "ring" });
  }
}

function beginReload(state: GameState, player: Player) {
  const definition = WEAPONS[player.weapon.kind];
  if (!definition.firearm || player.weapon.ammo >= definition.magazine || player.weapon.reserve <= 0) return;
  if (player.action === "dash" || player.action === "hurt") return;
  player.action = "reload";
  player.actionTime = 0;
  player.actionDuration = definition.reload;
  player.attackSpec = null;
  player.attackResolved = false;
  emitGameCue(state, "reload", player.x, .42, player.weapon.kind === "shotgun" ? 1.15 : .82);
}

function beginAttack(state: GameState, player: Player) {
  if (player.action !== "idle") {
    player.attackBuffer = 0.12;
    return;
  }
  const definition = WEAPONS[player.weapon.kind];
  if (definition.firearm && player.weapon.ammo <= 0) {
    beginReload(state, player);
    return;
  }
  const comboLength = definition.attacks.length;
  player.comboStep = player.comboWindow > 0 ? (player.comboStep + 1) % comboLength : 0;
  player.comboWindow = 0.78;
  const baseSpec = definition.attacks[player.comboStep] ?? definition.attacks[0];
  const surge = player.pantId === "surge" && player.abilityTimer > 0;
  const speed = surge ? 1.45 : 1;
  const spec = {
    ...baseSpec,
    startup: baseSpec.startup / speed,
    active: baseSpec.active / speed,
    recovery: baseSpec.recovery / speed,
  };
  const target = nearestLivingEnemy(state, player, spec.range * player.rangeMult);
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

function resolvePlayerAttack(state: GameState, player: Player) {
  const spec = player.attackSpec;
  if (!spec || player.attackResolved) return;
  player.attackResolved = true;
  const definition = WEAPONS[player.weapon.kind];
  const ghostHit = player.pantId === "ghost" && player.ghostPrimed;

  if (definition.firearm) {
    if (player.weapon.ammo <= 0) return;
    player.weapon.ammo -= 1;
    const ghostMultiplier = ghostHit ? (player.weapon.kind === "shotgun" ? 1.45 : 2.25) : 1;
    if (player.weapon.kind === "shotgun") {
      const muzzleX = player.x + Math.cos(player.aimAngle) * 46;
      const muzzleY = player.y - 57 + Math.sin(player.aimAngle) * 22;
      const forwardX = Math.cos(player.aimAngle);
      const forwardY = Math.sin(player.aimAngle);
      const minDot = Math.cos(((spec.spread ?? 28) * Math.PI) / 360);
      const targets = state.enemies
        .filter((enemy) => {
          if (enemy.dead) return false;
          const dx = enemy.x - player.x;
          const dy = (enemy.y - player.y) * 1.12;
          const length = Math.hypot(dx, dy) || 1;
          return length <= spec.range + enemy.radius && (dx / length) * forwardX + (dy / length) * forwardY >= minDot;
        })
        .sort((a, b) => distanceSquared(player.x, player.y, a.x, a.y) - distanceSquared(player.x, player.y, b.x, b.y))
        .slice(0, spec.maxTargets);
      for (const enemy of targets) {
        const falloff = clamp(1 - distance(player.x, player.y, enemy.x, enemy.y) / (spec.range * 1.9), .72, 1);
        hitEnemy(state, enemy, spec.damage * player.damageMult * ghostMultiplier * falloff, spec.stun, spec.knockback, player.x, player.y, spec.hitStop);
      }
      addEffect(state, { x: muzzleX, y: muzzleY, life: .12, color: COLORS.bullet, radius: spec.range, angle: player.aimAngle, strength: 1.2, seed: state.wave * 31 + state.kills * 7 + player.weapon.ammo, kind: "tracer" });
      player.recoil = 1;
      emitGameCue(state, "gun", player.x, .92, 1.4);
      addEffect(state, { x: muzzleX, y: muzzleY, life: .1, color: COLORS.muzzle, radius: 30, angle: player.aimAngle, strength: 1.5, kind: "muzzle" });
      if (ghostHit) {
        player.ghostPrimed = false;
        player.abilityTimer = 0;
      }
      return;
    }
    const pellets = spec.pellets ?? 1;
    for (let pellet = 0; pellet < pellets; pellet += 1) {
      const spread = ((Math.random() - 0.5) * (spec.spread ?? 0) * Math.PI) / 180;
      const angle = player.aimAngle + spread;
      const speed = spec.bulletSpeed ?? 1000;
      const muzzleX = player.x + Math.cos(angle) * 44;
      const muzzleY = player.y - 57 + Math.sin(angle) * 22;
      state.projectiles.push({
        id: state.nextProjectileId++,
        owner: "player",
        kind: "bullet",
        x: muzzleX,
        y: muzzleY,
        prevX: muzzleX,
        prevY: muzzleY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: spec.damage * player.damageMult * ghostMultiplier,
        knockback: spec.knockback,
        life: spec.projectileLife ?? 0.7,
        radius: 5,
        penetration: 0,
      });
    }
    if (state.projectiles.length > 160) state.projectiles.splice(0, state.projectiles.length - 160);
    player.recoil = 1;
    emitGameCue(state, "gun", player.x, .68, .9);
    addEffect(state, { x: player.x + Math.cos(player.aimAngle) * 52, y: player.y - 57 + Math.sin(player.aimAngle) * 20, life: 0.1, color: COLORS.muzzle, radius: 17, angle: player.aimAngle, strength: 1, kind: "muzzle" });
    if (ghostHit) {
      player.ghostPrimed = false;
      player.abilityTimer = 0;
    }
    return;
  }

  const range = spec.range * player.rangeMult;
  emitGameCue(state, "swing", player.x, player.weapon.kind === "bat" ? .65 : .42, player.weapon.kind === "bat" ? 1.25 : player.weapon.kind === "knife" ? .75 : .9);
  const forwardX = Math.cos(player.aimAngle);
  const forwardY = Math.sin(player.aimAngle);
  const lunge = player.weapon.kind === "fists" ? [16, 20, 29][player.comboStep] ?? 16
    : player.weapon.kind === "knife" ? [20, 26][player.comboStep] ?? 20
      : player.weapon.kind === "bat" ? 14 : 0;
  player.x = clamp(player.x + forwardX * lunge, ARENA.left, ARENA.right);
  player.y = clamp(player.y + forwardY * lunge * .72, ARENA.top, ARENA.bottom);
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
  const maxTargets = player.pantId === "surge" && player.abilityTimer > 0 ? spec.maxTargets + 1 : spec.maxTargets;
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
  addEffect(state, { x: player.x + forwardX * range * 0.52, y: player.y - 48 + forwardY * range * 0.34, life: 0.18, color: getPant(player.pantId).color, radius: range * 0.56, angle: player.aimAngle, strength: player.weapon.kind === "bat" ? 1.35 : player.weapon.kind === "knife" ? 0.82 : 1, kind: "slash" });
  if (targets.length > 0 && (player.weapon.kind === "bat" || (player.weapon.kind === "fists" && player.comboStep === 2))) {
    addEffect(state, { x: player.x + forwardX * 34, y: player.y + 5, life: .34, color: "#9ba7b7", radius: 32, strength: 1.2, seed: state.kills + state.combo, kind: "dust" });
  }
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

function beginDash(state: GameState, player: Player, mx: number, my: number) {
  if (player.dashCd > 0 || player.action === "hurt") return;
  const length = Math.hypot(mx, my);
  player.dashX = length > 0.1 ? mx / length : player.facing;
  player.dashY = length > 0.1 ? my / length : 0;
  player.action = "dash";
  player.actionTime = 0;
  player.actionDuration = 0.16;
  player.dashTimer = 0.16;
  player.dashRewardReady = true;
  player.trailTimer = 0;
  player.attackSpec = null;
  player.attackResolved = false;
  player.dashCd = 1.05;
  player.invuln = Math.max(player.invuln, 0.18);
  addEffect(state, { x: player.x, y: player.y + 4, life: 0.32, color: getPant(player.pantId).color, radius: 32, angle: Math.atan2(player.dashY, player.dashX), strength: 1, seed: state.wave + state.kills, kind: "dust" });
}

function swapWeapon(state: GameState, player: Player) {
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
    let restored = 0;
    if (definition.firearm) {
      const before = player.weapon.reserve;
      player.weapon.reserve = Math.min(definition.magazine * 4, player.weapon.reserve + pickup.weapon.ammo + pickup.weapon.reserve);
      restored = player.weapon.reserve - before;
    } else {
      const before = player.weapon.durability;
      player.weapon.durability = Math.min(definition.maxDurability, player.weapon.durability + pickup.weapon.durability);
      restored = player.weapon.durability - before;
    }
    addEffect(state, { x: pickup.x, y: pickup.y - 72, life: .68, color: COLORS.score, text: definition.firearm ? `AMMO +${restored}` : `DURABILITY +${restored}`, kind: "text" });
    addEffect(state, { x: pickup.x, y: pickup.y, life: .42, color: COLORS.score, radius: 42, kind: "ring" });
    emitGameCue(state, "pickup", pickup.x, .62, 1);
    state.pickups.splice(pickupIndex, 1);
    return;
  }
  const previous = player.weapon;
  player.weapon = { ...pickup.weapon };
  state.pickups.splice(pickupIndex, 1);
  dropWeaponAt(state, player.x - player.facing * 72, player.y + 4, previous, 0.45);
  addEffect(state, { x: player.x, y: player.y - 92, life: .72, color: COLORS.score, text: `${WEAPONS[player.weapon.kind].label} EQUIPPED`, kind: "text" });
  addEffect(state, { x: player.x, y: player.y, life: .42, color: COLORS.score, radius: 46, kind: "ring" });
  emitGameCue(state, "pickup", player.x, .68, 1.1);
  player.comboStep = 0;
  player.comboWindow = 0;
}

const EMPTY_KEYS = new Set<string>();

function findEnemyTarget(state: GameState, enemy: Enemy) {
  const living = state.players.filter((fighter) => fighter.connected && fighter.hp > 0);
  const assigned = living.find((fighter) => fighter.id === enemy.targetPlayerId);
  if (assigned) return assigned;
  const next = living[enemy.id % Math.max(1, living.length)] ?? state.player;
  enemy.targetPlayerId = next.id;
  return next;
}

function updatePlayer(
  state: GameState,
  player: Player,
  dt: number,
  keys: Set<string>,
  actions: PlayerInputState,
) {
  if (!player.connected || player.hp <= 0) {
    player.attackHeld = false;
    return;
  }
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.abilityCd = Math.max(0, player.abilityCd - dt);
  const abilityWasActive = player.abilityTimer > 0;
  player.abilityTimer = Math.max(0, player.abilityTimer - dt);
  if (player.pantId === "ghost" && abilityWasActive && player.abilityTimer === 0) player.ghostPrimed = false;
  player.invuln = Math.max(0, player.invuln - dt);
  player.slowTimer = Math.max(0, player.slowTimer - dt);
  player.comboWindow = Math.max(0, player.comboWindow - dt);
  player.attackBuffer = Math.max(0, player.attackBuffer - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  player.recoil = Math.max(0, player.recoil - dt * 8);

  let targetX = actions.dx + (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  let targetY = actions.dy + (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  const targetLength = Math.hypot(targetX, targetY);
  if (targetLength > 1) { targetX /= targetLength; targetY /= targetLength; }
  const inputBlend = 1 - Math.exp(-dt * 22);
  player.inputX += (targetX - player.inputX) * inputBlend;
  player.inputY += (targetY - player.inputY) * inputBlend;
  let mx = player.inputX;
  let my = player.inputY;
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
  if (nearestPickup && nearestPickup.life > 900 && player.weapon.kind === "fists" && nearestPickupDistance < 36 * 36) swapWeapon(state, player);

  if (actions.swap && player.action === "idle") swapWeapon(state, player);
  actions.swap = false;
  if (actions.reload) beginReload(state, player);
  actions.reload = false;
  if (actions.dash) beginDash(state, player, mx, my);
  actions.dash = false;
  if (actions.ability && player.action !== "hurt") triggerAbility(state, player);
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
      addEffect(state, { x: player.x - player.dashX * 28, y: player.y, life: 0.22, color: getPant(player.pantId).color, radius: 42, kind: "trail" });
    }
    if (player.actionTime >= player.actionDuration) {
      player.action = "idle";
      player.dashTimer = 0;
      player.dashRewardReady = false;
    }
  } else {
    const ghostSpeed = player.pantId === "ghost" && player.abilityTimer > 0 ? 1.35 : 1;
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
      if (!player.attackResolved && previousTime < player.attackSpec.startup && player.actionTime >= player.attackSpec.startup) resolvePlayerAttack(state, player);
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
  if (player.action === "idle" && (attackPressed || player.attackBuffer > 0)) beginAttack(state, player);
}

function updateGame(
  state: GameState,
  dt: number,
  keys: Set<string>,
  actions: PlayerInputState,
  remoteActions?: PlayerInputState,
) {
  state.elapsed += dt;
  state.cameraPhase += dt * 52;
  state.cameraTrauma = Math.max(0, state.cameraTrauma - dt * 1.7);
  state.cameraZoom = Math.max(0, state.cameraZoom - dt * 0.1);
  state.screenFlash = Math.max(0, state.screenFlash - dt * 1.5);
  state.damageFlash = Math.max(0, state.damageFlash - dt * 2.7);
  if (state.gameOverTimer > 0) {
    state.gameOverTimer = Math.max(0, state.gameOverTimer - dt);
    for (const fighter of state.players) fighter.actionTime = Math.min(fighter.actionDuration, fighter.actionTime + dt);
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
  const surgeActive = state.players.some((fighter) => fighter.connected && fighter.hp > 0 && fighter.pantId === "surge" && fighter.abilityTimer > 0);
  if (!surgeActive) state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer === 0) state.combo = 0;
  updatePlayer(state, state.player, dt, keys, actions);
  const guest = state.players.find((fighter) => fighter.id === "guest");
  if (guest && remoteActions) updatePlayer(state, guest, dt, EMPTY_KEYS, remoteActions);

  if (state.introTimer > 0 && state.waveClearTimer <= 0) state.introTimer = Math.max(0, state.introTimer - dt);
  const maxAlive = Math.min(18, (state.mode === "coop" ? 8 : 5) + Math.floor(state.wave / 2));
  let livingCount = 0;
  let livingWalkers = 0;
  let attackingEnemies = 0;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    livingCount += 1;
    if (enemy.kind === "walker") livingWalkers += 1;
    if (enemy.state === "windup" || enemy.state === "active") attackingEnemies += 1;
  }
  state.spawnTimer -= dt;
  if (livingCount === 0 && state.remainingBudget > 0.15 && state.introTimer <= 0) state.spawnTimer = Math.min(state.spawnTimer, 0.34);
  if (state.introTimer <= 0 && state.remainingBudget > 0.15 && state.spawnTimer <= 0 && livingCount < maxAlive) {
    spawnEnemy(state);
    state.spawnTimer = Math.max(state.mode === "coop" ? 0.28 : 0.36, (1.2 - 0.035 * (state.wave - 1)) * (state.mode === "coop" ? 0.82 : 1));
  }

  const attackLimit = state.mode === "coop"
    ? Math.min(7, 3 + Math.floor((state.wave + 1) / 4))
    : Math.min(5, 1 + Math.floor((state.wave + 1) / 4));
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
    const player = findEnemyTarget(state, enemy);
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
        } else if (enemy.kind === "brute" && enemy.elite) {
          for (const fighter of state.players) {
            if (!fighter.connected || fighter.hp <= 0) continue;
            const slamX = (fighter.x - enemy.x) / 148;
            const slamY = (fighter.y - enemy.y) / 62;
            if (slamX * slamX + slamY * slamY <= 1) damagePlayer(state, fighter, enemy.damage, enemy);
          }
          addEffect(state, { x: enemy.x, y: enemy.y + 4, life: .48, color: COLORS.elite, radius: 94, strength: 1.45, seed: enemy.id, kind: "ring" });
          addEffect(state, { x: enemy.x, y: enemy.y + 4, life: .42, color: "#8f99a8", radius: 72, strength: 1.5, seed: enemy.id * 13, kind: "dust" });
          state.cameraTrauma = Math.max(state.cameraTrauma, .58);
          emitGameCue(state, "impact", enemy.x, .78, 1.35);
        } else {
          const strikeX = enemy.x + enemy.attackX * definition.attackRange * 0.86;
          const strikeY = enemy.y + enemy.attackY * definition.attackRange * 0.72;
          const hitRadius = 28 + enemy.radius * 0.42;
          if (segmentPointDistanceSquared(activeStartX, activeStartY, strikeX, strikeY, player.x, player.y) < hitRadius * hitRadius) {
            damagePlayer(state, player, enemy.damage, enemy);
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
          enemy.stateDuration = Math.max(MIN_WINDUPS[enemy.kind], definition.windup * Math.max(0.78, 1 - state.wave * 0.006));
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
        const formationOffset = (((enemy.id * 37) % 7) - 3) * 24;
        const formationDy = clamp(player.y + formationOffset, ARENA.top + 20, ARENA.bottom - 10) - enemy.y;
        const approachLength = Math.hypot(dx, formationDy) || 1;
        const packSpeed = enemy.kind === "walker" ? Math.min(1.36, 1.08 + livingWalkers * .025) : 1;
        if (length > attackRange) {
          enemy.x += (dx / approachLength) * enemy.speed * packSpeed * dt;
          enemy.y += (formationDy / approachLength) * enemy.speed * packSpeed * 0.72 * dt;
        } else if (enemy.attackCd <= 0 && attackingEnemies < attackLimit) {
          enemy.state = "windup";
          enemy.stateTimer = 0;
          enemy.stateDuration = Math.max(MIN_WINDUPS[enemy.kind], definition.windup * Math.max(0.78, 1 - state.wave * 0.006));
          enemy.windup = enemy.stateDuration;
          enemy.attackX = dx / length;
          enemy.attackY = dy / length;
          enemy.attackFacing = dx >= 0 ? 1 : -1;
          enemy.facing = enemy.attackFacing;
          if (enemy.kind === "walker") emitZombieSound(state, "attack", enemy.x, enemy.id);
          enemy.attackCd = (enemy.kind === "brute" ? 1.65 : 1.05) * aggression;
          attackingEnemies += 1;
        } else if (attackingEnemies >= attackLimit) {
          enemy.x += (-dy / length) * enemy.speed * .36 * dt * (enemy.id % 2 ? 1 : -1);
          enemy.y += (dx / length) * enemy.speed * .24 * dt * (enemy.id % 2 ? 1 : -1);
        }
      }
    }
    enemy.x = clamp(enemy.x, ARENA.left - 45, ARENA.right + 45);
    enemy.y = clamp(enemy.y, ARENA.top, ARENA.bottom);
  }

  solidEnemiesScratch.length = 0;
  for (const enemy of state.enemies) if (!enemy.dead) solidEnemiesScratch.push(enemy);
  const solidEnemies = solidEnemiesScratch;
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
      for (const fighter of state.players) {
        if (!fighter.connected || fighter.hp <= 0) continue;
        if (segmentPointDistanceSquared(projectile.prevX, projectile.prevY, projectile.x, projectile.y, fighter.x, fighter.y - 44) < hitRadius * hitRadius) {
          damagePlayer(state, fighter, projectile.damage);
          projectile.life = 0;
          break;
        }
      }
    } else {
      for (const enemy of solidEnemies) {
        if (enemy.dead) continue;
        const hitRadius = enemy.radius * 0.72 + projectile.radius;
        if (segmentPointDistanceSquared(projectile.prevX, projectile.prevY, projectile.x, projectile.y, enemy.x, enemy.y - 48) < hitRadius * hitRadius) {
          const connected = hitEnemy(state, enemy, projectile.damage, projectile.kind === "pellet" ? 0.1 : 0.14, projectile.knockback, projectile.prevX, projectile.prevY, projectile.kind === "pellet" ? 0.025 : 0.04);
          if (connected) {
            projectile.penetration -= 1;
            if (projectile.penetration < 0) projectile.life = 0;
            break;
          }
        }
      }
    }
  }
  let projectileWrite = 0;
  for (let index = 0; index < state.projectiles.length; index += 1) {
    const projectile = state.projectiles[index];
    if (projectile.life > 0 && projectile.x > -80 && projectile.x < WORLD_W + 80 && projectile.y > -80 && projectile.y < WORLD_H + 80) {
      state.projectiles[projectileWrite++] = projectile;
    }
  }
  state.projectiles.length = projectileWrite;
  let enemyWrite = 0;
  for (let index = 0; index < state.enemies.length; index += 1) {
    const enemy = state.enemies[index];
    if (!enemy.dead || enemy.stateTimer < enemy.stateDuration) state.enemies[enemyWrite++] = enemy;
  }
  state.enemies.length = enemyWrite;
  for (const pickup of state.pickups) {
    pickup.life -= dt;
    pickup.bob += dt * 4;
    pickup.pickupLock = Math.max(0, pickup.pickupLock - dt);
  }
  let pickupWrite = 0;
  for (let index = 0; index < state.pickups.length; index += 1) {
    const pickup = state.pickups[index];
    if (pickup.life > 0) state.pickups[pickupWrite++] = pickup;
  }
  state.pickups.length = pickupWrite;
  tickEffects(state, dt);

  if (state.players.some((fighter) => fighter.connected && fighter.hp > 0) && state.gameOverTimer === 0 && state.remainingBudget <= 0.15 && !state.enemies.some((enemy) => !enemy.dead) && state.introTimer <= 0) {
    const clearedWave = state.wave;
    const clearBonus = 200 + 50 * clearedWave;
    state.score += clearBonus;
    for (const fighter of state.players) {
      if (!fighter.connected) continue;
      const healthBefore = fighter.hp;
      if (fighter.hp <= 0) {
        fighter.hp = Math.ceil(fighter.maxHp * .4);
        fighter.action = "idle";
        fighter.actionTime = 0;
        fighter.invuln = 1.8;
        fighter.slowTimer = 0;
        addEffect(state, { x: fighter.x, y: fighter.y - 96, life: .9, color: "#62d6a2", text: "REVIVED", kind: "text" });
      } else {
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + fighter.waveHeal);
        const healed = Math.ceil(fighter.hp - healthBefore);
        if (healed > 0) addEffect(state, { x: fighter.x, y: fighter.y - 96, life: 0.76, color: "#62d6a2", text: `+${healed} HP`, kind: "text" });
      }
    }
    state.projectiles = [];
    state.wave += 1;
    state.remainingBudget = budgetForWave(state.wave, state.mode);
    state.waveSpawnCount = 0;
    state.spawnTimer = 0.8;
    state.introTimer = 1.9;
    state.waveClearTimer = 0.92;
    state.upgradeAfterClear = clearedWave % 3 === 0;
    state.cameraTrauma = Math.max(state.cameraTrauma, 0.22);
    state.cameraZoom = Math.max(state.cameraZoom, 0.014);
    state.cameraFocusX = WORLD_W / 2;
    state.cameraFocusY = 380;
    if (state.wave === 8) state.screenFlash = 0.72;
    emitGameCue(state, "waveClear", WORLD_W / 2, .72, clearedWave % 5 === 0 ? 1.3 : 1);
    addEffect(state, { x: WORLD_W / 2, y: 350, life: 0.84, color: COLORS.score, text: `WAVE ${clearedWave} CLEARED`, kind: "text" });
    addEffect(state, { x: WORLD_W / 2, y: 398, life: 0.8, color: COLORS.paper, text: `CLEAR +${clearBonus}`, kind: "text" });
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

function drawOutlinedLimb(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  outline = "#080b11",
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = outline;
  ctx.lineWidth = width + 5;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawArticulatedPants(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  stride: number,
  planted: boolean,
  hitFlash: boolean,
  accent: string,
) {
  const sourceW = image.naturalWidth || image.width;
  const sourceH = image.naturalHeight || image.height;
  const gait = planted ? 0 : clamp(stride / 10, -1, 1);
  const filter = hitFlash ? "brightness(2.15) saturate(.25)" : "saturate(.92) contrast(1.2) brightness(.97)";
  const drawLeg = (side: number) => {
    const sourceX = side < 0 ? sourceW * .015 : sourceW * .485;
    ctx.save();
    ctx.translate(side * 13, -40);
    ctx.rotate(side * gait * .085);
    ctx.filter = filter;
    ctx.drawImage(image, sourceX, sourceH * .265, sourceW * .5, sourceH * .735, -19, -3, 38, 62);
    ctx.filter = "none";
    ctx.globalAlpha = .42;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(side * 5, 4); ctx.lineTo(side * 7, 50); ctx.stroke();
    ctx.restore();
  };
  drawLeg(-1);
  drawLeg(1);
  ctx.save();
  ctx.filter = filter;
  ctx.drawImage(image, 0, 0, sourceW, sourceH * .43, -33, -53, 66, 37);
  ctx.restore();
}

function drawFighter(ctx: CanvasRenderingContext2D, state: GameState, images: Record<string, HTMLImageElement>, reducedMotion: boolean, player = state.player) {
  const weaponKind = player.weapon.kind;
  const firearm = WEAPONS[weaponKind].firearm;
  const comboSide = player.comboStep % 2 === 0 ? 1 : -1;
  const movingPose = player.action === "idle" || player.action === "dash";
  const stride = reducedMotion || !movingPose ? 0 : Math.sin(player.animTime) * 10 * player.moveAmount * (player.action === "dash" ? 0 : 1);
  const breath = reducedMotion ? 0 : Math.sin(player.animTime * .42) * 1.5 * (1 - player.moveAmount);
  const bob = (reducedMotion || !movingPose ? 0 : Math.abs(Math.sin(player.animTime)) * -3 * player.moveAmount) + breath;
  let strike = 0;
  let anticipation = 0;
  let recovery = 0;
  if (player.action === "attack" && player.attackSpec) {
    const spec = player.attackSpec;
    if (player.actionTime < spec.startup) {
      const t = clamp(player.actionTime / Math.max(0.01, spec.startup), 0, 1);
      anticipation = 1 - Math.pow(1 - t, 3);
      strike = -0.65 * (1 - Math.pow(1 - t, 3));
    } else if (player.actionTime < spec.startup + spec.active) {
      const t = clamp((player.actionTime - spec.startup) / Math.max(0.01, spec.active), 0, 1);
      strike = -0.65 + 1.65 * (1 - Math.pow(1 - t, 4));
    } else {
      const t = clamp((player.actionTime - spec.startup - spec.active) / Math.max(0.01, spec.recovery), 0, 1);
      recovery = t;
      strike = Math.pow(1 - t, 2);
    }
  }
  if (player.action === "dash" && !reducedMotion) {
    for (let echo = 3; echo >= 1; echo -= 1) {
      ctx.save();
      ctx.globalAlpha = 0.055 * (4 - echo);
      ctx.fillStyle = getPant(player.pantId).color;
      ctx.translate(player.x - player.dashX * echo * 30, player.y - 22 - player.dashY * echo * 22);
      ctx.beginPath(); ctx.moveTo(-17, -92); ctx.lineTo(17, -92); ctx.lineTo(29, -20); ctx.lineTo(17, 16); ctx.lineTo(4, -12); ctx.lineTo(-5, -12); ctx.lineTo(-18, 16); ctx.lineTo(-29, -20); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  const hurtProgress = player.action === "hurt" ? clamp(player.actionTime / Math.max(.01, player.actionDuration), 0, 1) : 0;
  const deadProgress = player.action === "dead" ? clamp(player.actionTime / Math.max(.01, player.actionDuration), 0, 1) : 0;
  ctx.save();
  ctx.globalAlpha = player.action === "dead" ? .48 * (1 - deadProgress * .55) : player.action === "dash" ? .42 : .56;
  ctx.fillStyle = "#020407";
  ctx.beginPath(); ctx.ellipse(player.x, player.y + 2, player.action === "dash" ? 56 : 43 - deadProgress * 8, player.action === "dash" ? 8 : 11 - deadProgress * 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(player.x, player.y + bob);
  ctx.scale(player.facing, 1);
  const hurtLean = player.action === "hurt" ? -0.25 * Math.sin(hurtProgress * Math.PI) : 0;
  const dashLean = player.action === "dash" ? -0.16 : 0;
  const deadLean = player.action === "dead" ? deadProgress * 1.45 : 0;
  const weaponWeight = weaponKind === "bat" || weaponKind === "shotgun" ? 1.24 : weaponKind === "knife" ? .88 : 1;
  const attackLean = player.action === "attack" ? strike * .13 * weaponWeight - anticipation * .1 : 0;
  const recoilLean = firearm ? -player.recoil * (weaponKind === "shotgun" ? .1 : .045) : 0;
  const rootDrive = player.action === "attack" ? Math.max(0, strike) * (weaponKind === "bat" ? 13 : weaponKind === "knife" ? 10 : firearm ? 4 : 12) : 0;
  const attackCrouch = player.action === "attack" ? anticipation * (weaponKind === "bat" ? 6 : 3) - recovery * 1.5 : 0;
  ctx.translate(rootDrive, attackCrouch);
  ctx.rotate(hurtLean + dashLean + deadLean + attackLean + recoilLean);
  ctx.translate(0, -22);
  if (player.action === "dead") ctx.globalAlpha = 1 - clamp((deadProgress - .78) / .22, 0, .42);
  if (player.pantId === "ghost" && player.abilityTimer > 0) ctx.globalAlpha = 0.42;

  const legLift = player.action === "dash" ? -9 : player.action === "attack" ? -Math.max(0, strike) * 3 : 0;
  const planted = player.action === "attack" || player.action === "reload" || player.action === "hurt" || player.action === "dead";
  const leftKneeX = -15 - stride * .18;
  const leftKneeY = -8 + Math.max(0, stride) * .18;
  const rightKneeX = 15 + stride * .18;
  const rightKneeY = -8 + Math.max(0, -stride) * .18;
  drawOutlinedLimb(ctx, -12, -38, leftKneeX, leftKneeY, -18 - stride * .45, 18 + legLift, 12, "#171b22");
  drawOutlinedLimb(ctx, 12, -38, rightKneeX, rightKneeY, 18 + stride * .45, 18 - legLift, 12, "#171b22");
  const image = images[player.pantId];
  if (image) {
    drawArticulatedPants(ctx, image, stride, planted, player.hitFlash > 0, getPant(player.pantId).color);
  } else { ctx.fillStyle = "#8b8b8b"; ctx.fillRect(-27, -50, 54, 70); }
  ctx.fillStyle = "#05070b";
  ctx.strokeStyle = "#020305"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(-36 - stride * .42, 13 + legLift, 32, 12, 3); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(4 + stride * .42, 13 - legLift, 33, 12, 3); ctx.fill(); ctx.stroke();

  const localAimBase = player.facing > 0 ? player.aimAngle : Math.PI - player.aimAngle;
  const reloadTilt = player.action === "reload" ? -.72 + Math.sin(player.actionTime * 14) * .06 : 0;
  const meleeSwing = player.action === "attack" && weaponKind === "bat" ? strike * .62 : player.action === "attack" && weaponKind === "knife" ? strike * .32 : 0;
  const localAim = localAimBase + reloadTilt + meleeSwing;
  const reach = firearm ? 35 : 27 + Math.max(0, strike) * 36;
  const recoilKick = firearm ? player.recoil * (weaponKind === "shotgun" ? 12 : 8) : 0;
  const handX = reach * Math.cos(localAim) - Math.cos(localAim) * recoilKick;
  const handY = -66 + Math.sin(localAim) * 25 - Math.sin(localAim) * recoilKick + (firearm ? 0 : strike * -3);
  const leftHandStrike = weaponKind === "fists" && comboSide < 0;
  const supportX = firearm || weaponKind === "bat" ? handX - 18 : leftHandStrike ? 31 - stride * .22 : -31 + stride * .22;
  const supportY = firearm || weaponKind === "bat" ? handY + 10 : -52;
  const skin = player.hitFlash > 0 ? COLORS.hitFlash : COLORS.skin;
  const supportShoulderX = leftHandStrike ? 15 : -15;
  const supportElbowX = leftHandStrike ? 25 : -25;
  drawOutlinedLimb(ctx, supportShoulderX, -77 + breath * .3, supportElbowX, -65, supportX, supportY, 7, skin);

  ctx.fillStyle = player.hitFlash > 0 ? COLORS.hitFlash : COLORS.shirt;
  ctx.strokeStyle = "#070a10"; ctx.lineWidth = 5; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(-20, -90 + breath * .25); ctx.lineTo(20, -90 + breath * .25); ctx.lineTo(27, -48); ctx.lineTo(-26, -48); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(99,216,255,.28)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -86); ctx.lineTo(-23, -52); ctx.stroke();
  ctx.fillStyle = getPant(player.pantId).color; ctx.fillRect(-4, -70, 8, 3);

  const elbowBase = leftHandStrike ? -16 : 16;
  const elbowX = firearm ? 4 + handX * .48 : elbowBase + handX * .42;
  const elbowY = firearm ? -72 + (handY + 66) * .42 : -62 + strike * -4;
  drawOutlinedLimb(ctx, leftHandStrike ? -14 : 15, -78, elbowX, elbowY, handX, handY, 7, skin);
  ctx.fillStyle = skin; ctx.strokeStyle = "#080b11"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(handX, handY, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  drawHeldWeapon(ctx, weaponKind, handX, handY, localAim, 0);

  const headLag = -attackLean * 22 + player.recoil * (weaponKind === "shotgun" ? -5 : -2);
  ctx.fillStyle = skin; ctx.strokeStyle = "#080b11"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(headLag, -105 + breath * .25, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#111722"; ctx.beginPath(); ctx.arc(headLag - 2, -111 + breath * .25, 14, Math.PI * 1.05, Math.PI * 1.98); ctx.fill();
  ctx.fillRect(headLag - 15, -111 + breath * .25, 8, 5);
  ctx.fillStyle = "#080a0e"; ctx.fillRect(headLag + 4, -108 + breath * .25, 8, 3);
  ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(headLag + 9, -108 + breath * .25, 2, 2);
  if (player.pantId === "guard" && player.abilityTimer > 0) {
    ctx.strokeStyle = getPant(player.pantId).color; ctx.lineWidth = 4; ctx.globalAlpha = 0.72;
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
  const stroke = enemy.kind === "runner" ? "#f6c453"
    : enemy.kind === "brute" ? "#ff8a4c"
      : enemy.kind === "thrower" ? "#d987ff"
        : enemy.kind === "walker" ? COLORS.toxic : COLORS.danger;
  const fill = enemy.kind === "runner" ? "rgba(246,196,83,.14)"
    : enemy.kind === "brute" ? "rgba(255,138,76,.14)"
      : enemy.kind === "thrower" ? "rgba(217,135,255,.12)"
        : enemy.kind === "walker" ? "rgba(143,211,107,.13)" : "rgba(255,77,103,.13)";
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = progress > .92 ? COLORS.hitFlash : stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = progress > .78 ? 4 : 2;
  ctx.translate(enemy.x, enemy.y + 5);
  ctx.rotate(enemy.kind === "brute" && enemy.elite ? 0 : angle);
  if (enemy.kind === "thrower") {
    ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(20, -46); ctx.lineTo(410, -46); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(370, -46, 17 + progress * 8, 0, Math.PI * 2); ctx.stroke();
  } else if (enemy.kind === "runner") {
    ctx.fillRect(18, -18, 165 * progress, 36);
    ctx.strokeRect(18, -18, 165, 36);
  } else if (enemy.kind === "brute") {
    const slamCenter = enemy.elite ? 0 : 72;
    const slamRadiusX = enemy.elite ? 148 : 92;
    const slamRadiusY = enemy.elite ? 62 : 34;
    ctx.beginPath(); ctx.ellipse(slamCenter, 0, slamRadiusX, slamRadiusY, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let crack = 0; crack < 4; crack += 1) {
      const crackX = slamCenter - 42 + crack * 28;
      ctx.beginPath(); ctx.moveTo(crackX, 0); ctx.lineTo(crackX + 18, (crack % 2 ? -1 : 1) * (10 + progress * 12)); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(95, -34); ctx.lineTo(95, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawEliteGround(ctx: CanvasRenderingContext2D, enemy: Enemy, reducedMotion: boolean) {
  if (!enemy.elite || enemy.dead) return;
  ctx.save();
  ctx.strokeStyle = COLORS.elite;
  ctx.lineWidth = 2;
  ctx.globalAlpha = .68 + (reducedMotion ? 0 : Math.sin(enemy.animTime * 1.8) * .12);
  ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y + 6, enemy.radius * 1.35, 10, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawEnemyOverlay(ctx: CanvasRenderingContext2D, enemy: Enemy, reducedMotion: boolean) {
  if (enemy.dead) return;
  const def = ENEMIES[enemy.kind];
  if (enemy.elite) {
    ctx.save();
    ctx.fillStyle = COLORS.elite;
    ctx.globalAlpha = .78 + (reducedMotion ? 0 : Math.sin(enemy.animTime * 1.8) * .16);
    ctx.translate(enemy.x, enemy.y - 142);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }
  if (enemy.hp < enemy.maxHp || enemy.elite) {
    const barW = enemy.radius * (enemy.kind === "walker" ? 2.6 : 2.4);
    const barY = enemy.y - (enemy.kind === "walker" ? 132 : 124);
    ctx.fillStyle = "rgba(3,6,10,.86)"; ctx.fillRect(enemy.x - barW / 2 - 2, barY - 2, barW + 4, 8);
    ctx.fillStyle = enemy.elite ? COLORS.elite : enemy.kind === "walker" ? COLORS.toxic : def.color;
    ctx.fillRect(enemy.x - barW / 2, barY, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
  }
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
  ctx.beginPath(); ctx.ellipse(0, 2, enemy.radius * 1.35, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(enemy.facing, 1);
  const fade = enemy.state === "dead" ? 1 - clamp((enemy.stateTimer - .66) / .34, 0, 1) : 1;
  ctx.globalAlpha = fade;
  ctx.filter = enemy.hitFlash > 0 ? "brightness(2.3) saturate(.5)" : "none";
  ctx.drawImage(image, frame * frameWidth, 0, frameWidth, frameHeight, -targetWidth / 2, -targetHeight, targetWidth, targetHeight);
  ctx.filter = "none";
  ctx.restore();
}

function drawSimplifiedEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, reducedMotion: boolean) {
  const def = ENEMIES[enemy.kind];
  const stride = reducedMotion ? 0 : Math.sin(enemy.animTime) * (enemy.kind === "runner" ? 8 : 5);
  const bob = reducedMotion ? 0 : -Math.abs(Math.sin(enemy.animTime)) * 1.5;
  const bodyW = enemy.kind === "brute" ? 58 : enemy.kind === "runner" ? 32 : 40;
  const bodyH = enemy.kind === "brute" ? 64 : 56;
  const skin = enemy.hitFlash > 0 ? COLORS.hitFlash : ENEMY_SKIN_TONES[enemy.id % ENEMY_SKIN_TONES.length];
  const cloth = enemy.hitFlash > 0 ? COLORS.hitFlash : "#202938";
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.4)";
  ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y + 2, enemy.radius * 1.15, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(enemy.x, enemy.y + bob - 18);
  ctx.scale(enemy.facing, 1);
  ctx.fillStyle = "#111722";
  ctx.fillRect(-18 - stride * .25, -12, 12, 30);
  ctx.fillRect(6 + stride * .25, -12, 12, 30);
  ctx.fillStyle = "#05070b";
  ctx.fillRect(-25 - stride * .3, 12, 20, 8);
  ctx.fillRect(5 + stride * .3, 12, 21, 8);
  ctx.fillStyle = cloth;
  ctx.fillRect(-bodyW / 2, -bodyH - 8, bodyW, bodyH);
  ctx.fillStyle = def.color;
  ctx.fillRect(-bodyW / 2, -bodyH - 8, enemy.kind === "brute" ? bodyW : 7, enemy.kind === "runner" ? 11 : bodyH);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -bodyH - 23, enemy.kind === "brute" ? 17 : 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#090d14";
  ctx.fillRect(4, -bodyH - 26, 8, 3);
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, images: Record<string, HTMLImageElement>, reducedMotion: boolean, simplified = false) {
  const def = ENEMIES[enemy.kind];
  if (enemy.kind === "walker") {
    const zombieImage = images[enemy.zombieVariant === 1 ? "zombie-mutant" : "zombie-walker"];
    if (zombieImage) {
      drawZombie(ctx, enemy, zombieImage);
      return;
    }
  }
  if (simplified) {
    drawSimplifiedEnemy(ctx, enemy, reducedMotion);
    return;
  }
  const locomotion = enemy.state === "chase" || enemy.state === "enter";
  const stride = reducedMotion || !locomotion ? 0 : Math.sin(enemy.animTime) * (enemy.kind === "runner" ? 10 : enemy.kind === "brute" ? 5 : 7);
  const stateProgress = clamp(enemy.stateTimer / Math.max(0.01, enemy.stateDuration), 0, 1);
  const fallProgress = enemy.state === "dead" ? clamp(enemy.stateTimer / .42, 0, 1) : 0;
  const activeSnap = enemy.state === "active" ? 1 - Math.pow(1 - stateProgress, 3) : enemy.state === "recover" ? 1 - stateProgress : 0;
  const anticipation = enemy.state === "windup" ? 1 - Math.pow(1 - stateProgress, 2) : enemy.state === "active" ? 1 - activeSnap : 0;
  const windupLean = -0.2 * anticipation;
  const activeLean = (enemy.kind === "runner" ? .34 : enemy.kind === "brute" ? .2 : .28) * activeSnap;
  const hurtLean = enemy.state === "hurt" ? -0.25 * enemy.facing * Math.sin(stateProgress * Math.PI) : 0;
  const deathDirection = enemy.id % 3 === 0 ? -1 : 1;
  const deathLean = enemy.state === "dead" ? deathDirection * enemy.facing * fallProgress * (enemy.kind === "brute" ? 1.18 : 1.42) : 0;
  const moveBob = reducedMotion ? 0 : locomotion ? -Math.abs(Math.sin(enemy.animTime)) * (enemy.kind === "brute" ? 1.2 : 2.2) : Math.sin(enemy.animTime * .32) * .7;
  const crouch = enemy.kind === "runner" ? anticipation * 8 : enemy.kind === "brute" ? anticipation * 5 : 0;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.48)";
  ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y + 2, enemy.radius * (1.25 - fallProgress * .35), 9 - fallProgress * 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(enemy.x, enemy.y + moveBob + crouch + (enemy.state === "dead" ? fallProgress * 9 : 0));
  ctx.scale(enemy.facing, 1 - anticipation * (enemy.kind === "brute" ? .08 : .035));
  ctx.rotate(windupLean + activeLean + hurtLean + deathLean);
  ctx.translate(0, -19);
  if (enemy.state === "dead") ctx.globalAlpha = 1 - clamp((enemy.stateTimer - .56) / .3, 0, 1);
  const bodyW = enemy.kind === "brute" ? 61 : enemy.kind === "runner" ? 32 : enemy.kind === "thrower" ? 43 : 41;
  const skin = enemy.hitFlash > 0 ? COLORS.hitFlash : ENEMY_SKIN_TONES[enemy.id % ENEMY_SKIN_TONES.length];
  const cloth = enemy.hitFlash > 0 ? COLORS.hitFlash : "#202938";
  const limbDark = enemy.hitFlash > 0 ? COLORS.hitFlash : "#131923";
  const headY = enemy.kind === "brute" ? -86 : -84;

  const footLiftA = Math.max(0, stride) * .22;
  const footLiftB = Math.max(0, -stride) * .22;
  drawOutlinedLimb(ctx, -11, -14, -14 - stride * .18, 0, -19 - stride * .5, 15 - footLiftA, enemy.kind === "brute" ? 12 : 9, limbDark);
  drawOutlinedLimb(ctx, 11, -14, 14 + stride * .18, 0, 19 + stride * .5, 15 - footLiftB, enemy.kind === "brute" ? 12 : 9, limbDark);
  ctx.fillStyle = "#05070b"; ctx.fillRect(-31 - stride * .48, 11 - footLiftA, 26, 10); ctx.fillRect(5 + stride * .48, 11 - footLiftB, 27, 10);

  const attackAngle = Math.atan2(enemy.attackY, Math.max(.1, Math.abs(enemy.attackX)));
  const strikeReach = 25 + activeSnap * (enemy.kind === "runner" ? 60 : enemy.kind === "brute" ? 38 : 46);
  const strikeHandX = bodyW * .34 + strikeReach;
  const strikeHandY = -50 + Math.sin(attackAngle) * 35 + (enemy.kind === "brute" ? activeSnap * 20 : 0);
  const bruteRaisedLeftX = -bodyW * .42;
  const bruteRaisedLeftY = -92;
  const bruteImpactLeftX = 36;
  const bruteImpactLeftY = -34;
  const bruteIdleLeftX = -bodyW * .58 - stride * .28;
  const bruteIdleLeftY = -35;
  let guardHandX = bruteIdleLeftX;
  let guardHandY = bruteIdleLeftY;
  if (enemy.kind === "brute" && enemy.state === "windup") {
    guardHandX = bruteRaisedLeftX;
    guardHandY = bruteRaisedLeftY;
  }
  else if (enemy.kind === "brute" && enemy.state === "active") {
    guardHandX = bruteRaisedLeftX + (bruteImpactLeftX - bruteRaisedLeftX) * activeSnap;
    guardHandY = bruteRaisedLeftY + (bruteImpactLeftY - bruteRaisedLeftY) * activeSnap;
  } else if (enemy.kind === "brute" && enemy.state === "recover") {
    guardHandX = bruteIdleLeftX + (bruteImpactLeftX - bruteIdleLeftX) * activeSnap;
    guardHandY = bruteIdleLeftY + (bruteImpactLeftY - bruteIdleLeftY) * activeSnap;
  }
  drawOutlinedLimb(ctx, -bodyW * .3, -55, -bodyW * .48, -48, guardHandX, guardHandY, enemy.kind === "brute" ? 10 : 7, skin);

  ctx.fillStyle = cloth; ctx.strokeStyle = "#090d14"; ctx.lineWidth = 5; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(-bodyW / 2, -68); ctx.lineTo(bodyW / 2, -68); ctx.lineTo(bodyW * .44, -12); ctx.lineTo(-bodyW * .44, -12); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (enemy.kind === "thug") {
    ctx.fillStyle = def.color; ctx.fillRect(-bodyW / 2 + 2, -65, 8, 47); ctx.fillRect(bodyW / 2 - 10, -65, 8, 47);
    ctx.fillStyle = "#111722"; ctx.fillRect(-bodyW / 2 + 11, -56, bodyW - 22, 5);
    ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -65); ctx.lineTo(0, -19); ctx.stroke();
  } else if (enemy.kind === "runner") {
    ctx.fillStyle = def.color; ctx.fillRect(-bodyW / 2 + 2, -66, bodyW - 4, 13);
    ctx.strokeStyle = def.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-14, -61); ctx.lineTo(-39 - stride, -50 + stride * .16); ctx.stroke();
  } else if (enemy.kind === "brute") {
    ctx.fillStyle = def.color; ctx.fillRect(-38, -66, 17, 17); ctx.fillRect(21, -66, 17, 17);
    ctx.fillStyle = "#111722"; ctx.fillRect(-27, -34, 54, 9);
    ctx.fillStyle = COLORS.elite; ctx.fillRect(-4, -34, 8, 9);
  } else if (enemy.kind === "thrower") {
    ctx.fillStyle = "#111722"; ctx.fillRect(-31, -67, 15, 44);
    ctx.strokeStyle = COLORS.enemyBullet; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-24, -45, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = def.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-15, -67); ctx.lineTo(18, -21); ctx.stroke();
  }

  let activeHandX = strikeHandX;
  let activeHandY = strikeHandY;
  if (enemy.kind === "thrower") {
    activeHandX = 18 + activeSnap * 25;
    activeHandY = -72 - anticipation * 30 + activeSnap * 34;
  }
  if (enemy.kind === "brute" && enemy.state === "windup") {
    activeHandX = bodyW * .35;
    activeHandY = -94;
  }
  else if (enemy.kind === "brute" && enemy.state === "active") {
    const raisedHandX = bodyW * .35;
    const raisedHandY = -94;
    activeHandX = raisedHandX + (strikeHandX - raisedHandX) * activeSnap;
    activeHandY = raisedHandY + (strikeHandY - raisedHandY) * activeSnap;
  }
  const activeElbowX = bodyW * .48 + activeSnap * 13;
  const activeElbowY = -58 - anticipation * 15 + activeSnap * 8;
  drawOutlinedLimb(ctx, bodyW * .3, -55, activeElbowX, activeElbowY, activeHandX, activeHandY, enemy.kind === "brute" ? 10 : 7, skin);
  if (enemy.kind === "thrower" && enemy.state !== "recover" && !enemy.attackResolved) {
    ctx.save(); ctx.translate(activeHandX, activeHandY); ctx.rotate(-.5 + activeSnap * 1.2);
    ctx.fillStyle = COLORS.enemyBullet; ctx.strokeStyle = "#090d14"; ctx.lineWidth = 3; ctx.fillRect(-4, -14, 8, 22); ctx.strokeRect(-4, -14, 8, 22); ctx.fillStyle = "#d8ff3e"; ctx.fillRect(-2, -18, 4, 6); ctx.restore();
  }

  ctx.fillStyle = skin; ctx.strokeStyle = "#080b11"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, headY, enemy.kind === "brute" ? 18 : 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#10151d";
  if (enemy.kind === "runner") { ctx.fillRect(-17, headY - 16, 32, 7); ctx.fillRect(8, headY - 11, 20, 5); }
  else if (enemy.kind === "thug") { ctx.fillRect(-15, headY - 12, 29, 6); ctx.fillRect(-20, headY - 8, 10, 5); }
  else if (enemy.kind === "thrower") { ctx.fillRect(-15, headY - 4, 30, 8); ctx.fillStyle = def.color; ctx.fillRect(5, headY - 2, 7, 3); }
  else { ctx.fillRect(-13, headY - 14, 12, 4); }
  ctx.fillStyle = enemy.hitFlash > 0 ? COLORS.hitFlash : "#05070a"; ctx.fillRect(5, headY - 3, 7, 3);
  ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, pickup: WeaponPickup, nearby: boolean, reducedMotion: boolean, mobileProfile: boolean, textures: RenderTextures | null) {
  if (pickup.life < 3 && Math.floor(pickup.life * 8) % 2 === 0) return;
  const y = pickup.y - 20 + (reducedMotion ? 0 : Math.sin(pickup.bob) * 5);
  ctx.save();
  if (textures) {
    ctx.globalAlpha = nearby ? .18 : .07;
    ctx.drawImage(textures.pickupBeam, pickup.x - 27, pickup.y - 101);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = nearby ? "rgba(255,226,138,.12)" : "rgba(255,226,138,.05)";
    ctx.fillRect(pickup.x - 22, pickup.y - 92, 44, 95);
  }
  ctx.fillStyle = "rgba(0,0,0,.58)"; ctx.beginPath(); ctx.ellipse(pickup.x, pickup.y + 4, 35, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(pickup.x, y); ctx.scale(0.72, 0.72); drawHeldWeapon(ctx, pickup.weapon.kind, -20, 0, -0.14); ctx.restore();
  ctx.save(); ctx.translate(pickup.x, y - 26); ctx.rotate(Math.PI / 4); ctx.fillStyle = nearby ? COLORS.score : "rgba(255,226,138,.72)"; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
  if (nearby) {
    ctx.save(); ctx.textAlign = "center"; ctx.font = "900 13px ui-monospace, monospace"; ctx.fillStyle = COLORS.score;
    ctx.fillText(`${mobileProfile ? "SWAP" : "Q"}  ${WEAPONS[pickup.weapon.kind].label}`, pickup.x, y - 43); ctx.restore();
  }
}

function effectNoise(seed: number, index: number) {
  const value = Math.sin(seed * 91.73 + index * 47.21) * 43758.5453;
  return value - Math.floor(value);
}

function keepDecorativeEffect(effect: Effect) {
  const stableValue = effect.seed ?? effect.x * 17.13 + effect.y * 31.71;
  return Math.abs(Math.floor(stableValue * 100)) % 2 === 0;
}

function drawEffect(ctx: CanvasRenderingContext2D, effect: Effect, mobileProfile: boolean, lowDetail: boolean) {
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
    if (!lowDetail) { ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = big ? 12 : 5; }
    ctx.fillText(effect.text, effect.x, effect.y - progress * 38);
  } else if (effect.kind === "ring") {
    ctx.lineWidth = Math.max(2, 7 * alpha);
    ctx.beginPath(); ctx.ellipse(effect.x, effect.y - 4, radius * (.65 + progress * 1.1), radius * (.2 + progress * .28), 0, 0, Math.PI * 2); ctx.stroke();
  } else if (effect.kind === "trail") {
    ctx.globalAlpha = alpha * .14;
    ctx.beginPath(); ctx.ellipse(effect.x, effect.y - 40, radius, radius * 1.35, angle, 0, Math.PI * 2); ctx.fill();
  } else if (effect.kind === "dust") {
    const count = lowDetail ? 3 : mobileProfile ? 4 : 7;
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
  } else if (effect.kind === "tracer") {
    ctx.translate(effect.x, effect.y); ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha * 1.7);
    ctx.lineWidth = lowDetail ? 2 : 3;
    ctx.beginPath();
    const streaks = lowDetail ? 2 : 3;
    for (let index = 0; index < streaks; index += 1) {
      const rayAngle = (index - (streaks - 1) / 2) * .17 + (effectNoise(seed, index + 9) - .5) * .035;
      const length = radius * (.7 + effectNoise(seed, index) * .24);
      ctx.moveTo(5, 0);
      ctx.lineTo(Math.cos(rayAngle) * length, Math.sin(rayAngle) * length);
    }
    ctx.stroke();
  } else if (effect.kind === "slash") {
    ctx.translate(effect.x, effect.y); ctx.rotate(angle);
    ctx.lineWidth = Math.max(2, 10 * alpha * strength);
    ctx.beginPath(); ctx.arc(0, -30, radius * (.75 + progress * .35), -.92, .92); ctx.stroke();
    ctx.globalAlpha = alpha * .25; ctx.lineWidth += 8; ctx.stroke();
  } else if (effect.kind === "burst" || effect.kind === "hit") {
    const count = lowDetail ? 4 : mobileProfile ? 5 : 9;
    ctx.translate(effect.x, effect.y - 38); ctx.rotate(angle);
    ctx.lineWidth = Math.max(2, 6 * alpha);
    ctx.beginPath();
    for (let i = 0; i < count; i += 1) {
      const rayAngle = (effectNoise(seed, i) - .5) * 2.5;
      const length = (18 + effectNoise(seed, i + 12) * 38) * strength * (.7 + progress);
      ctx.moveTo(Math.cos(rayAngle) * 7, Math.sin(rayAngle) * 7); ctx.lineTo(Math.cos(rayAngle) * length, Math.sin(rayAngle) * length);
    }
    ctx.stroke();
  } else if (effect.kind === "bolt") {
    ctx.translate(effect.x, effect.y - 86);
    ctx.lineWidth = Math.max(2, 7 * alpha);
    if (!mobileProfile && !lowDetail) { ctx.shadowColor = effect.color; ctx.shadowBlur = 12; }
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

function drawActorReflection(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, width: number, alpha: string) {
  if (y < ARENA.top + 10) return;
  const length = Math.min(54, (y - ARENA.top) * .2 + 18);
  ctx.fillStyle = `${color}${alpha}`;
  ctx.beginPath();
  ctx.moveTo(x - width, y + 3);
  ctx.lineTo(x + width, y + 3);
  ctx.lineTo(x + width * .32, y + 3 + length);
  ctx.lineTo(x - width * .32, y + 3 + length);
  ctx.closePath();
  ctx.fill();
}

function drawArenaAmbient(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  reducedMotion: boolean,
  mobileProfile: boolean,
  city: CityDefinition,
  textures: RenderTextures | null,
  quality: number,
  lowDetail: boolean,
  severePressure: boolean,
) {
  if (textures && !severePressure) {
    const hazeOffset = reducedMotion ? 0 : (state.elapsed * 18) % textures.haze.width;
    ctx.save();
    ctx.globalAlpha = city.id === "harbor" ? .52 : .3;
    ctx.drawImage(textures.haze, hazeOffset - textures.haze.width, STREET_HORIZON - 40);
    ctx.drawImage(textures.haze, hazeOffset, STREET_HORIZON - 40);
    ctx.restore();
  }
  if (!reducedMotion && !lowDetail) {
    const vents = city.id === "harbor" ? [{ x: 170, y: 466 }, { x: 1090, y: 452 }, { x: 636, y: 438 }] : [{ x: 228, y: 467 }, { x: 1062, y: 450 }];
    const puffs = mobileProfile ? 2 : quality < .85 ? 3 : 5;
    for (const vent of vents) {
      for (let index = 0; index < puffs; index += 1) {
        const phase = (state.elapsed * .2 + index / puffs) % 1;
        const drift = Math.sin(state.elapsed * .7 + index * 2.1) * 10;
        ctx.globalAlpha = (1 - phase) * (city.id === "harbor" ? .09 : .06);
        ctx.fillStyle = city.id === "blackout" ? "#8994a8" : "#b9d3df";
        ctx.beginPath(); ctx.arc(vent.x + drift, vent.y - phase * 82, 8 + phase * 19, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  if (severePressure) return;
  const alpha = mobileProfile ? "0a" : "12";
  for (const fighter of state.players) {
    if (fighter.connected) drawActorReflection(ctx, fighter.x, fighter.y, getPant(fighter.pantId).color, 26, alpha);
  }
  const enemyLimit = lowDetail ? 6 : quality < .9 || mobileProfile ? 10 : state.enemies.length;
  let reflected = 0;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    drawActorReflection(ctx, enemy.x, enemy.y, enemy.kind === "walker" ? COLORS.toxic : ENEMIES[enemy.kind].color, enemy.radius * .7, alpha);
    reflected += 1;
    if (reflected >= enemyLimit) break;
  }
}

const renderOrder: Enemy[] = [];
const playerRenderOrderScratch: Player[] = [];
const detailCandidatesScratch: Enemy[] = [];
const detailedEnemyIdsScratch = new Set<number>();

function depthScaleForY(y: number) {
  return .86 + clamp((y - ARENA.top) / Math.max(1, ARENA.bottom - ARENA.top), 0, 1) * .17;
}

function drawGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  images: Record<string, HTMLImageElement>,
  layers: ArenaLayers | null,
  textures: RenderTextures | null,
  city: CityDefinition,
  reducedMotion: boolean,
  mobileProfile: boolean,
  quality: number,
  pressureTier: number,
  localPlayerId: FighterId = "host",
) {
  const localPlayer = state.players.find((fighter) => fighter.id === localPlayerId) ?? state.player;
  const lowDetail = pressureTier >= 1;
  const severePressure = pressureTier >= 2;
  ctx.fillStyle = city.sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
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
  if (layers) {
    const camera = reducedMotion ? 0 : (localPlayer.x / WORLD_W - 0.5) * 38;
    const farX = clamp(BACKGROUND_MARGIN + camera * city.farParallax, 0, BACKGROUND_MARGIN * 2);
    const nearX = clamp(BACKGROUND_MARGIN + camera * city.nearParallax, 0, BACKGROUND_MARGIN * 2);
    ctx.drawImage(layers.far, farX, 0, WORLD_W, WORLD_H, 0, 0, WORLD_W, WORLD_H);
    if (!severePressure) ctx.drawImage(layers.near, nearX, 0, WORLD_W, WORLD_H, 0, 0, WORLD_W, WORLD_H);
    ctx.drawImage(layers.street, 0, 0);
  }
  drawArenaAmbient(ctx, state, reducedMotion, mobileProfile, city, textures, quality, lowDetail, severePressure);

  if (textures && !severePressure) {
    for (const fighter of state.players) {
      if (fighter.connected) ctx.drawImage(textures.pantGlows[fighter.pantId], fighter.x - 180, fighter.y - 215);
    }
  }
  if (!reducedMotion && city.rain > 0) {
    ctx.strokeStyle = city.id === "harbor" ? "rgba(236,205,165,.12)" : "rgba(156,210,228,.16)";
    ctx.lineWidth = lowDetail ? 1 : 2;
    const rainCount = severePressure ? 0 : Math.max(5, Math.round((mobileProfile ? (lowDetail ? 8 : 16) : lowDetail ? 16 : 32) * city.rain * quality));
    ctx.beginPath();
    for (let i = 0; i < rainCount; i += 1) {
      const x = (i * 97 + state.elapsed * 145) % WORLD_W;
      const y = (i * 61 + state.elapsed * 440) % 590;
      ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 19);
    }
    if (rainCount > 0) ctx.stroke();
  }

  for (let index = 0; index < state.effects.length; index += 1) {
    const effect = state.effects[index];
    if (effect.kind !== "trail" && effect.kind !== "ring" && effect.kind !== "dust") continue;
    if (severePressure && (effect.kind === "trail" || effect.kind === "dust") && !keepDecorativeEffect(effect)) continue;
    drawEffect(ctx, effect, mobileProfile, lowDetail);
  }

  for (const enemy of state.enemies) {
    drawEnemyTelegraph(ctx, enemy);
    drawEliteGround(ctx, enemy, reducedMotion);
  }
  for (const pickup of state.pickups) drawPickup(ctx, pickup, pickup.id === localPlayer.nearPickupId, reducedMotion, mobileProfile, textures);
  renderOrder.length = 0;
  for (const enemy of state.enemies) renderOrder.push(enemy);
  renderOrder.sort((a, b) => a.y - b.y);
  playerRenderOrderScratch.length = 0;
  for (const fighter of state.players) if (fighter.connected) playerRenderOrderScratch.push(fighter);
  playerRenderOrderScratch.sort((a, b) => a.y - b.y);
  let nextPlayerIndex = 0;
  const detailBudget = severePressure ? (mobileProfile ? 6 : 8) : lowDetail ? (mobileProfile ? 9 : 12) : Number.POSITIVE_INFINITY;
  detailCandidatesScratch.length = 0;
  detailedEnemyIdsScratch.clear();
  for (const enemy of renderOrder) {
    if (enemy.kind === "walker") continue;
    const criticalState = enemy.elite || enemy.dead || (enemy.state !== "chase" && enemy.state !== "enter");
    if (criticalState) detailedEnemyIdsScratch.add(enemy.id);
    else detailCandidatesScratch.push(enemy);
  }
  detailCandidatesScratch.sort((a, b) => distanceSquared(a.x, a.y, localPlayer.x, localPlayer.y) - distanceSquared(b.x, b.y, localPlayer.x, localPlayer.y));
  for (let index = 0; index < detailCandidatesScratch.length && index < detailBudget; index += 1) {
    detailedEnemyIdsScratch.add(detailCandidatesScratch[index].id);
  }
  const drawScaledFighter = (fighter: Player) => {
    const scale = depthScaleForY(fighter.y);
    ctx.save(); ctx.translate(fighter.x, fighter.y); ctx.scale(scale, scale); ctx.translate(-fighter.x, -fighter.y);
    drawFighter(ctx, state, images, reducedMotion, fighter); ctx.restore();
  };
  for (const enemy of renderOrder) {
    while (nextPlayerIndex < playerRenderOrderScratch.length && enemy.y > playerRenderOrderScratch[nextPlayerIndex].y) {
      drawScaledFighter(playerRenderOrderScratch[nextPlayerIndex]);
      nextPlayerIndex += 1;
    }
    const simplified = enemy.kind !== "walker" && !detailedEnemyIdsScratch.has(enemy.id);
    const scale = depthScaleForY(enemy.y);
    ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.scale(scale, scale); ctx.translate(-enemy.x, -enemy.y);
    drawEnemy(ctx, enemy, images, reducedMotion, simplified); ctx.restore();
  }
  while (nextPlayerIndex < playerRenderOrderScratch.length) {
    drawScaledFighter(playerRenderOrderScratch[nextPlayerIndex]);
    nextPlayerIndex += 1;
  }
  for (const enemy of state.enemies) {
    if (enemy.dead || (!enemy.elite && enemy.hp >= enemy.maxHp)) continue;
    const scale = depthScaleForY(enemy.y);
    ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.scale(scale, scale); ctx.translate(-enemy.x, -enemy.y);
    drawEnemyOverlay(ctx, enemy, reducedMotion); ctx.restore();
  }

  const glowProjectiles = !mobileProfile && state.projectiles.length <= 32;
  for (const projectile of state.projectiles) {
    if (projectile.kind === "thrown") {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(projectile.x, projectile.y + 42, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx) + Math.sin(state.elapsed * 12 + projectile.id) * .35);
      ctx.fillStyle = COLORS.enemyBullet; ctx.strokeStyle = "#080b11"; ctx.lineWidth = 3;
      ctx.fillRect(-10, -5, 23, 10); ctx.strokeRect(-10, -5, 23, 10);
      ctx.fillStyle = "#d8ff3e"; ctx.fillRect(12, -3, 7, 6);
      ctx.restore();
    } else {
      ctx.save();
      if (glowProjectiles && projectile.kind === "bullet") { ctx.shadowColor = COLORS.bullet; ctx.shadowBlur = 8; }
      ctx.fillStyle = COLORS.bullet;
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,226,138,.82)";
      ctx.lineWidth = projectile.kind === "pellet" ? 2 : 4; ctx.beginPath(); ctx.moveTo(projectile.x, projectile.y); ctx.lineTo(projectile.prevX, projectile.prevY); ctx.stroke();
      ctx.restore();
    }
  }
  for (let index = 0; index < state.effects.length; index += 1) {
    const effect = state.effects[index];
    if (effect.kind === "trail" || effect.kind === "ring" || effect.kind === "dust") continue;
    if (severePressure && (effect.kind === "burst" || effect.kind === "hit") && !keepDecorativeEffect(effect)) continue;
    drawEffect(ctx, effect, mobileProfile, lowDetail);
  }
  ctx.restore();

  if (state.introTimer > 0 && state.waveClearTimer <= 0) {
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
  const lowHealth = 1 - clamp(localPlayer.hp / localPlayer.maxHp, 0, 1);
  const dangerAlpha = Math.min(.115, state.damageFlash * .095 + (lowHealth > .74 ? (lowHealth - .74) * .18 : 0));
  if (textures && !severePressure) ctx.drawImage(textures.vignette, 0, 0);
  if (dangerAlpha > 0) {
    if (textures) {
      ctx.save(); ctx.globalAlpha = dangerAlpha; ctx.drawImage(textures.danger, 0, 0); ctx.restore();
    } else {
      ctx.fillStyle = `rgba(255,40,70,${dangerAlpha * .4})`; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function createInputState(): PlayerInputState {
  return { dx: 0, dy: 0, attack: false, attackQueued: false, dash: false, ability: false, swap: false, reload: false };
}

export default function CamoClashGame() {
  const [screen, setScreen] = useState<Screen>("menu");
  const screenRef = useRef<Screen>("menu");
  const [selectedPant, setSelectedPant] = useState<PantId>("ghost");
  const [selectedCity, setSelectedCity] = useState<CityId>("neon");
  const selectedCityRef = useRef<CityId>("neon");
  const [playerName, setPlayerName] = useState("FIGHTER");
  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [result, setResult] = useState<Result | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [boardStatus, setBoardStatus] = useState("Loading the street records…");
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [coopOpen, setCoopOpen] = useState(false);
  const [coopView, setCoopView] = useState<CoopLobbyView>("choose");
  const [coopPhase, setCoopPhase] = useState<CoopLobbyPhase>("idle");
  const [coopMessage, setCoopMessage] = useState("");
  const [coopRoomId, setCoopRoomId] = useState("");
  const [coopInviteUrl, setCoopInviteUrl] = useState("");
  const [coopRole, setCoopRole] = useState<CoopRole | null>(null);
  const [coopPartner, setCoopPartner] = useState<CoopIdentity | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const actionsRef = useRef<PlayerInputState>(createInputState());
  const remoteActionsRef = useRef<PlayerInputState>(createInputState());
  const coopConnectionRef = useRef<CoopConnection | null>(null);
  const coopRoleRef = useRef<CoopRole | null>(null);
  const coopPartnerRef = useRef<CoopIdentity | null>(null);
  const localCoopIdentityRef = useRef<CoopIdentity>({ name: "FIGHTER", pantId: "ghost" });
  const coopControlHandlerRef = useRef<(message: CoopMessage) => void>(() => undefined);
  const coopStateHandlerRef = useRef<(message: CoopMessage) => void>(() => undefined);
  const coopClosingRef = useRef(false);
  const snapshotSequenceRef = useRef(0);
  const receivedSnapshotRef = useRef(0);
  const inputSequenceRef = useRef(0);
  const receivedInputRef = useRef(0);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const arenaLayersRef = useRef<ArenaLayers | null>(null);
  const renderTexturesRef = useRef<RenderTextures | null>(null);
  const audioRef = useRef<ZombieAudio | null>(null);
  const joystickRef = useRef<{ id: number | null; rect: DOMRect | null; maxTravel: number; x: number; y: number }>({ id: null, rect: null, maxTravel: 0, x: 0, y: 0 });
  const pant = useMemo(() => getPant(selectedPant), [selectedPant]);
  const city = useMemo(() => getCity(selectedCity), [selectedCity]);

  const changeScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
  }, []);

  const chooseCity = useCallback((cityId: CityId) => {
    selectedCityRef.current = cityId;
    setSelectedCity(cityId);
    localStorage.setItem("camo-clash-city", cityId);
    if (imagesRef.current["city-premium"] || imagesRef.current["city-0"]) {
      arenaLayersRef.current = createArenaLayers(imagesRef.current, cityId);
    }
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

  const handleCoopDisconnect = useCallback((message: string) => {
    if (coopClosingRef.current) return;
    coopConnectionRef.current = null;
    remoteActionsRef.current = createInputState();
    setCoopMessage(message);
    setCoopPhase("error");
    if (screenRef.current === "playing" || screenRef.current === "upgrade") {
      if (coopRoleRef.current === "host") {
        const guest = gameRef.current?.players.find((fighter) => fighter.id === "guest");
        if (guest) guest.connected = false;
        setCoopPartner(null);
        coopPartnerRef.current = null;
      } else {
        gameRef.current = null;
        setCoopOpen(true);
        setCoopView("join");
        changeScreen("menu");
      }
    } else {
      setCoopOpen(true);
    }
  }, [changeScreen]);

  const makeCoopHandlers = useCallback(() => ({
    onOpen: () => {
      const identity = localCoopIdentityRef.current;
      coopConnectionRef.current?.sendControl({ type: "hello", name: identity.name, pantId: identity.pantId });
    },
    onStatus: (status: "waiting" | "connecting" | "connected" | "closed") => {
      if (status === "waiting") setCoopPhase("waiting");
      else if (status === "connecting" && !coopPartnerRef.current) setCoopPhase("connecting");
    },
    onControl: (message: CoopMessage) => coopControlHandlerRef.current(message),
    onState: (message: CoopMessage) => coopStateHandlerRef.current(message),
    onError: (message: string) => handleCoopDisconnect(message),
    onClose: () => handleCoopDisconnect("Your co-op partner left the room."),
  }), [handleCoopDisconnect]);

  useEffect(() => {
    coopControlHandlerRef.current = (message) => {
      if (message.type === "hello") {
        const identity = readCoopIdentity(message, coopRoleRef.current === "host" ? "FIGHTER 02" : "FIGHTER 01");
        if (!identity) return;
        coopPartnerRef.current = identity;
        setCoopPartner(identity);
        setCoopPhase("ready");
        setCoopMessage(coopRoleRef.current === "host" ? "Both fighters are linked. Launch when ready." : "Linked to the host. Waiting for the run to launch.");
        return;
      }
      if (message.type === "start" && coopRoleRef.current === "guest") {
        const hostIdentity = readCoopIdentity(message.host, "FIGHTER 01");
        const guestIdentity = readCoopIdentity(message.guest, "FIGHTER 02");
        const cityId = typeof message.city === "string" && CITIES.some((item) => item.id === message.city) ? message.city as CityId : "neon";
        if (!hostIdentity || !guestIdentity) return;
        localCoopIdentityRef.current = guestIdentity;
        coopPartnerRef.current = hostIdentity;
        setCoopPartner(hostIdentity);
        setPlayerName(guestIdentity.name);
        setSelectedPant(guestIdentity.pantId);
        chooseCity(cityId);
        gameRef.current = freshRun(
          { id: "host", ...hostIdentity },
          { id: "guest", ...guestIdentity },
        );
        receivedSnapshotRef.current = 0;
        inputSequenceRef.current = 0;
        setResult(null);
        setSubmitted(false);
        setHud(INITIAL_HUD);
        setCoopOpen(false);
        audioRef.current?.resetForRun();
        changeScreen("playing");
        if (window.location.hash.startsWith("#coop=")) history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        return;
      }
      if (message.type === "screen" && coopRoleRef.current === "guest") {
        if (message.screen === "upgrade") {
          if (gameRef.current) gameRef.current.pendingUpgrade = true;
          setUpgrades([]);
          changeScreen("upgrade");
        } else if (message.screen === "playing") {
          if (gameRef.current) gameRef.current.pendingUpgrade = false;
          changeScreen("playing");
        } else if (message.screen === "gameover") {
          const nextResult = readResult(message.result);
          if (!nextResult) return;
          setResult(nextResult);
          setSubmitStatus("Only the host submits the shared squad score.");
          changeScreen("gameover");
          void fetchLeaderboard();
        }
        return;
      }
      if (message.type === "action" && coopRoleRef.current === "host") {
        const action = message.action;
        if (action === "attackQueued" || action === "dash" || action === "ability" || action === "swap" || action === "reload") {
          remoteActionsRef.current[action] = true;
        }
      }
    };

    coopStateHandlerRef.current = (message) => {
      if (message.type === "input" && coopRoleRef.current === "host") {
        if (!Number.isSafeInteger(message.seq) || (message.seq as number) <= receivedInputRef.current || !isRecord(message.input)) return;
        const dx = typeof message.input.dx === "number" && Number.isFinite(message.input.dx) ? clamp(message.input.dx, -1, 1) : 0;
        const dy = typeof message.input.dy === "number" && Number.isFinite(message.input.dy) ? clamp(message.input.dy, -1, 1) : 0;
        receivedInputRef.current = message.seq as number;
        remoteActionsRef.current.dx = dx;
        remoteActionsRef.current.dy = dy;
        remoteActionsRef.current.attack = message.input.attack === true;
        return;
      }
      if (message.type === "snapshot" && coopRoleRef.current === "guest") {
        if (!Number.isSafeInteger(message.seq) || (message.seq as number) <= receivedSnapshotRef.current || !isCoopSnapshot(message.state)) return;
        const snapshot = message.state;
        const host = snapshot.players.find((fighter) => fighter.id === "host");
        if (!host) return;
        snapshot.player = host;
        snapshot.pantId = host.pantId;
        snapshot.audioEvents = snapshot.audioEvents.slice(0, 24);
        receivedSnapshotRef.current = message.seq as number;
        gameRef.current = snapshot;
      }
    };
  }, [changeScreen, chooseCity, fetchLeaderboard]);

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
    localCoopIdentityRef.current = {
      name: normalizeFighterName(playerName, "FIGHTER"),
      pantId: selectedPant,
    };
  }, [playerName, selectedPant]);

  useEffect(() => {
    const invite = parseCoopInvite(window.location.hash);
    if (!invite) return;
    const openFrame = requestAnimationFrame(() => {
      setCoopView("join");
      setCoopPhase("idle");
      setCoopInviteUrl(window.location.href);
      setCoopRoomId(invite.roomId);
      setCoopMessage("Private invite detected. Join when your fighter is ready.");
      setCoopOpen(true);
    });
    return () => cancelAnimationFrame(openFrame);
  }, []);

  useEffect(() => () => {
    coopClosingRef.current = true;
    void coopConnectionRef.current?.close();
    coopConnectionRef.current = null;
  }, []);

  useEffect(() => {
    audioRef.current?.setPaused(screen !== "playing");
  }, [screen]);

  useEffect(() => {
    const savedName = localStorage.getItem("camo-clash-name");
    const savedCity = localStorage.getItem("camo-clash-city") as CityId | null;
    const nameFrame = savedName ? requestAnimationFrame(() => setPlayerName(savedName)) : 0;
    const validSavedCity = savedCity && CITIES.some((item) => item.id === savedCity) ? savedCity : "neon";
    selectedCityRef.current = validSavedCity;
    const cityFrame = requestAnimationFrame(() => setSelectedCity(validSavedCity));
    let cancelled = false;
    renderTexturesRef.current = createRenderTextures();
    arenaLayersRef.current = null;

    const loadImage = (key: string, source: string) => new Promise<void>((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (!cancelled) imagesRef.current[key] = image;
        resolve();
      };
      image.onerror = () => resolve();
      image.src = source;
    });

    for (const item of PANTS) void loadImage(item.id, item.asset);
    for (const [key, source] of [["zombie-walker", "/zombies/walker-sheet.png"], ["zombie-mutant", "/zombies/mutant-sheet-v2.png"]] as const) {
      void loadImage(key, source);
    }
    const scenery = [
      ["city-premium", "/pixel/city/camo-city-v2.webp"],
      ...CITY_LAYERS.map((source, index) => [`city-${index}`, source]),
      ["industrial", "/pixel/industrial-tileset.png"],
    ] as Array<[string, string]>;
    void Promise.all(scenery.map(([key, source]) => loadImage(key, source))).then(() => {
      if (!cancelled) arenaLayersRef.current = createArenaLayers(imagesRef.current, selectedCityRef.current);
    });

    const boardFrame = requestAnimationFrame(() => { void fetchLeaderboard(); });
    return () => {
      cancelled = true;
      if (nameFrame) cancelAnimationFrame(nameFrame);
      cancelAnimationFrame(cityFrame);
      cancelAnimationFrame(boardFrame);
      renderTexturesRef.current = null;
    };
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
        if (coopRoleRef.current) return;
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
    let mobileProfile = window.matchMedia("(any-pointer: coarse)").matches || window.innerWidth < 900;
    const measureBaseScale = () => {
      const rect = canvas.getBoundingClientRect();
      const cssScale = Math.max(rect.width / WORLD_W, rect.height / WORLD_H);
      if (!Number.isFinite(cssScale) || cssScale <= 0) return mobileProfile ? .66 : 1;
      if (mobileProfile) return clamp(cssScale * 1.15, .5, .76);
      return clamp(cssScale * Math.min(window.devicePixelRatio || 1, 1.25), .76, 1);
    };
    let baseScale = measureBaseScale();
    const minimumRenderScale = () => mobileProfile ? Math.max(.44, baseScale - .16) : Math.max(.68, baseScale - .22);
    const rememberedScale = Number(canvas.dataset.renderScale);
    let renderScale = Number.isFinite(rememberedScale) && rememberedScale > 0
      ? clamp(rememberedScale, minimumRenderScale(), baseScale)
      : baseScale;
    const initialWidth = Math.round(WORLD_W * renderScale);
    const initialHeight = Math.round(WORLD_H * renderScale);
    if (canvas.width !== initialWidth) canvas.width = initialWidth;
    if (canvas.height !== initialHeight) canvas.height = initialHeight;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;
    const configureCanvas = (scale: number) => {
      const width = Math.round(WORLD_W * scale);
      const height = Math.round(WORLD_H * scale);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      canvas.dataset.renderScale = scale.toFixed(2);
    };
    configureCanvas(renderScale);
    let frameId = 0;
    let last = performance.now();
    let accumulator = 0;
    let hudClock = 0;
    let snapshotClock = 0;
    let inputClock = 0;
    let tuneFrames = 0;
    let tuneCost = 0;
    let tuneCooldown = 0;
    let renderPressureTier = 0;
    let pressureRecoveryFrames = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const portraitHold = window.matchMedia("(orientation: portrait) and (any-pointer: coarse)");

    const refreshProfile = () => {
      mobileProfile = window.matchMedia("(any-pointer: coarse)").matches || window.innerWidth < 900;
      baseScale = measureBaseScale();
      renderScale = clamp(renderScale, minimumRenderScale(), baseScale);
      configureCanvas(renderScale);
    };
    window.addEventListener("resize", refreshProfile, { passive: true });

    const frame = (now: number) => {
      const state = gameRef.current;
      if (!state || screenRef.current !== "playing") return;
      frameId = requestAnimationFrame(frame);
      if (portraitHold.matches) {
        last = now;
        accumulator = 0;
        return;
      }
      const processingStart = performance.now();
      const elapsed = Math.min(.05, Math.max(0, (now - last) / 1000));
      last = now;
      accumulator = Math.min(.1, accumulator + elapsed);
      let simulationSteps = 0;
      const activeRole = coopRoleRef.current;
      if (activeRole === "guest") {
        accumulator = 0;
        inputClock += elapsed;
        hudClock += elapsed;
        if (inputClock >= 1 / 30) {
          inputClock %= 1 / 30;
          let dx = actionsRef.current.dx + (keysRef.current.has("d") || keysRef.current.has("arrowright") ? 1 : 0) - (keysRef.current.has("a") || keysRef.current.has("arrowleft") ? 1 : 0);
          let dy = actionsRef.current.dy + (keysRef.current.has("s") || keysRef.current.has("arrowdown") ? 1 : 0) - (keysRef.current.has("w") || keysRef.current.has("arrowup") ? 1 : 0);
          const length = Math.hypot(dx, dy);
          if (length > 1) { dx /= length; dy /= length; }
          coopConnectionRef.current?.sendState({
            type: "input",
            seq: ++inputSequenceRef.current,
            input: { dx, dy, attack: actionsRef.current.attack || keysRef.current.has(" ") || keysRef.current.has("j") },
          });
          for (const action of ["attackQueued", "dash", "ability", "swap", "reload"] as const) {
            if (actionsRef.current[action] && coopConnectionRef.current?.sendControl({ type: "action", action })) actionsRef.current[action] = false;
          }
        }
        simulationSteps = 1;
      } else {
        while (accumulator >= FIXED_STEP && simulationSteps < 3) {
          updateGame(state, FIXED_STEP, keysRef.current, actionsRef.current, activeRole === "host" ? remoteActionsRef.current : undefined);
          accumulator -= FIXED_STEP;
          hudClock += FIXED_STEP;
          snapshotClock += FIXED_STEP;
          simulationSteps += 1;
        }
        if (activeRole === "host" && snapshotClock >= .05) {
          snapshotClock %= .05;
          coopConnectionRef.current?.sendState({
            type: "snapshot",
            seq: ++snapshotSequenceRef.current,
            state: { ...state, audioEvents: state.audioEvents.slice() },
          });
        }
      }
      if (simulationSteps === 0) return;
      if (state.audioEvents.length > 0) {
        const audio = audioRef.current;
        for (let index = 0; index < state.audioEvents.length; index += 1) {
          const event = state.audioEvents[index];
          const pan = clamp((event.x / WORLD_W) * 2 - 1, -0.8, 0.8);
          if (event.cue) audio?.playCue(event.cue, { pan, volume: event.volume, intensity: event.intensity });
          else if (event.sound) audio?.play(event.sound, { pan, entityId: event.entityId, volume: event.volume });
        }
        state.audioEvents.length = 0;
      }
      if (canvas.width !== Math.round(WORLD_W * renderScale) || canvas.height !== Math.round(WORLD_H * renderScale)) configureCanvas(renderScale);
      const quality = clamp(renderScale / baseScale, .5, 1);
      const scalePressure = (baseScale - renderScale) / Math.max(.01, baseScale - minimumRenderScale());
      let livingEnemies = 0;
      for (const enemy of state.enemies) if (!enemy.dead) livingEnemies += 1;
      const requestedPressureTier = scalePressure > .78
        || (mobileProfile && livingEnemies >= 15)
        || state.effects.length >= 80
        || state.projectiles.length >= 40
        ? 2
        : scalePressure > .35
          || (mobileProfile && livingEnemies >= 10)
          || state.effects.length >= 48
          || state.projectiles.length >= 20
          ? 1 : 0;
      if (requestedPressureTier > renderPressureTier) {
        renderPressureTier = requestedPressureTier;
        pressureRecoveryFrames = 0;
      } else if (requestedPressureTier < renderPressureTier) {
        pressureRecoveryFrames += 1;
        if (pressureRecoveryFrames >= 90) {
          renderPressureTier -= 1;
          pressureRecoveryFrames = 0;
        }
      } else {
        pressureRecoveryFrames = 0;
      }
      const localPlayerId: FighterId = activeRole === "guest" ? "guest" : "host";
      drawGame(ctx, state, imagesRef.current, arenaLayersRef.current, renderTexturesRef.current, getCity(selectedCityRef.current), reducedMotion, mobileProfile, quality, renderPressureTier, localPlayerId);
      if (hudClock > 0.1) {
        hudClock %= .1;
        const localPlayer = state.players.find((fighter) => fighter.id === localPlayerId) ?? state.player;
        const partner = state.players.find((fighter) => fighter.id !== localPlayerId);
        const nearPickup = state.pickups.find((pickup) => pickup.id === localPlayer.nearPickupId);
        let enemyCount = 0;
        for (const enemy of state.enemies) if (!enemy.dead) enemyCount += 1;
        const nextHud: Hud = {
          health: Math.round(localPlayer.hp * 10) / 10,
          maxHealth: localPlayer.maxHp,
          score: state.score,
          wave: state.waveClearTimer > 0 ? Math.max(1, state.wave - 1) : state.wave,
          combo: state.combo,
          abilityCd: Math.ceil(localPlayer.abilityCd * 10) / 10,
          dashCd: Math.ceil(localPlayer.dashCd * 10) / 10,
          enemies: enemyCount,
          weapon: localPlayer.weapon.kind,
          ammo: localPlayer.weapon.ammo,
          reserve: localPlayer.weapon.reserve,
          durability: localPlayer.weapon.durability,
          reloading: localPlayer.action === "reload",
          nearWeapon: nearPickup?.weapon.kind ?? null,
          partnerHealth: partner ? Math.round(partner.hp * 10) / 10 : 0,
          partnerMaxHealth: partner?.maxHp ?? 100,
          partnerName: partner?.name ?? "FIGHTER 02",
          partnerPant: partner?.pantId ?? null,
          partnerConnected: Boolean(partner?.connected),
        };
        setHud((current) => hudMatches(current, nextHud) ? current : nextHud);
      }
      if (activeRole !== "guest" && state.players.filter((fighter) => fighter.connected).every((fighter) => fighter.hp <= 0) && state.gameOverTimer <= 0) {
        cancelAnimationFrame(frameId);
        const finalResult: Result = { runId: state.runId, score: state.score, wave: state.wave, kills: state.kills, maxCombo: state.maxCombo, elapsed: state.elapsed, mode: state.mode };
        setResult(finalResult);
        if (activeRole === "host") coopConnectionRef.current?.sendControl({ type: "screen", screen: "gameover", result: finalResult });
        setSubmitStatus("");
        changeScreen("gameover");
        void fetchLeaderboard();
        return;
      }
      if (activeRole !== "guest" && state.pendingUpgrade) {
        cancelAnimationFrame(frameId);
        const choices = pickUpgradeChoices(state.player);
        setUpgrades(choices);
        if (activeRole === "host") coopConnectionRef.current?.sendControl({ type: "screen", screen: "upgrade" });
        changeScreen("upgrade");
        return;
      }

      tuneCost += performance.now() - processingStart;
      tuneFrames += 1;
      tuneCooldown = Math.max(0, tuneCooldown - 1);
      if (tuneFrames >= 24) {
        const averageCost = tuneCost / tuneFrames;
        const minimumScale = minimumRenderScale();
        if (tuneCooldown === 0 && averageCost > 11.5 && renderScale > minimumScale + .01) {
          renderScale = Math.max(minimumScale, renderScale - .08);
          tuneCooldown = 24;
        } else if (tuneCooldown === 0 && averageCost < 6.5 && renderScale < baseScale - .01) {
          renderScale = Math.min(baseScale, renderScale + .04);
          tuneCooldown = 180;
        }
        tuneFrames = 0;
        tuneCost = 0;
      }
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", refreshProfile);
    };
  }, [screen, changeScreen, fetchLeaderboard]);

  const toggleSound = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    localStorage.setItem("camo-clash-muted", String(nextMuted));
    audioRef.current?.setMuted(nextMuted);
    if (!nextMuted) void audioRef.current?.unlock();
  };

  const startRun = () => {
    if (coopConnectionRef.current) {
      coopClosingRef.current = true;
      void coopConnectionRef.current.close();
      coopConnectionRef.current = null;
      coopRoleRef.current = null;
      setCoopRole(null);
    }
    audioRef.current?.resetForRun();
    if (!muted) void audioRef.current?.unlock();
    const normalized = playerName.trim().slice(0, 18) || "FIGHTER";
    setPlayerName(normalized);
    localStorage.setItem("camo-clash-name", normalized);
    gameRef.current = freshRun({ id: "host", name: normalized, pantId: selectedPant });
    setResult(null);
    setSubmitted(false);
    setHud(INITIAL_HUD);
    changeScreen("playing");
  };

  const chooseUpgrade = (upgrade: Upgrade) => {
    const state = gameRef.current;
    if (!state) return;
    for (const fighter of state.players) upgrade.apply(fighter);
    state.pendingUpgrade = false;
    if (coopRoleRef.current === "host") coopConnectionRef.current?.sendControl({ type: "screen", screen: "playing" });
    changeScreen("playing");
  };

  const openCoopLobby = () => {
    setCoopView("choose");
    setCoopPhase("idle");
    setCoopMessage("");
    setCoopRoomId("");
    setCoopInviteUrl("");
    setCoopPartner(null);
    coopPartnerRef.current = null;
    setCoopOpen(true);
  };

  const createPrivateRoom = async () => {
    coopClosingRef.current = false;
    setCoopView("host");
    setCoopPhase("creating");
    setCoopMessage("Opening a private room…");
    const identity: CoopIdentity = { name: normalizeFighterName(playerName, "FIGHTER 01"), pantId: selectedPant };
    localCoopIdentityRef.current = identity;
    coopRoleRef.current = "host";
    setCoopRole("host");
    try {
      if (coopConnectionRef.current) await coopConnectionRef.current.close();
      const room = await createCoopRoom(makeCoopHandlers());
      coopConnectionRef.current = room.connection;
      setCoopRoomId(room.roomId);
      setCoopInviteUrl(buildCoopInviteUrl(room.roomId, room.inviteToken));
      setCoopPhase("waiting");
      setCoopMessage("Room live. Send the private link to your second fighter.");
    } catch (cause) {
      coopConnectionRef.current = null;
      coopRoleRef.current = null;
      setCoopRole(null);
      setCoopPhase("error");
      setCoopMessage(cause instanceof Error ? cause.message : "The private room could not be created.");
    }
  };

  const joinPrivateRoom = async (input: string) => {
    const invite = parseCoopInvite(input);
    if (!invite) {
      setCoopPhase("error");
      setCoopMessage("That invite link is incomplete. Ask the host to copy the full private link.");
      return;
    }
    coopClosingRef.current = false;
    setCoopView("join");
    setCoopPhase("connecting");
    setCoopMessage("Joining the room and forming a direct link…");
    const identity: CoopIdentity = { name: normalizeFighterName(playerName, "FIGHTER 02"), pantId: selectedPant };
    localCoopIdentityRef.current = identity;
    coopRoleRef.current = "guest";
    setCoopRole("guest");
    try {
      if (coopConnectionRef.current) await coopConnectionRef.current.close(false);
      const room = await joinCoopRoom(invite, makeCoopHandlers());
      coopConnectionRef.current = room.connection;
      setCoopRoomId(room.roomId);
      setCoopInviteUrl(input.trim());
      setCoopPhase("connecting");
    } catch (cause) {
      coopConnectionRef.current = null;
      coopRoleRef.current = null;
      setCoopRole(null);
      setCoopPhase("error");
      setCoopMessage(cause instanceof Error ? cause.message : "The private room could not be joined.");
    }
  };

  const leaveCoop = () => {
    coopClosingRef.current = true;
    const connection = coopConnectionRef.current;
    coopConnectionRef.current = null;
    void connection?.close();
    coopRoleRef.current = null;
    coopPartnerRef.current = null;
    remoteActionsRef.current = createInputState();
    setCoopRole(null);
    setCoopPartner(null);
    setCoopOpen(false);
    setCoopPhase("idle");
    setCoopMessage("");
    gameRef.current = null;
    if (window.location.hash.startsWith("#coop=")) history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    changeScreen("menu");
  };

  const startCoopRun = () => {
    if (coopRoleRef.current !== "host" || !coopPartnerRef.current || !coopConnectionRef.current) return;
    audioRef.current?.resetForRun();
    if (!muted) void audioRef.current?.unlock();
    const host = localCoopIdentityRef.current;
    const guest = coopPartnerRef.current;
    gameRef.current = freshRun({ id: "host", ...host }, { id: "guest", ...guest });
    remoteActionsRef.current = createInputState();
    snapshotSequenceRef.current = 0;
    receivedInputRef.current = 0;
    setResult(null);
    setSubmitted(false);
    setHud(INITIAL_HUD);
    coopConnectionRef.current.sendControl({ type: "start", host, guest, city: selectedCityRef.current });
    setCoopOpen(false);
    changeScreen("playing");
  };

  const copyInvite = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCoopMessage("Invite copied. Send it to your second fighter.");
    } catch {
      const field = document.createElement("textarea");
      field.value = value;
      field.readOnly = true;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
      setCoopMessage("Invite copied. Send it to your second fighter.");
    }
  };

  const shareInvite = async (value: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Camo Clash Co-op", text: "Join my Camo Clash squad", url: value });
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
      }
    }
    await copyInvite(value);
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
    const knob = stick.firstElementChild as HTMLElement | null;
    if (knob) knob.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0)`;
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
    const knob = event.currentTarget.firstElementChild as HTMLElement | null;
    if (knob) knob.style.transform = "translate3d(-50%, -50%, 0)";
  };

  const healthPercent = clamp((hud.health / hud.maxHealth) * 100, 0, 100);
  const partnerHealthPercent = clamp((hud.partnerHealth / Math.max(1, hud.partnerMaxHealth)) * 100, 0, 100);
  const threat = Math.min(5, 1 + Math.floor((hud.wave - 1) / 3));
  const localLobbySlot: CoopPlayerSlot = {
    name: normalizeFighterName(playerName, coopRole === "guest" ? "FIGHTER 02" : "FIGHTER 01"),
    pant: pant.callSign,
    accent: pant.color,
    connected: true,
    ready: coopPhase === "ready",
  };
  const partnerLobbySlot: CoopPlayerSlot | null = coopPartner ? {
    name: coopPartner.name,
    pant: getPant(coopPartner.pantId).callSign,
    accent: getPant(coopPartner.pantId).color,
    connected: true,
    ready: true,
  } : null;
  const hostLobbySlot = coopRole === "guest"
    ? partnerLobbySlot ?? { name: "HOST LINKING", pant: "AWAITING LOADOUT", connected: false }
    : localLobbySlot;
  const guestLobbySlot = coopRole === "guest" ? localLobbySlot : partnerLobbySlot;

  return (
    <main
      className={`game-shell ${screen !== "menu" && screen !== "leaderboard" ? "is-fighting" : ""} ${coopRole ? "is-coop" : ""}`}
      data-city={selectedCity}
      style={{ "--pant-accent": pant.color, "--city-accent": city.accent, "--city-accent-alt": city.accentAlt } as React.CSSProperties}
    >
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
              <div className="city-picker" aria-label="Choose the city backdrop">
                <div className="city-picker-heading"><span>SELECT CITY</span><strong>{city.code}</strong></div>
                <div className="city-options">
                  {CITIES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selectedCity === item.id}
                      className={selectedCity === item.id ? "selected" : ""}
                      onClick={() => chooseCity(item.id)}
                      style={{ "--district-color": item.accent, "--district-color-alt": item.accentAlt } as React.CSSProperties}
                    >
                      <i /><span><strong>{item.name}</strong><small>{item.tagline}</small></span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="hero-actions">
                <button className="primary-button" onClick={startRun}>ENTER THE STREET <span>-&gt;</span></button>
                <button type="button" className="coop-entry" onClick={openCoopLobby}>CO-OP // INVITE</button>
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

      {screen === "menu" && coopOpen && (
        <CoopLobby
          key={`${coopView}:${coopInviteUrl}:${coopRoomId}`}
          view={coopView}
          phase={coopPhase}
          roomCode={coopRoomId ? coopRoomId.slice(0, 6).toUpperCase() : ""}
          inviteUrl={coopInviteUrl}
          message={coopMessage}
          host={hostLobbySlot}
          guest={guestLobbySlot}
          canStart={coopRole === "host" && coopPhase === "ready" && Boolean(coopPartner)}
          onClose={() => { if (coopConnectionRef.current) leaveCoop(); else setCoopOpen(false); }}
          onChoose={(view) => { setCoopView(view); setCoopPhase("idle"); setCoopMessage(""); }}
          onCreate={() => { void createPrivateRoom(); }}
          onJoin={(value) => { void joinPrivateRoom(value); }}
          onCopy={(value) => { void copyInvite(value); }}
          onShare={(value) => { void shareInvite(value); }}
          onStart={startCoopRun}
          onCancel={() => {
            if (coopConnectionRef.current) leaveCoop();
            else if (coopView !== "choose") { setCoopView("choose"); setCoopPhase("idle"); setCoopMessage(""); }
            else setCoopOpen(false);
          }}
        />
      )}

      {screen !== "menu" && screen !== "leaderboard" && (
        <section className="arena-screen">
          <canvas ref={canvasRef} className="fight-canvas" role="img" aria-label="Camo Clash fight arena. Survive progressively harder enemy waves.">Camo Clash is an action game. Use the listed keyboard or touch controls to fight.</canvas>
          <div className="hud">
            <div className="squad-hud">
              <div className={`hud-player cut-panel ${healthPercent <= 25 ? "critical" : ""}`}>
                <div className="hud-name"><span>{playerName}</span><small>{pant.callSign}</small></div>
                <div className="health-track" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={hud.maxHealth} aria-valuenow={Math.round(hud.health)}>
                  <span style={{ width: `${healthPercent}%` }} />
                </div>
                <div className="health-label">HP {Math.ceil(hud.health)} / {hud.maxHealth}</div>
              </div>
              {coopRole && hud.partnerPant && (
                <div className="partner-hud" style={{ "--partner-accent": getPant(hud.partnerPant).color, "--partner-health": `${partnerHealthPercent}%` } as React.CSSProperties}>
                  <span>{hud.partnerName} · {getPant(hud.partnerPant).callSign}</span>
                  <strong>{!hud.partnerConnected ? "OFFLINE" : hud.partnerHealth <= 0 ? "DOWN" : `${Math.ceil(hud.partnerHealth)} HP`}</strong>
                  <div className="partner-health"><i /></div>
                </div>
              )}
            </div>
            <div className="wave-hud">
              <small>WAVE</small><strong>{String(hud.wave).padStart(2, "0")}</strong>
              <div className="threat-pips" aria-label={`Threat level ${threat} of 5`}>{[1, 2, 3, 4, 5].map((level) => <i key={level} className={level <= threat ? "active" : ""} />)}</div>
              <span>{hud.enemies} ON BLOCK</span>
            </div>
            <div className="score-hud"><small>{coopRole ? "SQUAD SCORE" : "SCORE"}</small><strong>{hud.score.toLocaleString().padStart(7, "0")}</strong>{hud.combo > 1 && <span key={hud.combo}>{hud.combo} KO STREAK · x{Math.min(3, 1 + Math.floor(hud.combo / 3) * .1).toFixed(1)} SCORE</span>}</div>
          </div>
          <span className="sr-status" aria-live="polite">Wave {hud.wave}. {hud.abilityCd <= 0 ? `${pant.ability} ready.` : ""}</span>
          <div className="weapon-hud" aria-label={`${WEAPONS[hud.weapon].label} weapon status`}>
            <div className="weapon-slot active cut-panel">
              <img src={WEAPONS[hud.weapon].icon} alt="" />
              <span><strong>{WEAPONS[hud.weapon].label}</strong>{WEAPONS[hud.weapon].firearm ? (hud.reloading ? "RELOADING" : `${hud.ammo} / ${hud.reserve}`) : hud.weapon === "fists" ? "UNBREAKABLE" : `DUR ${hud.durability}`}</span>
            </div>
            {hud.nearWeapon && <span className="weapon-prompt">SWAP FOR {WEAPONS[hud.nearWeapon].label}</span>}
          </div>
          <div className="desktop-controls"><span>WASD MOVE</span><span>SPACE ATTACK</span><span>SHIFT DASH</span><span>E ABILITY</span><span>Q SWAP</span><span>R RELOAD</span></div>
          <button type="button" className="pause-button" onClick={() => { if (coopRole) leaveCoop(); else changeScreen("paused"); }} aria-label={coopRole ? "Leave co-op run" : "Pause game"}>{coopRole ? "×" : "II"}</button>
          <button type="button" className="sound-button" aria-pressed={muted} aria-label={muted ? "Turn game sound effects on" : "Mute game sound effects"} onClick={toggleSound}>SFX<br />{muted ? "OFF" : "ON"}</button>
          <div className="district-tag" aria-label={`Current city: ${city.name}`}><span>{city.code}</span><strong>{city.name}</strong></div>
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
              <div className="pause-panel cut-panel">
                <p className="eyebrow">FIGHT ON HOLD</p><h2 id="pause-title">PAUSED</h2>
                <div className="pause-city-picker"><span>BACKDROP</span>{CITIES.map((item) => <button key={item.id} type="button" className={selectedCity === item.id ? "selected" : ""} aria-pressed={selectedCity === item.id} onClick={() => chooseCity(item.id)}>{item.code}</button>)}</div>
                <button className="primary-button" onClick={() => { if (!muted) void audioRef.current?.unlock(); changeScreen("playing"); }}>BACK TO THE BLOCK</button><button type="button" className="text-button" aria-pressed={muted} onClick={toggleSound}>GAME SFX: {muted ? "OFF" : "ON"}</button><button className="text-button" onClick={() => changeScreen("menu")}>QUIT RUN</button>
              </div>
            </div>
          )}

          {screen === "upgrade" && (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
              <div className="upgrade-panel">
                <p className="eyebrow">WAVE CLEARED // {coopRole === "guest" ? "HOST SELECTING" : "CHOOSE ONE"}</p><h2 id="upgrade-title">LEVEL UP THE FIT</h2>
                {coopRole === "guest"
                  ? <div className="coop-guest-wait"><i aria-hidden="true" /><strong>SQUAD UPGRADE PENDING</strong><span>The host is choosing a boost for both fighters.</span></div>
                  : <div className="upgrade-grid">{upgrades.map((upgrade, index) => <button key={upgrade.id} onClick={() => chooseUpgrade(upgrade)}><span>0{index + 1}</span><strong>{upgrade.name}</strong><small>{upgrade.description}</small></button>)}</div>}
              </div>
            </div>
          )}

          {screen === "gameover" && result && (
            <div className="modal-backdrop results-backdrop" role="dialog" aria-modal="true" aria-labelledby="results-title">
              <div className="results-panel cut-panel">
                <div><p className="eyebrow">RUN TERMINATED</p><h2 id="results-title">OVERRUN</h2><p className="result-score">{result.score.toLocaleString()}</p><span className="score-caption">FINAL SCORE</span></div>
                <div className="result-stats"><div><strong>{result.wave}</strong><span>WAVE</span></div><div><strong>{result.kills}</strong><span>KOs</span></div><div><strong>x{result.maxCombo}</strong><span>MAX COMBO</span></div><div><strong>{formatTime(result.elapsed)}</strong><span>SURVIVED</span></div></div>
                <div className="submit-block"><label htmlFor="result-name">{result.mode === "coop" ? "SQUAD HOST" : "FIGHTER NAME"}</label><input id="result-name" maxLength={18} value={playerName} onChange={(event) => setPlayerName(event.target.value)} disabled={coopRole === "guest"} />{coopRole !== "guest" && <button className="primary-button" disabled={submitted} onClick={submitScore}>{submitted ? "SCORE LOCKED" : "SUBMIT SCORE"}</button>}<p role="status">{submitStatus}</p></div>
                <div className="result-actions"><button onClick={result.mode === "coop" ? (coopRole === "host" ? startCoopRun : undefined) : startRun} disabled={result.mode === "coop" && coopRole !== "host"}>{result.mode === "coop" && coopRole === "guest" ? "WAITING FOR HOST" : "FIGHT AGAIN"}</button><button onClick={() => { setResult(null); if (result.mode === "coop") leaveCoop(); else changeScreen("menu"); }}>CHANGE PANTS</button><button onClick={openLeaderboard}>LEADERBOARD</button></div>
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
                return <div className={`board-row ${entry.rank <= 3 ? "podium" : ""}`} role="row" key={entry.id} style={{ "--row-accent": entryPant.color } as React.CSSProperties}><span>#{String(entry.rank).padStart(2, "0")}</span><strong>{entry.playerName}</strong><span className="board-fit"><img src={entryPant.asset} alt="" />{entryPant.callSign}{entry.mode === "coop" ? " · DUO" : ""}</span><span>{entry.wave}</span><span>{entry.kills}</span><b>{entry.score.toLocaleString()}</b></div>;
              })}
            </div>
          )}
          <p className="honor-note">Leaderboard scores are public run records. Competitive anti-cheat validation will be strengthened as the game grows.</p>
        </section>
      )}
    </main>
  );
}
