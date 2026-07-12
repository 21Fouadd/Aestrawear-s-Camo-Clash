"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPant, PANTS, type PantId } from "../lib/game-config";

const WORLD_W = 1280;
const WORLD_H = 720;
const ARENA = { left: 72, right: 1208, top: 250, bottom: 630 };

type Screen = "menu" | "playing" | "paused" | "upgrade" | "gameover" | "leaderboard";
type EnemyKind = "thug" | "runner" | "brute" | "thrower" | "walker";

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
};

type Projectile = { x: number; y: number; vx: number; vy: number; damage: number; life: number };
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
};

type GameState = {
  runId: string;
  pantId: PantId;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
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
  color: string;
}> = {
  thug: { hp: 55, speed: 92, damage: 10, radius: 24, cost: 1, score: 100, unlock: 1, windup: 0.42, color: "#f0ede4" },
  runner: { hp: 36, speed: 150, damage: 8, radius: 20, cost: 1.4, score: 135, unlock: 2, windup: 0.3, color: "#ff723d" },
  brute: { hp: 160, speed: 62, damage: 22, radius: 34, cost: 3.5, score: 340, unlock: 4, windup: 0.9, color: "#f3bd62" },
  thrower: { hp: 65, speed: 78, damage: 9, radius: 23, cost: 2.4, score: 235, unlock: 6, windup: 0.7, color: "#b28cff" },
  walker: { hp: 110, speed: 72, damage: 15, radius: 27, cost: 2.2, score: 260, unlock: 8, windup: 0.6, color: "#9ecf72" },
};

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
    },
    enemies: [],
    projectiles: [],
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
  const healthScale = 1 + 0.1 * (state.wave - 1) + 0.003 * Math.pow(state.wave - 1, 1.6);
  const hp = Math.round(def.hp * healthScale * (elite ? 1.8 : 1));
  state.enemies.push({
    id: state.nextEnemyId++,
    kind,
    x: side < 0 ? ARENA.left - 30 : ARENA.right + 30,
    y: ARENA.top + 70 + Math.random() * (ARENA.bottom - ARENA.top - 70),
    hp,
    maxHp: hp,
    speed: def.speed * Math.min(1.3, 1 + 0.008 * (state.wave - 1)),
    damage: def.damage * (1 + 0.055 * (state.wave - 1)) * (elite ? 1.25 : 1),
    radius: def.radius * (elite ? 1.12 : 1),
    attackCd: 0.4 + Math.random() * 0.5,
    windup: 0,
    stun: 0,
    vx: 0,
    vy: 0,
    elite,
    dead: false,
    facing: side < 0 ? 1 : -1,
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
  addEffect(state, { x: player.x, y: player.y - 50, life: 0.55, color: "#ef4141", text: `-${Math.ceil(dealt)}`, kind: "text" });
  if (guarded && source) {
    const dx = source.x - player.x;
    const dy = source.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    source.vx += (dx / length) * 420;
    source.vy += (dy / length) * 420;
    source.stun = 0.45;
  }
}

function defeatEnemy(state: GameState, enemy: Enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  state.kills += 1;
  state.combo += 1;
  state.comboTimer = 2.5;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const base = ENEMIES[enemy.kind].score * (enemy.elite ? 1.6 : 1);
  const comboMult = Math.min(3, 1 + Math.floor(state.combo / 3) * 0.1);
  const surgeMult = state.pantId === "surge" && state.player.abilityTimer > 0 ? 1.5 : 1;
  const points = Math.round(base * (1 + 0.03 * (state.wave - 1)) * comboMult * surgeMult);
  state.score += points;
  addEffect(state, { x: enemy.x, y: enemy.y - 75, life: 0.8, color: getPant(state.pantId).color, text: `+${points}`, kind: "text" });
}

function hitEnemy(state: GameState, enemy: Enemy, amount: number, stun = 0, knockback = 0) {
  if (enemy.dead) return;
  enemy.hp -= amount;
  enemy.stun = Math.max(enemy.stun, stun);
  if (knockback) {
    const dx = enemy.x - state.player.x;
    const dy = enemy.y - state.player.y;
    const length = Math.hypot(dx, dy) || 1;
    enemy.vx += (dx / length) * knockback;
    enemy.vy += (dy / length) * knockback;
  }
  addEffect(state, { x: enemy.x, y: enemy.y - 45, life: 0.24, color: "#ffffff", radius: 18, kind: "hit" });
  if (enemy.hp <= 0) defeatEnemy(state, enemy);
}

function useAbility(state: GameState) {
  const player = state.player;
  if (player.abilityCd > 0) return;
  const pant = getPant(state.pantId);
  player.abilityCd = pant.cooldown * player.cooldownMult;
  if (state.pantId === "ghost") {
    player.abilityTimer = 2.25;
    player.invuln = Math.max(player.invuln, 2.25);
    player.ghostPrimed = true;
    addEffect(state, { x: player.x, y: player.y, life: 0.8, color: pant.color, radius: 90, kind: "ring" });
  } else if (state.pantId === "chain") {
    const targets = state.enemies
      .filter((enemy) => !enemy.dead && distance(player.x, player.y, enemy.x, enemy.y) < 360)
      .sort((a, b) => distance(player.x, player.y, a.x, a.y) - distance(player.x, player.y, b.x, b.y))
      .slice(0, 5);
    targets.forEach((enemy, index) => {
      hitEnemy(state, enemy, 48 * player.damageMult, 0.9, 80);
      addEffect(state, { x: enemy.x, y: enemy.y - 35, life: 0.35 + index * 0.05, color: pant.color, radius: 34, kind: "bolt" });
    });
    addEffect(state, { x: player.x, y: player.y - 40, life: 0.5, color: pant.color, radius: 260, kind: "ring" });
  } else if (state.pantId === "guard") {
    player.abilityTimer = 4;
    state.enemies.forEach((enemy) => {
      if (!enemy.dead && distance(player.x, player.y, enemy.x, enemy.y) < 190) {
        hitEnemy(state, enemy, 28 * player.damageMult, 0.55, 520);
      }
    });
    addEffect(state, { x: player.x, y: player.y, life: 0.7, color: pant.color, radius: 190, kind: "ring" });
  } else {
    player.abilityTimer = 5;
    addEffect(state, { x: player.x, y: player.y, life: 0.8, color: pant.color, radius: 120, kind: "ring" });
  }
}

function attack(state: GameState) {
  const player = state.player;
  if (player.attackCd > 0) return;
  player.comboStep = player.comboWindow > 0 ? (player.comboStep + 1) % 3 : 0;
  player.comboWindow = 0.9;
  const surge = state.pantId === "surge" && player.abilityTimer > 0;
  player.attackCd = (player.comboStep === 2 ? 0.42 : 0.31) / (surge ? 1.45 : 1);
  const range = 118 * player.rangeMult;
  const candidates = state.enemies
    .filter((enemy) => !enemy.dead && distance(player.x, player.y, enemy.x, enemy.y) <= range && Math.abs(enemy.y - player.y) < 90)
    .sort((a, b) => distance(player.x, player.y, a.x, a.y) - distance(player.x, player.y, b.x, b.y));
  if (candidates[0]) player.facing = candidates[0].x >= player.x ? 1 : -1;
  const maxTargets = surge ? 4 : 2;
  const baseDamage = [18, 21, 31][player.comboStep];
  const ghostHit = state.pantId === "ghost" && player.ghostPrimed;
  candidates.slice(0, maxTargets).forEach((enemy) => {
    hitEnemy(
      state,
      enemy,
      baseDamage * player.damageMult * (ghostHit ? 2.25 : 1),
      ghostHit ? 0.75 : 0.08,
      player.comboStep === 2 ? 340 : 100,
    );
  });
  if (ghostHit && candidates.length) {
    player.ghostPrimed = false;
    player.abilityTimer = 0;
  }
  addEffect(state, {
    x: player.x + player.facing * 64,
    y: player.y - 52,
    life: 0.22,
    color: getPant(state.pantId).color,
    radius: range * 0.72,
    kind: "hit",
  });
}

function updateGame(
  state: GameState,
  dt: number,
  keys: Set<string>,
  actions: { dx: number; dy: number; attack: boolean; dash: boolean; ability: boolean },
) {
  const player = state.player;
  state.elapsed += dt;
  state.shake = Math.max(0, state.shake - dt);
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.abilityCd = Math.max(0, player.abilityCd - dt);
  player.abilityTimer = Math.max(0, player.abilityTimer - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.comboWindow = Math.max(0, player.comboWindow - dt);
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer === 0) state.combo = 0;

  let mx = actions.dx + (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  let my = actions.dy + (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  const moveLength = Math.hypot(mx, my);
  if (moveLength > 1) { mx /= moveLength; my /= moveLength; }
  if (Math.abs(mx) > 0.05) player.facing = mx > 0 ? 1 : -1;
  const ghostSpeed = state.pantId === "ghost" && player.abilityTimer > 0 ? 1.35 : 1;
  player.x = clamp(player.x + mx * player.speed * player.speedMult * ghostSpeed * dt, ARENA.left, ARENA.right);
  player.y = clamp(player.y + my * player.speed * player.speedMult * ghostSpeed * 0.72 * dt, ARENA.top, ARENA.bottom);

  if (actions.dash && player.dashCd <= 0) {
    const dx = moveLength > 0.1 ? mx : player.facing;
    const dy = moveLength > 0.1 ? my : 0;
    player.x = clamp(player.x + dx * 150, ARENA.left, ARENA.right);
    player.y = clamp(player.y + dy * 110, ARENA.top, ARENA.bottom);
    player.dashCd = 1.25;
    player.invuln = Math.max(player.invuln, 0.22);
    addEffect(state, { x: player.x - dx * 70, y: player.y, life: 0.35, color: getPant(state.pantId).color, radius: 48, kind: "trail" });
  }
  actions.dash = false;
  if (actions.ability) useAbility(state);
  actions.ability = false;
  if (actions.attack || keys.has(" ") || keys.has("j")) attack(state);

  if (state.introTimer > 0) state.introTimer = Math.max(0, state.introTimer - dt);
  const maxAlive = Math.min(18, 5 + Math.floor(state.wave / 2));
  state.spawnTimer -= dt;
  if (state.introTimer <= 0 && state.remainingBudget > 0.15 && state.spawnTimer <= 0 && state.enemies.length < maxAlive) {
    spawnEnemy(state);
    state.spawnTimer = Math.max(0.42, 1.2 - 0.035 * (state.wave - 1));
  }

  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    enemy.stun = Math.max(0, enemy.stun - dt);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.vx *= Math.pow(0.025, dt);
    enemy.vy *= Math.pow(0.025, dt);
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    enemy.facing = dx >= 0 ? 1 : -1;

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      if (enemy.windup <= 0) {
        if (enemy.kind === "thrower") {
          state.projectiles.push({ x: enemy.x, y: enemy.y - 46, vx: (dx / length) * 340, vy: (dy / length) * 340, damage: enemy.damage, life: 2.2 });
        } else if (length < enemy.radius + 78) {
          damagePlayer(state, enemy.damage, enemy);
        }
      }
    } else if (enemy.stun <= 0) {
      if (enemy.kind === "thrower") {
        if (length > 300) { enemy.x += (dx / length) * enemy.speed * dt; enemy.y += (dy / length) * enemy.speed * dt; }
        if (length < 175) { enemy.x -= (dx / length) * enemy.speed * dt; enemy.y -= (dy / length) * enemy.speed * dt; }
        if (length < 420 && enemy.attackCd <= 0) { enemy.windup = ENEMIES.thrower.windup; enemy.attackCd = 1.8; }
      } else {
        const attackRange = enemy.radius + (enemy.kind === "brute" ? 62 : 45);
        if (length > attackRange) {
          enemy.x += (dx / length) * enemy.speed * dt;
          enemy.y += (dy / length) * enemy.speed * dt;
        } else if (enemy.attackCd <= 0) {
          enemy.windup = ENEMIES[enemy.kind].windup;
          enemy.attackCd = enemy.kind === "brute" ? 1.7 : 1.1;
        }
      }
    }
    enemy.x = clamp(enemy.x, ARENA.left - 45, ARENA.right + 45);
    enemy.y = clamp(enemy.y, ARENA.top, ARENA.bottom);
  }

  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    if (distance(projectile.x, projectile.y, player.x, player.y - 35) < 34) {
      damagePlayer(state, projectile.damage);
      projectile.life = 0;
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.life > 0);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter((effect) => effect.life > 0);

  if (state.remainingBudget <= 0.15 && state.enemies.length === 0 && state.introTimer <= 0) {
    const clearedWave = state.wave;
    state.score += 200 + 50 * clearedWave;
    player.hp = Math.min(player.maxHp, player.hp + player.waveHeal);
    state.wave += 1;
    state.remainingBudget = budgetForWave(state.wave);
    state.spawnTimer = 0.8;
    state.introTimer = 1.8;
    addEffect(state, { x: WORLD_W / 2, y: 360, life: 1.4, color: "#d7ff35", text: `WAVE ${clearedWave} CLEARED`, kind: "text" });
    if (clearedWave % 3 === 0) state.pendingUpgrade = true;
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, state: GameState, images: Record<string, HTMLImageElement>) {
  const player = state.player;
  const pant = getPant(state.pantId);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(player.facing, 1);
  if (state.pantId === "ghost" && player.abilityTimer > 0) ctx.globalAlpha = 0.42;
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.beginPath(); ctx.ellipse(0, 6, 43, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f0ede4";
  ctx.beginPath(); ctx.arc(0, -102, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111512";
  ctx.beginPath(); ctx.moveTo(-18, -88); ctx.lineTo(19, -88); ctx.lineTo(25, -47); ctx.lineTo(-24, -47); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = pant.color; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-15, -78); ctx.lineTo(-39, -48); ctx.moveTo(15, -78); ctx.lineTo(42, -54); ctx.stroke();
  const image = images[state.pantId];
  if (image) ctx.drawImage(image, -33, -51, 66, 78);
  else { ctx.fillStyle = pant.color; ctx.fillRect(-27, -50, 54, 70); }
  ctx.fillStyle = "#070908"; ctx.fillRect(-32, 18, 27, 9); ctx.fillRect(7, 18, 28, 9);
  if (state.pantId === "guard" && player.abilityTimer > 0) {
    ctx.strokeStyle = pant.color; ctx.lineWidth = 4; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(0, -43, 64, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const def = ENEMIES[enemy.kind];
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.scale(enemy.facing, 1);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath(); ctx.ellipse(0, 7, enemy.radius * 1.25, 10, 0, 0, Math.PI * 2); ctx.fill();
  if (enemy.windup > 0) {
    ctx.strokeStyle = "#ef4141"; ctx.lineWidth = 4; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(0, -35, enemy.radius + 18 + enemy.windup * 14, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = def.color;
  ctx.beginPath(); ctx.arc(0, -82, enemy.kind === "brute" ? 17 : 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = enemy.kind === "walker" ? "#25351f" : "#171a18";
  const bodyW = enemy.kind === "brute" ? 55 : 39;
  ctx.fillRect(-bodyW / 2, -68, bodyW, enemy.kind === "brute" ? 58 : 48);
  ctx.strokeStyle = def.color; ctx.lineWidth = enemy.kind === "brute" ? 10 : 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-bodyW / 3, -52); ctx.lineTo(-bodyW / 2 - 12, -20); ctx.moveTo(bodyW / 3, -52); ctx.lineTo(bodyW / 2 + 17, -27); ctx.stroke();
  ctx.strokeStyle = "#0b0d0b"; ctx.lineWidth = enemy.kind === "brute" ? 12 : 9;
  ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(-16, 12); ctx.moveTo(12, -12); ctx.lineTo(17, 12); ctx.stroke();
  if (enemy.elite) { ctx.strokeStyle = "#d7ff35"; ctx.lineWidth = 3; ctx.strokeRect(-bodyW / 2 - 6, -106, bodyW + 12, 124); }
  ctx.restore();
  const barW = enemy.radius * 2.4;
  ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(enemy.x - barW / 2, enemy.y - 124, barW, 5);
  ctx.fillStyle = enemy.elite ? "#d7ff35" : def.color; ctx.fillRect(enemy.x - barW / 2, enemy.y - 124, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 5);
}

function drawGame(ctx: CanvasRenderingContext2D, state: GameState, images: Record<string, HTMLImageElement>, reducedMotion: boolean) {
  const tier = Math.floor((state.wave - 1) / 3);
  const sky = ["#242925", "#34261f", "#28301c", "#190f14"][Math.min(3, tier)];
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  ctx.save();
  if (state.shake > 0 && !reducedMotion) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8);
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  gradient.addColorStop(0, sky); gradient.addColorStop(0.68, "#0d100e"); gradient.addColorStop(1, "#060706");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = "rgba(5,7,6,.82)";
  [0, 150, 330, 570, 820, 1040].forEach((x, i) => ctx.fillRect(x, 80 + (i % 3) * 34, 210, 255));
  ctx.strokeStyle = "rgba(215,255,53,.08)"; ctx.lineWidth = 2;
  for (let x = -200; x < WORLD_W + 200; x += 48) { ctx.beginPath(); ctx.moveTo(x, 160); ctx.lineTo(x + 320, 480); ctx.stroke(); }
  ctx.fillStyle = "#141815"; ctx.fillRect(0, 355, WORLD_W, 365);
  ctx.fillStyle = "rgba(255,255,255,.04)";
  for (let y = 410; y < 700; y += 68) ctx.fillRect(0, y, WORLD_W, 2);
  ctx.fillStyle = tier >= 2 ? "rgba(215,255,53,.16)" : "rgba(255,101,47,.11)";
  ctx.fillRect(0, 348, WORLD_W, 16);
  ctx.font = "900 76px Impact, sans-serif"; ctx.fillStyle = "rgba(242,239,231,.06)"; ctx.save(); ctx.rotate(-0.05); ctx.fillText("AESTRA // HOLD THE BLOCK", 76, 325); ctx.restore();

  const sortedEnemies = [...state.enemies].sort((a, b) => a.y - b.y);
  for (const enemy of sortedEnemies) drawEnemy(ctx, enemy);
  for (const projectile of state.projectiles) {
    ctx.fillStyle = "#b28cff"; ctx.beginPath(); ctx.arc(projectile.x, projectile.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(178,140,255,.45)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(projectile.x, projectile.y); ctx.lineTo(projectile.x - projectile.vx * 0.08, projectile.y - projectile.vy * 0.08); ctx.stroke();
  }
  drawFighter(ctx, state, images);
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
    } else {
      ctx.lineWidth = effect.kind === "trail" ? 12 : 7; ctx.beginPath();
      ctx.arc(effect.x, effect.y - 42, effect.radius ?? 24, -1.1, 1.1); ctx.stroke();
    }
    ctx.restore();
  }
  if (state.introTimer > 0) {
    ctx.textAlign = "center"; ctx.fillStyle = "#f2efe7"; ctx.font = "900 72px Impact, sans-serif";
    ctx.fillText(`WAVE ${String(state.wave).padStart(2, "0")}`, WORLD_W / 2, 330);
    ctx.font = "700 18px Arial, sans-serif"; ctx.fillStyle = "#d7ff35"; ctx.fillText(state.wave >= 8 ? "THE HORDE IS HERE" : "HOLD THE BLOCK", WORLD_W / 2, 366);
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
  const [hud, setHud] = useState<Hud>({ health: 100, maxHealth: 100, score: 0, wave: 1, combo: 0, kills: 0, abilityCd: 0, dashCd: 0, enemies: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [boardStatus, setBoardStatus] = useState("Loading the street records…");
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const actionsRef = useRef({ dx: 0, dy: 0, attack: false, dash: false, ability: false });
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
    if (savedName) setPlayerName(savedName);
    for (const item of PANTS) {
      const image = new Image();
      image.src = item.asset;
      image.onload = () => { imagesRef.current[item.id] = image; };
    }
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
      keysRef.current.add(key);
      if (!event.repeat && (key === "shift" || key === "k")) actionsRef.current.dash = true;
      if (!event.repeat && (key === "e" || key === "l")) actionsRef.current.ability = true;
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
        setHud({
          health: state.player.hp,
          maxHealth: state.player.maxHp,
          score: state.score,
          wave: state.wave,
          combo: state.combo,
          kills: state.kills,
          abilityCd: state.player.abilityCd,
          dashCd: state.player.dashCd,
          enemies: state.enemies.length,
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
    setHud({ health: 100, maxHealth: 100, score: 0, wave: 1, combo: 0, kills: 0, abilityCd: 0, dashCd: 0, enemies: 0 });
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
    const x = clamp(event.clientX - (rect.left + rect.width / 2), -48, 48);
    const y = clamp(event.clientY - (rect.top + rect.height / 2), -48, 48);
    actionsRef.current.dx = x / 48;
    actionsRef.current.dy = y / 48;
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
    <main className="game-shell" style={{ "--pant-accent": pant.color } as React.CSSProperties}>
      {screen === "menu" && (
        <section className="menu-screen">
          <div className="brand-line"><span>AESTRAWEAR</span><span>GAME DIVISION // 002</span></div>
          <div className="menu-grid">
            <header className="hero-copy">
              <p className="eyebrow">ENDLESS STREET SURVIVAL</p>
              <h1>CAMO<br /><span>CLASH</span></h1>
              <p className="hero-lede">Own the block. Break every wave. Wear the power.</p>
              <div className="name-field">
                <label htmlFor="fighter-name">Fighter name</label>
                <input id="fighter-name" maxLength={18} value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
              </div>
              <div className="hero-actions">
                <button className="primary-button" onClick={startRun}>ENTER THE STREET <span>→</span></button>
                <button className="text-button" onClick={openLeaderboard}>TOP SCORES</button>
              </div>
              <p className="control-copy">Move WASD / arrows · Attack Space / J · Dash Shift / K · Ability E / L</p>
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
              <div className="future-note"><strong>WAVE 08+</strong><span>Zombie-class enemies enter the roster.</span></div>
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
          <div className="hud" aria-live="polite">
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
          <div className="desktop-controls"><span>WASD MOVE</span><span>SPACE ATTACK</span><span>SHIFT DASH</span><span>E ABILITY</span></div>
          <button className="pause-button" onClick={() => changeScreen("paused")} aria-label="Pause game">Ⅱ</button>
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
              <button className="touch-dash" onPointerDown={() => { actionsRef.current.dash = true; }}>DASH</button>
              <button className="touch-attack" onPointerDown={() => { actionsRef.current.attack = true; }} onPointerUp={() => { actionsRef.current.attack = false; }} onPointerCancel={() => { actionsRef.current.attack = false; }}>HIT</button>
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
          <div className="board-header"><div><p className="eyebrow">ALL-TIME STREET RECORDS</p><h1>TOP<br /><span>FIGHTERS</span></h1></div><button className="close-board" onClick={backFromBoard}>BACK ×</button></div>
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
