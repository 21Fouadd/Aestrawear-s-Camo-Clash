import { PANTS, getPant, type PantId } from "./game-config";

export type { PantId } from "./game-config";
export type ZombieSoundId = "spawn" | "attack" | "hurt" | "death";
export type GameCueId = "swing" | "impact" | "gun" | "playerHurt" | "pickup" | "heal" | "revive" | "reload" | "waveClear" | "kittyHit" | "bossTransform" | "bossCuteVoice" | "bossZombieVoice";

export const WORLD_W = 1280;
export const WORLD_H = 720;
export const ARENA = { left: 72, right: 1208, top: 250, bottom: 630 };
export const STREET_HORIZON = ARENA.top - 38;

export type Screen = "menu" | "playing" | "paused" | "upgrade" | "gameover" | "leaderboard";
export type FighterId = "host" | "guest";
export type GameMode = "solo" | "coop";
export type EnemyKind = "thug" | "runner" | "brute" | "thrower" | "walker" | "kitty" | "kittyBoss";
export type EnemyState = "enter" | "chase" | "windup" | "active" | "recover" | "hurt" | "dead";
export type PlayerAction = "idle" | "attack" | "dash" | "reload" | "hurt" | "dead";
export type WeaponKind = "fists" | "bat" | "knife" | "pistol" | "shotgun";
export type CityId = "neon" | "harbor" | "blackout";
export type BodyStyle = "male" | "female";
export type FaceStyle = "classic" | "soft" | "sharp";
export type SkinToneId = "porcelain" | "sand" | "olive" | "brown" | "deep" | "ebony";
export type HairStyle = "buzz" | "fade" | "curls" | "braids" | "bob" | "ponytail";
export type HairColorId = "black" | "brown" | "blonde" | "copper" | "pink" | "silver";
export type CharacterLook = {
  body: BodyStyle;
  face: FaceStyle;
  skinTone: SkinToneId;
  hair: HairStyle;
  hairColor: HairColorId;
};
export type AttackSpec = {
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

export type WeaponDefinition = {
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

export type HeldWeapon = {
  kind: WeaponKind;
  ammo: number;
  reserve: number;
  durability: number;
};

export type Enemy = {
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

export type Projectile = {
  id: number;
  owner: "player" | "enemy";
  kind: "bullet" | "pellet" | "thrown" | "labubu";
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

export type WeaponPickup = {
  id: number;
  x: number;
  y: number;
  weapon: HeldWeapon;
  life: number;
  bob: number;
  pickupLock: number;
};
export type MedkitPickup = {
  id: number;
  x: number;
  y: number;
  life: number;
  bob: number;
  healAmount: number;
};
export type Effect = {
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
  kind: "hit" | "ring" | "text" | "trail" | "bolt" | "slash" | "burst" | "blood" | "dust" | "muzzle" | "tracer";
};

export type Player = {
  id: FighterId;
  name: string;
  pantId: PantId;
  look: CharacterLook;
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
  reviveProgress: number;
  reviveBy: FighterId | null;
};

export type PlayerInputState = {
  dx: number;
  dy: number;
  attack: boolean;
  attackQueued: boolean;
  dash: boolean;
  ability: boolean;
  swap: boolean;
  reload: boolean;
  revive: boolean;
};

export type FighterSetup = { id: FighterId; name: string; pantId: PantId; look?: CharacterLook };
export type CoopIdentity = { name: string; pantId: PantId; look: CharacterLook };

export type GameState = {
  runId: string;
  mode: GameMode;
  pantId: PantId;
  player: Player;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: WeaponPickup[];
  medkits: MedkitPickup[];
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
  killsSinceMedkit: number;
  waveSpawnCount: number;
  bossDialogue: string;
  bossDialogueTimer: number;
};
export type Result = { runId: string; score: number; wave: number; kills: number; maxCombo: number; elapsed: number; mode: GameMode };
export type Upgrade = {
  id: string;
  name: string;
  description: string;
  apply: (player: Player) => void;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPantId(value: unknown): value is PantId {
  return typeof value === "string" && PANTS.some((item) => item.id === value);
}

const BODY_STYLES = new Set<BodyStyle>(["male", "female"]);
const FACE_STYLES = new Set<FaceStyle>(["classic", "soft", "sharp"]);
const SKIN_TONES = new Set<SkinToneId>(["porcelain", "sand", "olive", "brown", "deep", "ebony"]);
const HAIR_STYLES = new Set<HairStyle>(["buzz", "fade", "curls", "braids", "bob", "ponytail"]);
const HAIR_COLORS = new Set<HairColorId>(["black", "brown", "blonde", "copper", "pink", "silver"]);

export const DEFAULT_CHARACTER_LOOK: CharacterLook = {
  body: "male",
  face: "classic",
  skinTone: "brown",
  hair: "fade",
  hairColor: "black",
};

export function isCharacterLook(value: unknown): value is CharacterLook {
  return isRecord(value)
    && BODY_STYLES.has(value.body as BodyStyle)
    && FACE_STYLES.has(value.face as FaceStyle)
    && SKIN_TONES.has(value.skinTone as SkinToneId)
    && HAIR_STYLES.has(value.hair as HairStyle)
    && HAIR_COLORS.has(value.hairColor as HairColorId);
}

export function normalizeCharacterLook(value: unknown): CharacterLook {
  if (!isRecord(value)) return { ...DEFAULT_CHARACTER_LOOK };
  return {
    body: BODY_STYLES.has(value.body as BodyStyle) ? value.body as BodyStyle : DEFAULT_CHARACTER_LOOK.body,
    face: FACE_STYLES.has(value.face as FaceStyle) ? value.face as FaceStyle : DEFAULT_CHARACTER_LOOK.face,
    skinTone: SKIN_TONES.has(value.skinTone as SkinToneId) ? value.skinTone as SkinToneId : DEFAULT_CHARACTER_LOOK.skinTone,
    hair: HAIR_STYLES.has(value.hair as HairStyle) ? value.hair as HairStyle : DEFAULT_CHARACTER_LOOK.hair,
    hairColor: HAIR_COLORS.has(value.hairColor as HairColorId) ? value.hairColor as HairColorId : DEFAULT_CHARACTER_LOOK.hairColor,
  };
}

export function normalizeFighterName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 18) || fallback;
}

export function readCoopIdentity(value: unknown, fallback: string): CoopIdentity | null {
  if (!isRecord(value) || !isPantId(value.pantId)) return null;
  return { name: normalizeFighterName(value.name, fallback), pantId: value.pantId, look: normalizeCharacterLook(value.look) };
}

export function isCoopSnapshot(value: unknown): value is GameState {
  if (!isRecord(value) || value.mode !== "coop" || !Array.isArray(value.players) || value.players.length !== 2) return false;
  if (!Array.isArray(value.enemies) || !Array.isArray(value.projectiles) || !Array.isArray(value.pickups) || !Array.isArray(value.effects) || !Array.isArray(value.audioEvents)) return false;
  if (typeof value.runId !== "string" || typeof value.wave !== "number" || typeof value.score !== "number") return false;
  return value.players.every((fighter) => isRecord(fighter)
    && (fighter.id === "host" || fighter.id === "guest")
    && isPantId(fighter.pantId)
    && (fighter.look === undefined || isCharacterLook(fighter.look))
    && typeof fighter.x === "number"
    && typeof fighter.y === "number"
    && typeof fighter.hp === "number"
    && isRecord(fighter.weapon));
}

export function readResult(value: unknown): Result | null {
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

export const ENEMIES: Record<EnemyKind, {
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
  kitty: { hp: 82, speed: 205, damage: 12, radius: 25, cost: 3.1, score: 330, unlock: 4, windup: 0.3, active: 0.04, recovery: 0.38, attackRange: 520, lunge: 0, mass: 0.72, color: "#ff4778" },
  kittyBoss: { hp: 1100, speed: 84, damage: 17, radius: 66, cost: 99, score: 2500, unlock: 5, windup: 0.5, active: 0.06, recovery: 0.52, attackRange: 520, lunge: 0, mass: 3.5, color: "#ff4fa0" },
};

export const ENEMY_KINDS: EnemyKind[] = ["thug", "runner", "brute", "thrower", "walker", "kitty"];
export const MIN_WINDUPS: Record<EnemyKind, number> = {
  thug: .24,
  runner: .2,
  brute: .62,
  thrower: .45,
  walker: .36,
  kitty: .24,
  kittyBoss: .38,
};
export const ENEMY_SKIN_TONES = ["#c98e67", "#9b6547", "#d6a17b", "#77503c"];
export const solidEnemiesScratch: Enemy[] = [];
const livingPlayersScratch: Player[] = [];

export const WEAPONS: Record<WeaponKind, WeaponDefinition> = {
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
export const MAX_EFFECTS = 96;
export const FIXED_STEP = 1 / 60;
export const REVIVE_RANGE = 92;
export const REVIVE_DURATION = 2.2;
export const MEDKIT_HEAL = 35;

export const UPGRADES: Upgrade[] = [
  { id: "hands", name: "Heavy Hands", description: "+15% strike damage", apply: (p) => { p.damageMult += 0.15; } },
  { id: "stitch", name: "Hard Stitch", description: "+20 max health and heal 20", apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: "feet", name: "Quick Feet", description: "+10% movement speed", apply: (p) => { p.speedMult += 0.1; } },
  { id: "thread", name: "Fast Thread", description: "Pant ability recharges 12% faster", apply: (p) => { p.cooldownMult = Math.max(0.58, p.cooldownMult - 0.12); } },
  { id: "reach", name: "Long Reach", description: "+12% attack reach", apply: (p) => { p.rangeMult += 0.12; } },
  { id: "wind", name: "Second Wind", description: "+5 health after every wave", apply: (p) => { p.waveHeal += 5; } },
];

export function pickUpgradeChoices(player: Player) {
  const pool = UPGRADES.filter((upgrade) => upgrade.id !== "thread" || player.cooldownMult > 0.581);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, 3);
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export function kittyBossPhaseForHealth(hp: number, maxHp: number): 0 | 1 | 2 | 3 {
  const ratio = clamp(hp / Math.max(1, maxHp), 0, 1);
  if (ratio > .78) return 0;
  if (ratio > .52) return 1;
  if (ratio > .26) return 2;
  return 3;
}
export const distanceSquared = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
export const budgetForWave = (wave: number, mode: GameMode = "solo") => {
  const base = Math.min(80, 5 + wave * 1.55 + Math.floor(wave / 5) * 2.5);
  return base * (wave % 5 === 0 ? 1.18 : 1) * (mode === "coop" ? 1.65 : 1);
};
export const COLORS = {
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

export function makeWeapon(kind: WeaponKind): HeldWeapon {
  const definition = WEAPONS[kind];
  return {
    kind,
    ammo: definition.firearm ? definition.magazine : 0,
    reserve: definition.firearm ? definition.pickupReserve : 0,
    durability: definition.maxDurability,
  };
}

export function segmentPointDistanceSquared(
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

export function enemyCombatY(enemy: Enemy) {
  if (enemy.kind === "kittyBoss") return enemy.y - 145;
  if (enemy.kind === "kitty") return enemy.y - 64;
  if (enemy.kind === "brute") return enemy.y - 54;
  return enemy.y - 46;
}

export function nearestLivingEnemy(state: GameState, player: Player, range: number) {
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

export function createPlayer(setup: FighterSetup, x: number): Player {
  return {
      id: setup.id,
      name: setup.name,
      pantId: setup.pantId,
      look: normalizeCharacterLook(setup.look),
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
      reviveProgress: 0,
      reviveBy: null,
  };
}

export function createRunId() {
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

export function freshRun(hostInput: PantId | FighterSetup, guest?: FighterSetup): GameState {
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
    medkits: [
      { id: guest ? 3 : 2, x: 640, y: 560, life: 999, bob: .7, healAmount: MEDKIT_HEAL },
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
    nextPickupId: guest ? 4 : 3,
    killsSinceDrop: 0,
    killsSinceMedkit: 0,
    waveSpawnCount: 0,
    bossDialogue: "",
    bossDialogueTimer: 0,
  };
}

export function addEffect(state: GameState, effect: Omit<Effect, "maxLife">) {
  if (state.effects.length >= MAX_EFFECTS) state.effects.splice(0, state.effects.length - MAX_EFFECTS + 1);
  state.effects.push({ ...effect, maxLife: effect.life });
}

export function tickEffects(state: GameState, dt: number) {
  let writeIndex = 0;
  for (let index = 0; index < state.effects.length; index += 1) {
    const effect = state.effects[index];
    effect.life -= dt;
    if (effect.life > 0) state.effects[writeIndex++] = effect;
  }
  state.effects.length = writeIndex;
}

export function emitZombieSound(state: GameState, sound: ZombieSoundId, x: number, entityId?: number, volume?: number) {
  if (state.audioEvents.length >= 24) return;
  state.audioEvents.push({ sound, x, entityId, volume });
}

export function emitGameCue(state: GameState, cue: GameCueId, x: number, volume?: number, intensity?: number) {
  if (state.audioEvents.length >= 24) return;
  state.audioEvents.push({ cue, x, volume, intensity });
}

export function chooseEnemyKind(state: GameState, forcedElite: boolean) {
  const livingByKind: Record<EnemyKind, number> = { thug: 0, runner: 0, brute: 0, thrower: 0, walker: 0, kitty: 0, kittyBoss: 0 };
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
            : kind === "kitty" ? (livingByKind.kitty >= 1 ? 0 : 0.78 + Math.min(0.8, state.wave * .035))
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

export function spawnEnemy(state: GameState) {
  const isKittyBoss = state.wave === 5 && state.waveSpawnCount === 0;
  const forcedElite = !isKittyBoss && state.wave % 5 === 0 && state.waveSpawnCount === 0;
  const kind: EnemyKind = isKittyBoss ? "kittyBoss" : chooseEnemyKind(state, forcedElite);
  const def = ENEMIES[kind];
  const side = Math.random() > 0.5 ? 1 : -1;
  const elite = !isKittyBoss && (forcedElite || (state.wave >= 5 && Math.random() < Math.min(0.36, 0.035 * Math.floor(state.wave / 5))));
  const healthScale = 1 + 0.075 * (state.wave - 1) + 0.0015 * Math.pow(state.wave - 1, 1.55);
  const hp = isKittyBoss
    ? Math.round(def.hp * (state.mode === "coop" ? 1.55 : 1))
    : Math.round(def.hp * healthScale * (state.mode === "coop" ? 1.2 : 1) * (elite ? 1.8 : 1));
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
  if (isKittyBoss) {
    state.remainingBudget = 0;
    state.bossDialogue = "Come here... I only wanna play.";
    state.bossDialogueTimer = 4.4;
    state.screenFlash = Math.max(state.screenFlash, .9);
    state.cameraTrauma = Math.max(state.cameraTrauma, .42);
    emitGameCue(state, "bossCuteVoice", spawnX, .92, 1);
  } else {
    state.remainingBudget -= def.cost;
  }
}

export function damagePlayer(state: GameState, player: Player, amount: number, source?: Enemy) {
  if (state.gameOverTimer > 0) return;
  if (player.invuln > 0) {
    if (player.action === "dash" && player.dashRewardReady) {
      player.dashRewardReady = false;
      player.abilityCd = Math.max(0, player.abilityCd - .75);
      state.comboTimer = Math.max(state.comboTimer, 2.5);
      state.score += 25;
      state.hitStop = Math.max(state.hitStop, .035);
      state.cameraTrauma = Math.max(state.cameraTrauma, .2);
      state.cameraZoom = Math.max(state.cameraZoom, .012);
      state.cameraFocusX = player.x;
      state.cameraFocusY = player.y - 44;
      addEffect(state, { x: player.x, y: player.y - 86, life: .72, color: COLORS.score, text: "PERFECT DODGE +25", kind: "text" });
      addEffect(state, { x: player.x, y: player.y, life: .4, color: COLORS.score, radius: 52, strength: 1.1, kind: "ring" });
      addEffect(state, { x: player.x, y: player.y - 44, life: .2, color: COLORS.score, radius: 26, strength: 1, seed: state.kills + state.wave, kind: "burst" });
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
    player.attackBuffer = 0;
    player.attackHeld = false;
    player.reviveProgress = 0;
    player.reviveBy = null;
    if (state.players.filter((fighter) => fighter.connected).every((fighter) => fighter.hp <= 0)) {
      state.gameOverTimer = 0.78;
    } else {
      addEffect(state, { x: player.x, y: player.y - 94, life: .9, color: COLORS.danger, text: "DOWN — TEAMMATE CAN REVIVE", kind: "text" });
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
  addEffect(state, { x: player.x, y: player.y - 46, life: defeated ? .72 : .38, color: "#a91f3f", radius: defeated ? 54 : 30, angle: source ? Math.atan2(player.y - source.y, player.x - source.x) : player.facing > 0 ? 0 : Math.PI, strength: defeated ? 1.45 : .8, seed: state.wave * 97 + state.kills * 13 + (player.id === "host" ? 1 : 2), kind: "blood" });
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

export function dropWeaponAt(state: GameState, x: number, y: number, weapon: HeldWeapon, pickupLock = 0) {
  if (weapon.kind === "fists") return;
  state.pickups.push({ id: state.nextPickupId++, x, y, weapon: { ...weapon }, life: 20, bob: Math.random() * Math.PI * 2, pickupLock });
  if (state.pickups.length > 4) state.pickups.shift();
}

export function rollWeaponDrop(state: GameState, enemy: Enemy) {
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

export function dropMedkitAt(state: GameState, x: number, y: number, healAmount = MEDKIT_HEAL) {
  let activeDropCount = 0;
  let oldestIndex = -1;
  let oldestLife = Number.POSITIVE_INFINITY;
  for (let index = 0; index < state.medkits.length; index += 1) {
    const medkit = state.medkits[index];
    if (medkit.life >= 900) continue;
    activeDropCount += 1;
    if (medkit.life < oldestLife) {
      oldestLife = medkit.life;
      oldestIndex = index;
    }
  }
  if (activeDropCount >= 2 && oldestIndex >= 0) state.medkits.splice(oldestIndex, 1);
  state.medkits.push({
    id: state.nextPickupId++,
    x: clamp(x, ARENA.left + 28, ARENA.right - 28),
    y: clamp(y, ARENA.top + 30, ARENA.bottom - 18),
    life: 24,
    bob: Math.random() * Math.PI * 2,
    healAmount,
  });
}

export function rollMedkitDrop(state: GameState, enemy: Enemy) {
  state.killsSinceMedkit += 1;
  let livingCount = 0;
  let healthRatio = 0;
  for (const fighter of state.players) {
    if (!fighter.connected || fighter.hp <= 0) continue;
    livingCount += 1;
    healthRatio += fighter.hp / fighter.maxHp;
  }
  healthRatio = livingCount > 0 ? healthRatio / livingCount : 1;
  const chance = healthRatio < .45 ? .4 : healthRatio < .7 ? .2 : .07;
  if (state.killsSinceMedkit < 5 || (state.killsSinceMedkit < 10 && Math.random() >= chance)) return;
  dropMedkitAt(state, enemy.x, enemy.y);
  state.killsSinceMedkit = 0;
}

export function defeatEnemy(state: GameState, enemy: Enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  enemy.state = "dead";
  enemy.stateTimer = 0;
  enemy.stateDuration = enemy.kind === "kittyBoss" ? 1.45 : enemy.kind === "walker" ? 1.05 : 0.88;
  enemy.deathTimer = enemy.stateDuration;
  if (enemy.kind === "kittyBoss") {
    state.bossDialogue = "";
    state.bossDialogueTimer = 0;
    state.screenFlash = Math.max(state.screenFlash, 1.4);
    emitGameCue(state, "bossTransform", enemy.x, 1, 1.4);
  }
  if (enemy.kind === "walker") emitZombieSound(state, "death", enemy.x, enemy.id, enemy.elite ? 0.72 : 0.58);
  state.kills += 1;
  state.combo += 1;
  state.comboTimer = 2.5;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const base = ENEMIES[enemy.kind].score * (enemy.elite ? 1.6 : 1);
  const comboMult = Math.min(3, 1 + Math.floor(state.combo / 3) * 0.1);
  const points = Math.round(base * (1 + 0.03 * (state.wave - 1)) * comboMult);
  state.score += points;
  if (state.combo >= 5 && state.combo % 5 === 0) {
    const milestone = state.combo >= 20 ? "UNTOUCHABLE" : state.combo >= 10 ? "RAMPAGE" : "HEATING UP";
    addEffect(state, { x: enemy.x, y: enemy.y - 112, life: 1.05, color: COLORS.score, text: `${state.combo} KO // ${milestone}`, kind: "text" });
    addEffect(state, { x: enemy.x, y: enemy.y - 36, life: .54, color: COLORS.score, radius: Math.min(110, 52 + state.combo * 2), strength: 1.35, kind: "ring" });
    state.cameraTrauma = Math.max(state.cameraTrauma, Math.min(.72, .34 + state.combo * .012));
    state.screenFlash = Math.max(state.screenFlash, .22);
    emitGameCue(state, "pickup", enemy.x, .5, 1.2);
  }
  state.hitStop = Math.max(state.hitStop, 0.085);
  state.cameraTrauma = Math.max(state.cameraTrauma, enemy.elite ? 0.7 : 0.34);
  state.cameraZoom = Math.max(state.cameraZoom, enemy.elite ? 0.038 : 0.018);
  state.cameraFocusX = enemy.x;
  state.cameraFocusY = enemy.y - 42;
  rollWeaponDrop(state, enemy);
  rollMedkitDrop(state, enemy);
  addEffect(state, { x: enemy.x, y: enemy.y - 75, life: 0.8, color: COLORS.score, text: `+${points}`, kind: "text" });
  addEffect(state, { x: enemy.x, y: enemy.y - 44, life: 0.34, color: enemy.kind === "walker" ? COLORS.toxic : COLORS.impact, radius: enemy.radius * 1.45, strength: enemy.elite ? 1.6 : 1, seed: enemy.id, kind: "burst" });
  addEffect(state, { x: enemy.x, y: enemy.y - 38, life: enemy.elite ? 1.2 : .9, color: enemy.kind === "walker" ? "#6d8f3e" : "#861d36", radius: enemy.radius * 1.35, angle: enemy.facing > 0 ? 0 : Math.PI, strength: enemy.elite ? 1.7 : 1.15, seed: enemy.id * 31 + state.wave, kind: "blood" });
  addEffect(state, { x: enemy.x, y: enemy.y + 2, life: 0.42, color: enemy.kind === "walker" ? COLORS.toxic : "#7c8798", radius: enemy.radius * 1.3, strength: 1, seed: enemy.id * 7, kind: "dust" });
}

export function hitEnemy(
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
  const previousBossPhase = enemy.kind === "kittyBoss" ? kittyBossPhaseForHealth(enemy.hp, enemy.maxHp) : 0;
  let phaseTransitionStun = 0;
  enemy.hp -= amount;
  if (enemy.kind === "walker" && enemy.hp > 0) emitZombieSound(state, "hurt", enemy.x, enemy.id);
  if ((enemy.kind === "kitty" || enemy.kind === "kittyBoss") && enemy.hp > 0) {
    emitGameCue(state, "kittyHit", enemy.x, enemy.kind === "kittyBoss" ? .88 : enemy.elite ? .84 : .68, enemy.kind === "kittyBoss" ? .72 : enemy.elite ? 1.25 : 1);
  }
  if (enemy.kind === "kittyBoss" && enemy.hp > 0) {
    const nextBossPhase = kittyBossPhaseForHealth(enemy.hp, enemy.maxHp);
    if (nextBossPhase > previousBossPhase) {
      phaseTransitionStun = nextBossPhase === 3 ? .52 : .42;
      state.screenFlash = Math.max(state.screenFlash, nextBossPhase === 3 ? 1.25 : .72);
      state.cameraTrauma = Math.max(state.cameraTrauma, .48 + nextBossPhase * .08);
      emitGameCue(state, "bossTransform", enemy.x, .82, .9 + nextBossPhase * .14);
      addEffect(state, { x: enemy.x, y: enemy.y - 190, life: .95, color: nextBossPhase === 3 ? COLORS.toxic : "#ff6faf", text: nextBossPhase === 3 ? "FINAL FORM" : "SHELL BREAKING", kind: "text" });
      if (previousBossPhase < 2 && nextBossPhase >= 2) {
        state.bossDialogue = "I SAID I WANNA PLAY!";
        state.bossDialogueTimer = 4.2;
        emitGameCue(state, "bossZombieVoice", enemy.x, 1, 1.25);
      }
    }
  }
  enemy.stun = Math.max(enemy.stun, stun, phaseTransitionStun);
  enemy.hitFlash = 0.14;
  enemy.state = "hurt";
  enemy.stateTimer = 0;
  enemy.stateDuration = Math.max(0.1, stun, phaseTransitionStun);
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
  const impactY = enemy.y - (enemy.kind === "kittyBoss" ? 145 : 45);
  state.cameraFocusY = impactY;
  addEffect(state, { x: enemy.x, y: impactY, life: 0.2, color: enemy.kind === "walker" || enemy.kind === "kittyBoss" ? COLORS.toxic : COLORS.impact, radius: enemy.kind === "kittyBoss" ? 36 : 20, angle: Math.atan2(enemy.y - sourceY, enemy.x - sourceX), strength: enemy.kind === "kittyBoss" ? 1.45 : 1, seed: enemy.id + state.kills, kind: "burst" });
  addEffect(state, { x: enemy.x, y: impactY + 1, life: .36, color: enemy.kind === "walker" || enemy.kind === "kittyBoss" ? "#789b48" : "#b32649", radius: Math.max(22, enemy.radius), angle: Math.atan2(enemy.y - sourceY, enemy.x - sourceX), strength: enemy.kind === "kittyBoss" ? 1.35 : enemy.elite ? 1.2 : .8, seed: enemy.id * 17 + state.kills * 7, kind: "blood" });
  emitGameCue(state, "impact", enemy.x, enemy.elite ? .72 : .5, enemy.elite ? 1.3 : Math.min(1.15, .72 + knockback / 900));
  if (enemy.hp <= 0) defeatEnemy(state, enemy);
  return true;
}

export function triggerAbility(state: GameState, player: Player) {
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

export function beginReload(state: GameState, player: Player) {
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

export function beginAttack(state: GameState, player: Player) {
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
    const targetY = definition.firearm ? enemyCombatY(target) : target.y - Math.min(46, target.radius * .7);
    player.aimAngle = Math.atan2((targetY - (player.y - 46)) * 1.06, target.x - player.x);
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

export function resolvePlayerAttack(state: GameState, player: Player) {
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
          const dy = (enemyCombatY(enemy) - (player.y - 46)) * 1.06;
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

export function beginDash(state: GameState, player: Player, mx: number, my: number) {
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

export function swapWeapon(state: GameState, player: Player) {
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

export const EMPTY_KEYS = new Set<string>();

export function findEnemyTarget(state: GameState, enemy: Enemy, livingPlayers?: Player[]) {
  const living = livingPlayers ?? state.players.filter((fighter) => fighter.connected && fighter.hp > 0);
  const assigned = living.find((fighter) => fighter.id === enemy.targetPlayerId);
  if (assigned) return assigned;
  const next = living[enemy.id % Math.max(1, living.length)] ?? state.player;
  enemy.targetPlayerId = next.id;
  return next;
}

export function updatePlayer(
  state: GameState,
  player: Player,
  dt: number,
  keys: Set<string>,
  actions: PlayerInputState,
) {
  if (!player.connected || player.hp <= 0) {
    player.attackHeld = false;
    if (player.connected && player.hp <= 0) {
      player.actionTime = Math.min(player.actionDuration, player.actionTime + dt);
      player.animTime += dt * 1.5;
      player.moveAmount = Math.max(0, player.moveAmount - dt * 6);
    }
    actions.attackQueued = false;
    actions.dash = false;
    actions.ability = false;
    actions.swap = false;
    actions.reload = false;
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

  if (player.hp < player.maxHp) {
    for (let index = 0; index < state.medkits.length; index += 1) {
      const medkit = state.medkits[index];
      if (distanceSquared(player.x, player.y, medkit.x, medkit.y) > 38 * 38) continue;
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + medkit.healAmount);
      const healed = Math.ceil(player.hp - before);
      state.medkits.splice(index, 1);
      addEffect(state, { x: medkit.x, y: medkit.y - 72, life: .78, color: "#62d6a2", text: `MEDKIT +${healed}`, kind: "text" });
      addEffect(state, { x: medkit.x, y: medkit.y, life: .48, color: "#62d6a2", radius: 54, strength: 1.15, kind: "ring" });
      emitGameCue(state, "heal", medkit.x, .72, 1.1);
      break;
    }
  }

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

export function updateRevives(
  state: GameState,
  dt: number,
  hostActions: PlayerInputState,
  guestActions?: PlayerInputState,
) {
  if (state.mode !== "coop") return;
  for (const target of state.players) {
    if (!target.connected || target.hp > 0) {
      target.reviveProgress = 0;
      target.reviveBy = null;
      continue;
    }
    const reviver = state.players.find((fighter) => fighter.id !== target.id && fighter.connected && fighter.hp > 0);
    const reviverActions = reviver?.id === "host" ? hostActions : guestActions;
    const inRange = Boolean(reviver && distanceSquared(reviver.x, reviver.y, target.x, target.y) <= REVIVE_RANGE * REVIVE_RANGE);
    const canRevive = Boolean(
      reviver
      && reviverActions?.revive
      && inRange
      && reviver.action === "idle"
      && reviver.moveAmount < .5,
    );
    if (!canRevive || !reviver) {
      target.reviveProgress = Math.max(0, target.reviveProgress - dt / 1.4);
      if (target.reviveProgress === 0) target.reviveBy = null;
      continue;
    }
    target.reviveBy = reviver.id;
    target.reviveProgress = Math.min(1, target.reviveProgress + dt / REVIVE_DURATION);
    if (target.reviveProgress < 1) continue;
    target.hp = Math.ceil(target.maxHp * .4);
    target.action = "idle";
    target.actionTime = 0;
    target.actionDuration = 0;
    target.attackSpec = null;
    target.attackResolved = false;
    target.attackBuffer = 0;
    target.attackHeld = false;
    target.invuln = 1.8;
    target.slowTimer = 0;
    target.vx = 0;
    target.vy = 0;
    target.reviveProgress = 0;
    target.reviveBy = null;
    addEffect(state, { x: target.x, y: target.y - 96, life: .95, color: "#62d6a2", text: "BACK IN THE FIGHT", kind: "text" });
    addEffect(state, { x: target.x, y: target.y, life: .58, color: "#62d6a2", radius: 68, strength: 1.35, kind: "ring" });
    emitGameCue(state, "revive", target.x, .84, 1.25);
  }
}

export function updateGame(
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
  state.bossDialogueTimer = Math.max(0, (state.bossDialogueTimer ?? 0) - dt);
  if (state.bossDialogueTimer === 0) state.bossDialogue = "";
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
  updateRevives(state, dt, actions, remoteActions);

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
  livingPlayersScratch.length = 0;
  for (const fighter of state.players) if (fighter.connected && fighter.hp > 0) livingPlayersScratch.push(fighter);
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
    const player = findEnemyTarget(state, enemy, livingPlayersScratch);
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
        if (enemy.kind === "thrower" || enemy.kind === "kitty" || enemy.kind === "kittyBoss") {
          const shotX = enemy.x;
          const bossPhase = enemy.kind === "kittyBoss" ? kittyBossPhaseForHealth(enemy.hp, enemy.maxHp) : 0;
          const shotY = enemy.y - (enemy.kind === "kittyBoss" ? 150 : enemy.kind === "kitty" ? 64 : 46);
          const projectileSpeed = enemy.kind === "kittyBoss" ? 470 + bossPhase * 45 : enemy.kind === "kitty" ? 520 : 390;
          const shotCount = enemy.kind === "kittyBoss" ? (bossPhase >= 3 ? 5 : bossPhase >= 2 ? 3 : 1) : 1;
          const baseAngle = Math.atan2(enemy.attackY, enemy.attackX);
          for (let shot = 0; shot < shotCount; shot += 1) {
            const spread = shotCount === 1 ? 0 : (shot - (shotCount - 1) / 2) * .115;
            const angle = baseAngle + spread;
            state.projectiles.push({
              id: state.nextProjectileId++, owner: "enemy", kind: enemy.kind === "thrower" ? "thrown" : "labubu",
              x: shotX, y: shotY, prevX: shotX, prevY: shotY,
              vx: Math.cos(angle) * projectileSpeed, vy: Math.sin(angle) * projectileSpeed,
              damage: enemy.damage * (shotCount > 1 ? .68 : 1), knockback: enemy.kind === "kittyBoss" ? 210 : enemy.kind === "kitty" ? 160 : 110,
              life: enemy.kind === "kittyBoss" ? 2.1 : enemy.kind === "kitty" ? 1.8 : 2.2,
              radius: enemy.kind === "kittyBoss" ? 19 : enemy.kind === "kitty" ? 14 : 9, penetration: 0,
            });
          }
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
      if (enemy.kind === "thrower" || enemy.kind === "kitty" || enemy.kind === "kittyBoss") {
        const bossPhase = enemy.kind === "kittyBoss" ? kittyBossPhaseForHealth(enemy.hp, enemy.maxHp) : 0;
        const preferredFar = enemy.kind === "kittyBoss" ? 390 : enemy.kind === "kitty" ? 430 : 360;
        const preferredNear = enemy.kind === "kittyBoss" ? 185 : enemy.kind === "kitty" ? 265 : 210;
        const moveSpeed = enemy.speed * (enemy.kind === "kittyBoss" ? 1 + bossPhase * .18 : 1);
        if (length > preferredFar) { enemy.x += (dx / length) * moveSpeed * dt; enemy.y += (dy / length) * moveSpeed * 0.72 * dt; }
        if (length < preferredNear) { enemy.x -= (dx / length) * moveSpeed * dt; enemy.y -= (dy / length) * moveSpeed * 0.72 * dt; }
        if (length < definition.attackRange && enemy.attackCd <= 0 && attackingEnemies < attackLimit) {
          enemy.state = "windup";
          enemy.stateTimer = 0;
          enemy.stateDuration = Math.max(MIN_WINDUPS[enemy.kind], definition.windup * Math.max(0.78, 1 - state.wave * 0.006));
          enemy.windup = enemy.stateDuration;
          const throwX = player.x - enemy.x;
          const throwY = (player.y - 44) - (enemy.y - (enemy.kind === "kittyBoss" ? 150 : enemy.kind === "kitty" ? 64 : 46));
          const throwLength = Math.hypot(throwX, throwY) || 1;
          enemy.attackX = throwX / throwLength;
          enemy.attackY = throwY / throwLength;
          enemy.attackFacing = dx >= 0 ? 1 : -1;
          enemy.facing = enemy.attackFacing;
          enemy.attackCd = (enemy.kind === "kittyBoss" ? Math.max(.7, 1.42 - bossPhase * .18) : enemy.kind === "kitty" ? 1.18 : 1.75) * aggression;
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
      const minX = Math.min(projectile.prevX, projectile.x) - hitRadius;
      const maxX = Math.max(projectile.prevX, projectile.x) + hitRadius;
      const minY = Math.min(projectile.prevY, projectile.y) - hitRadius;
      const maxY = Math.max(projectile.prevY, projectile.y) + hitRadius;
      for (const fighter of state.players) {
        if (!fighter.connected || fighter.hp <= 0) continue;
        const targetY = fighter.y - 44;
        if (fighter.x < minX || fighter.x > maxX || targetY < minY || targetY > maxY) continue;
        if (segmentPointDistanceSquared(projectile.prevX, projectile.prevY, projectile.x, projectile.y, fighter.x, targetY) < hitRadius * hitRadius) {
          damagePlayer(state, fighter, projectile.damage);
          projectile.life = 0;
          break;
        }
      }
    } else {
      for (const enemy of solidEnemies) {
        if (enemy.dead) continue;
        const bossTarget = enemy.kind === "kittyBoss";
        const hitRadius = enemy.radius * (bossTarget ? .95 : .72) + projectile.radius;
        const targetY = enemyCombatY(enemy);
        const lowerTargetY = bossTarget ? targetY + 104 : targetY;
        const minX = Math.min(projectile.prevX, projectile.x) - hitRadius;
        const maxX = Math.max(projectile.prevX, projectile.x) + hitRadius;
        const minY = Math.min(projectile.prevY, projectile.y) - hitRadius;
        const maxY = Math.max(projectile.prevY, projectile.y) + hitRadius;
        if (enemy.x < minX || enemy.x > maxX || (targetY < minY && lowerTargetY < minY) || (targetY > maxY && lowerTargetY > maxY)) continue;
        const upperDistance = segmentPointDistanceSquared(projectile.prevX, projectile.prevY, projectile.x, projectile.y, enemy.x, targetY);
        const lowerDistance = bossTarget
          ? segmentPointDistanceSquared(projectile.prevX, projectile.prevY, projectile.x, projectile.y, enemy.x, lowerTargetY)
          : upperDistance;
        if (Math.min(upperDistance, lowerDistance) < hitRadius * hitRadius) {
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
  for (const medkit of state.medkits) {
    medkit.life -= dt;
    medkit.bob += dt * 3.2;
  }
  let medkitWrite = 0;
  for (let index = 0; index < state.medkits.length; index += 1) {
    const medkit = state.medkits[index];
    if (medkit.life > 0) state.medkits[medkitWrite++] = medkit;
  }
  state.medkits.length = medkitWrite;
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
        fighter.reviveProgress = 0;
        fighter.reviveBy = null;
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

export function createInputState(): PlayerInputState {
  return { dx: 0, dy: 0, attack: false, attackQueued: false, dash: false, ability: false, swap: false, reload: false, revive: false };
}
