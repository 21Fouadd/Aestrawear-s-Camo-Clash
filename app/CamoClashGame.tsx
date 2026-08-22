"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZombieAudio } from "../lib/game-audio";
import {
  ARENA,
  COLORS,
  ENEMIES,
  ENEMY_SKIN_TONES,
  FIXED_STEP,
  REVIVE_RANGE,
  STREET_HORIZON,
  WEAPONS,
  WORLD_H,
  WORLD_W,
  clamp,
  createInputState,
  distanceSquared,
  freshRun,
  isCoopSnapshot,
  isRecord,
  normalizeFighterName,
  pickUpgradeChoices,
  readCoopIdentity,
  readResult,
  updateGame,
  UPGRADES,
  type CityId,
  type CoopIdentity,
  type Effect,
  type Enemy,
  type FighterId,
  type GameMode,
  type GameState,
  type MedkitPickup,
  type PantId,
  type Player,
  type PlayerInputState,
  type Projectile,
  type Result,
  type Screen,
  type Upgrade,
  type WeaponKind,
  type WeaponPickup,
} from "../lib/game-core";
import { getPant, PANTS } from "../lib/game-config";
import {
  buildCoopInviteUrl,
  createCoopRoom,
  joinCoopRoom,
  parseCoopInvite,
  type CoopConnection,
  type CoopMessage,
  type CoopRole,
} from "../lib/dedicated-coop-network";
import CoopLobby, { type CoopLobbyPhase, type CoopLobbyView, type CoopPlayerSlot } from "./CoopLobby";


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
  reviveAvailable: boolean;
  reviveProgress: number;
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

  if (industrial) {
    streetCtx.save();
    streetCtx.globalAlpha = city.id === "harbor" ? .34 : .22;
    streetCtx.filter = `${city.filter} brightness(.62)`;
    for (const grate of [{ x: 136, y: 486, w: 96 }, { x: 914, y: 554, w: 122 }, { x: 552, y: 642, w: 108 }]) {
      streetCtx.drawImage(industrial, 128, 64, 64, 48, grate.x, grate.y, grate.w, Math.round(grate.w * .34));
    }
    streetCtx.restore();
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
    && a.partnerConnected === b.partnerConnected
    && a.reviveAvailable === b.reviveAvailable
    && a.reviveProgress === b.reviveProgress;
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
  reviveAvailable: false,
  reviveProgress: 0,
};





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
  if (enemy.hitFlash > 0) ctx.filter = "brightness(2.3) saturate(.5)";
  ctx.drawImage(image, frame * frameWidth, 0, frameWidth, frameHeight, -targetWidth / 2, -targetHeight, targetWidth, targetHeight);
  if (enemy.hitFlash > 0) ctx.filter = "none";
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

function drawMedkit(ctx: CanvasRenderingContext2D, medkit: MedkitPickup, nearby: boolean, reducedMotion: boolean, mobileProfile: boolean) {
  if (medkit.life < 3 && Math.floor(medkit.life * 8) % 2 === 0) return;
  const y = medkit.y - 22 + (reducedMotion ? 0 : Math.sin(medkit.bob) * 4);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ctx.beginPath(); ctx.ellipse(medkit.x, medkit.y + 4, 32, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(medkit.x, y);
  ctx.fillStyle = nearby ? "#f5fff9" : "#d9e4e3";
  ctx.strokeStyle = "#07110f";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(-27, -18, 54, 38, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#df3f55";
  ctx.fillRect(-5, -13, 10, 27);
  ctx.fillRect(-14, -4, 28, 10);
  ctx.fillStyle = "#17221f";
  ctx.fillRect(-12, -24, 24, 7);
  ctx.fillRect(-7, -29, 14, 6);
  ctx.fillStyle = "#62d6a2";
  ctx.fillRect(-21, 15, 42, 4);
  ctx.restore();
  ctx.save();
  ctx.translate(medkit.x, y - 34);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = nearby ? "#62d6a2" : "rgba(98,214,162,.7)";
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
  if (nearby) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "900 13px ui-monospace, monospace";
    ctx.fillStyle = "#8af0bb";
    ctx.fillText(`${mobileProfile ? "MOVE OVER" : "AUTO"}  +${medkit.healAmount} HP`, medkit.x, y - 51);
    ctx.restore();
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

function drawEffect(ctx: CanvasRenderingContext2D, effect: Effect, mobileProfile: boolean, lowDetail: boolean, lifeOffset = 0) {
  const visibleLife = effect.life - lifeOffset;
  if (visibleLife <= 0) return;
  const alpha = clamp(visibleLife / effect.maxLife, 0, 1);
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
  } else if (effect.kind === "blood") {
    const count = lowDetail ? 2 : mobileProfile ? 4 : 8;
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.rotate(angle);
    for (let index = 0; index < count; index += 1) {
      const spread = (effectNoise(seed, index) - .5) * 1.25;
      const travel = radius * (.35 + effectNoise(seed, index + 9) * .85) * strength * (.3 + progress);
      const size = 2.5 + effectNoise(seed, index + 19) * (lowDetail ? 3 : 6);
      ctx.globalAlpha = alpha * (.58 + effectNoise(seed, index + 27) * .34);
      ctx.beginPath();
      ctx.arc(Math.cos(spread) * travel, Math.sin(spread) * travel, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (effect.maxLife > .6) {
      ctx.globalAlpha = alpha * .42;
      ctx.beginPath();
      ctx.ellipse(effect.x, effect.y + 43, radius * (.45 + progress * .52) * strength, Math.max(4, radius * .13), angle * .12, 0, Math.PI * 2);
      ctx.fill();
    }
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

function drawCoopIndicators(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  localPlayerId: FighterId,
  reducedMotion: boolean,
  mobileProfile: boolean,
) {
  if (state.mode !== "coop") return;
  const localPlayer = state.players.find((fighter) => fighter.id === localPlayerId);
  if (!localPlayer) return;
  const accent = getPant(localPlayer.pantId).color;
  const bounce = reducedMotion ? 0 : Math.sin(state.elapsed * 5.5) * 4;
  const markerY = localPlayer.y - 154 + bounce;
  ctx.save();
  ctx.translate(localPlayer.x, markerY);
  ctx.fillStyle = "rgba(0,0,0,.82)";
  ctx.beginPath(); ctx.moveTo(-19, -13); ctx.lineTo(19, -13); ctx.lineTo(0, 11); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#f4f0e8";
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(0, 0); ctx.lineTo(14, -16); ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(0, 0); ctx.lineTo(14, -16); ctx.stroke();
  ctx.fillStyle = "#f4f0e8";
  ctx.textAlign = "center";
  ctx.font = "900 12px ui-monospace, monospace";
  ctx.fillText("YOU", 0, -25);
  ctx.restore();

  const partner = state.players.find((fighter) => fighter.id !== localPlayerId && fighter.connected);
  const downed = localPlayer.hp <= 0 ? localPlayer : partner && partner.hp <= 0 ? partner : null;
  if (!downed) return;
  const localCanRevive = downed.id !== localPlayerId
    && localPlayer.hp > 0
    && distanceSquared(localPlayer.x, localPlayer.y, downed.x, downed.y) <= REVIVE_RANGE * REVIVE_RANGE;
  const localIsDown = downed.id === localPlayerId;
  ctx.save();
  ctx.translate(downed.x, downed.y + 4);
  ctx.strokeStyle = localCanRevive || downed.reviveProgress > 0 ? "#62d6a2" : "#ff4d67";
  ctx.lineWidth = 5;
  ctx.globalAlpha = .82;
  ctx.beginPath(); ctx.ellipse(0, 0, 54, 16, 0, 0, Math.PI * 2); ctx.stroke();
  if (downed.reviveProgress > 0) {
    ctx.strokeStyle = "#f4f0e8";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.ellipse(0, 0, 62, 22, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * downed.reviveProgress); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = localCanRevive || downed.reviveProgress > 0 ? "#8af0bb" : "#ff8aa0";
  ctx.textAlign = "center";
  ctx.font = "900 13px ui-monospace, monospace";
  const label = localIsDown
    ? downed.reviveProgress > 0 ? `BEING REVIVED  ${Math.round(downed.reviveProgress * 100)}%` : "YOU ARE DOWN"
    : localCanRevive ? `${mobileProfile ? "HOLD REVIVE" : "HOLD F"}  ${Math.round(downed.reviveProgress * 100)}%` : "TEAMMATE DOWN";
  ctx.fillText(label, 0, -126);
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
  networkEffectLead = 0,
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
    drawEffect(ctx, effect, mobileProfile, lowDetail, networkEffectLead);
  }

  for (const enemy of state.enemies) {
    drawEnemyTelegraph(ctx, enemy);
    drawEliteGround(ctx, enemy, reducedMotion);
  }
  for (const pickup of state.pickups) drawPickup(ctx, pickup, pickup.id === localPlayer.nearPickupId, reducedMotion, mobileProfile, textures);
  for (const medkit of state.medkits) {
    const nearby = localPlayer.hp > 0
      && localPlayer.hp < localPlayer.maxHp
      && distanceSquared(localPlayer.x, localPlayer.y, medkit.x, medkit.y) <= 92 * 92;
    drawMedkit(ctx, medkit, nearby, reducedMotion, mobileProfile);
  }
  renderOrder.length = 0;
  for (const enemy of state.enemies) renderOrder.push(enemy);
  renderOrder.sort((a, b) => a.y - b.y);
  playerRenderOrderScratch.length = 0;
  for (const fighter of state.players) if (fighter.connected) playerRenderOrderScratch.push(fighter);
  playerRenderOrderScratch.sort((a, b) => a.y - b.y);
  let nextPlayerIndex = 0;
  const detailBudget = severePressure ? (mobileProfile ? 6 : 8) : lowDetail ? (mobileProfile ? 9 : 12) : mobileProfile ? 10 : 14;
  detailCandidatesScratch.length = 0;
  detailedEnemyIdsScratch.clear();
  for (const enemy of renderOrder) if (enemy.kind !== "walker") detailCandidatesScratch.push(enemy);
  detailCandidatesScratch.sort((a, b) => {
    const aPriority = a.elite ? 0 : a.state === "windup" || a.state === "active" ? 1 : a.state === "hurt" || a.state === "recover" ? 2 : a.dead ? 3 : 4;
    const bPriority = b.elite ? 0 : b.state === "windup" || b.state === "active" ? 1 : b.state === "hurt" || b.state === "recover" ? 2 : b.dead ? 3 : 4;
    return aPriority - bPriority
      || distanceSquared(a.x, a.y, localPlayer.x, localPlayer.y) - distanceSquared(b.x, b.y, localPlayer.x, localPlayer.y);
  });
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
    drawEffect(ctx, effect, mobileProfile, lowDetail, networkEffectLead);
  }
  drawCoopIndicators(ctx, state, localPlayerId, reducedMotion, mobileProfile);
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

type NetworkRenderSmoothing = {
  runId: string;
  players: Map<FighterId, Player>;
  authoritativePlayers: Map<FighterId, { x: number; y: number; elapsed: number; vx: number; vy: number }>;
  enemies: Map<number, Enemy>;
  projectiles: Map<number, Projectile>;
  pickups: Map<number, WeaponPickup>;
  medkits: Map<number, MedkitPickup>;
  playerIds: Set<FighterId>;
  enemyIds: Set<number>;
  projectileIds: Set<number>;
  pickupIds: Set<number>;
  medkitIds: Set<number>;
  renderState: GameState | null;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
  cameraTrauma: number;
  cameraPhase: number;
  visualElapsed: number;
  effectLead: number;
  snapshotReceivedAt: number;
  roundTripMs: number;
  latencySamples: number;
  lastAckSeq: number;
};

function createNetworkRenderSmoothing(): NetworkRenderSmoothing {
  return {
    runId: "",
    players: new Map(),
    authoritativePlayers: new Map(),
    enemies: new Map(),
    projectiles: new Map(),
    pickups: new Map(),
    medkits: new Map(),
    playerIds: new Set(),
    enemyIds: new Set(),
    projectileIds: new Set(),
    pickupIds: new Set(),
    medkitIds: new Set(),
    renderState: null,
    cameraX: WORLD_W / 2,
    cameraY: WORLD_H / 2,
    cameraZoom: 0,
    cameraTrauma: 0,
    cameraPhase: 0,
    visualElapsed: 0,
    effectLead: 0,
    snapshotReceivedAt: 0,
    roundTripMs: 160,
    latencySamples: 0,
    lastAckSeq: 0,
  };
}

function approachCoordinate(
  current: number,
  target: number,
  response: number,
) {
  return current + (target - current) * response;
}

function smoothNetworkRenderState(
  state: GameState,
  smoothing: NetworkRenderSmoothing,
  dt: number,
  localPlayerId: FighterId,
  inputX: number,
  inputY: number,
) {
  if (smoothing.runId !== state.runId) {
    const transport = {
      snapshotReceivedAt: smoothing.snapshotReceivedAt,
      roundTripMs: smoothing.roundTripMs,
      latencySamples: smoothing.latencySamples,
      lastAckSeq: smoothing.lastAckSeq,
    };
    const fresh = createNetworkRenderSmoothing();
    Object.assign(smoothing, fresh, transport, { runId: state.runId });
    smoothing.visualElapsed = state.elapsed;
  }

  const frameDt = clamp(dt, 1 / 240, .05);
  const actorResponse = 1 - Math.exp(-frameDt * 24);
  const localResponse = 1 - Math.exp(-frameDt * 32);
  const projectileResponse = 1 - Math.exp(-frameDt * 38);
  const snapshotAge = smoothing.snapshotReceivedAt > 0
    ? clamp((performance.now() - smoothing.snapshotReceivedAt) / 1000, 0, .16)
    : 0;
  smoothing.visualElapsed = Math.max(state.elapsed, smoothing.visualElapsed + frameDt);
  smoothing.effectLead = clamp(smoothing.visualElapsed - state.elapsed, 0, 1 / 12);

  if (!smoothing.renderState) {
    smoothing.renderState = {
      ...state,
      players: [],
      enemies: [],
      projectiles: [],
      pickups: [],
      medkits: [],
    };
  }
  const renderState = smoothing.renderState;
  const players = renderState.players;
  const enemies = renderState.enemies;
  const projectiles = renderState.projectiles;
  const pickups = renderState.pickups;
  const medkits = renderState.medkits;
  Object.assign(renderState, state);
  renderState.players = players;
  renderState.enemies = enemies;
  renderState.projectiles = projectiles;
  renderState.pickups = pickups;
  renderState.medkits = medkits;

  smoothing.playerIds.clear();
  let playerWrite = 0;
  let hostPlayer: Player | undefined;
  for (const player of state.players) {
    smoothing.playerIds.add(player.id);
    let visual = smoothing.players.get(player.id);
    const existed = Boolean(visual);
    const previousX = visual?.x ?? player.x;
    const previousY = visual?.y ?? player.y;
    const previousAction = visual?.action ?? player.action;
    const previousActionTime = visual?.actionTime ?? player.actionTime;
    const previousAnimTime = visual?.animTime ?? player.animTime;
    const previousAuthoritative = smoothing.authoritativePlayers.get(player.id);
    let authoritativeVx = previousAuthoritative?.vx ?? 0;
    let authoritativeVy = previousAuthoritative?.vy ?? 0;
    if (!previousAuthoritative || previousAuthoritative.elapsed !== state.elapsed) {
      const authoritativeDt = previousAuthoritative ? state.elapsed - previousAuthoritative.elapsed : 0;
      if (authoritativeDt > 1 / 240 && authoritativeDt < .5) {
        authoritativeVx = clamp((player.x - previousAuthoritative.x) / authoritativeDt, -1_200, 1_200);
        authoritativeVy = clamp((player.y - previousAuthoritative.y) / authoritativeDt, -900, 900);
      }
      smoothing.authoritativePlayers.set(player.id, {
        x: player.x,
        y: player.y,
        elapsed: state.elapsed,
        vx: authoritativeVx,
        vy: authoritativeVy,
      });
    }
    if (!visual) {
      visual = { ...player };
      smoothing.players.set(player.id, visual);
    } else {
      Object.assign(visual, player);
    }
    const canPredict = player.id === localPlayerId && player.connected && player.hp > 0
      && player.action !== "dash" && player.action !== "hurt" && player.action !== "dead";
    const ghostSpeed = player.pantId === "ghost" && player.abilityTimer > 0 ? 1.35 : 1;
    const infectionSlow = player.slowTimer > 0 ? .72 : 1;
    const controlScale = player.action === "attack" ? .46 : player.action === "reload" ? .65 : player.action === "hurt" ? .18 : 1;
    const movementSpeed = player.speed * player.speedMult * ghostSpeed * infectionSlow * controlScale;
    const predictionSeconds = canPredict
      ? clamp(smoothing.roundTripMs / 2000 + snapshotAge + 1 / 60, .045, .18)
      : clamp(snapshotAge, 0, .1);
    const targetX = player.id === localPlayerId && canPredict
      ? clamp(player.x + inputX * movementSpeed * predictionSeconds + player.vx * Math.min(snapshotAge, .08), ARENA.left, ARENA.right)
      : clamp(player.x + authoritativeVx * predictionSeconds, ARENA.left, ARENA.right);
    const targetY = player.id === localPlayerId && canPredict
      ? clamp(player.y + inputY * movementSpeed * predictionSeconds * .72 + player.vy * Math.min(snapshotAge, .08), ARENA.top, ARENA.bottom)
      : clamp(player.y + authoritativeVy * predictionSeconds, ARENA.top, ARENA.bottom);
    const snap = !existed || distanceSquared(previousX, previousY, targetX, targetY) > 165 * 165;
    const response = player.id === localPlayerId ? localResponse : actorResponse;
    visual.x = snap ? targetX : approachCoordinate(previousX, targetX, response);
    visual.y = snap ? targetY : approachCoordinate(previousY, targetY, response);
    const actionChanged = !existed || previousAction !== player.action;
    const estimatedAnim = existed ? previousAnimTime + frameDt * (3.5 + player.moveAmount * 8) : player.animTime;
    visual.actionTime = actionChanged ? player.actionTime : Math.min(player.actionDuration, Math.max(player.actionTime, previousActionTime + frameDt));
    visual.animTime = Math.abs(estimatedAnim - player.animTime) > 1.25 ? player.animTime : estimatedAnim;
    players[playerWrite++] = visual;
    if (visual.id === "host") hostPlayer = visual;
  }
  players.length = playerWrite;
  for (const id of smoothing.players.keys()) {
    if (!smoothing.playerIds.has(id)) {
      smoothing.players.delete(id);
      smoothing.authoritativePlayers.delete(id);
    }
  }

  smoothing.enemyIds.clear();
  let enemyWrite = 0;
  for (const enemy of state.enemies) {
    smoothing.enemyIds.add(enemy.id);
    let visual = smoothing.enemies.get(enemy.id);
    const existed = Boolean(visual);
    const previousX = visual?.x ?? enemy.x;
    const previousY = visual?.y ?? enemy.y;
    const previousState = visual?.state ?? enemy.state;
    const previousStateTimer = visual?.stateTimer ?? enemy.stateTimer;
    const previousAnimTime = visual?.animTime ?? enemy.animTime;
    if (!visual) {
      visual = { ...enemy };
      smoothing.enemies.set(enemy.id, visual);
    } else {
      Object.assign(visual, enemy);
    }
    const snap = !existed || distanceSquared(previousX, previousY, enemy.x, enemy.y) > 190 * 190;
    visual.x = snap ? enemy.x : approachCoordinate(previousX, enemy.x, actorResponse);
    visual.y = snap ? enemy.y : approachCoordinate(previousY, enemy.y, actorResponse);
    const stateChanged = !existed || previousState !== enemy.state;
    const estimatedAnim = existed ? previousAnimTime + frameDt * (enemy.state === "chase" || enemy.state === "enter" ? clamp(enemy.speed / 13, 4.5, 12) : 3) : enemy.animTime;
    visual.stateTimer = stateChanged ? enemy.stateTimer : Math.min(enemy.stateDuration, Math.max(enemy.stateTimer, previousStateTimer + frameDt));
    visual.animTime = Math.abs(estimatedAnim - enemy.animTime) > 1.5 ? enemy.animTime : estimatedAnim;
    enemies[enemyWrite++] = visual;
  }
  enemies.length = enemyWrite;
  for (const id of smoothing.enemies.keys()) if (!smoothing.enemyIds.has(id)) smoothing.enemies.delete(id);

  smoothing.projectileIds.clear();
  let projectileWrite = 0;
  for (const projectile of state.projectiles) {
    smoothing.projectileIds.add(projectile.id);
    let visual = smoothing.projectiles.get(projectile.id);
    const existed = Boolean(visual);
    const previousX = visual?.x ?? projectile.x;
    const previousY = visual?.y ?? projectile.y;
    if (!visual) {
      visual = { ...projectile };
      smoothing.projectiles.set(projectile.id, visual);
    } else {
      Object.assign(visual, projectile);
    }
    const snap = !existed || distanceSquared(previousX, previousY, projectile.x, projectile.y) > 240 * 240;
    visual.x = snap ? projectile.x : approachCoordinate(previousX, projectile.x, projectileResponse);
    visual.y = snap ? projectile.y : approachCoordinate(previousY, projectile.y, projectileResponse);
    projectiles[projectileWrite++] = visual;
  }
  projectiles.length = projectileWrite;
  for (const id of smoothing.projectiles.keys()) if (!smoothing.projectileIds.has(id)) smoothing.projectiles.delete(id);

  smoothing.pickupIds.clear();
  let pickupWrite = 0;
  for (const pickup of state.pickups) {
    smoothing.pickupIds.add(pickup.id);
    let visual = smoothing.pickups.get(pickup.id);
    const existed = Boolean(visual);
    const previousX = visual?.x ?? pickup.x;
    const previousY = visual?.y ?? pickup.y;
    if (!visual) {
      visual = { ...pickup };
      smoothing.pickups.set(pickup.id, visual);
    } else {
      Object.assign(visual, pickup);
    }
    const snap = !existed || distanceSquared(previousX, previousY, pickup.x, pickup.y) > 120 * 120;
    visual.x = snap ? pickup.x : approachCoordinate(previousX, pickup.x, actorResponse);
    visual.y = snap ? pickup.y : approachCoordinate(previousY, pickup.y, actorResponse);
    pickups[pickupWrite++] = visual;
  }
  pickups.length = pickupWrite;
  for (const id of smoothing.pickups.keys()) if (!smoothing.pickupIds.has(id)) smoothing.pickups.delete(id);

  smoothing.medkitIds.clear();
  let medkitWrite = 0;
  for (const medkit of state.medkits) {
    smoothing.medkitIds.add(medkit.id);
    let visual = smoothing.medkits.get(medkit.id);
    const existed = Boolean(visual);
    const previousX = visual?.x ?? medkit.x;
    const previousY = visual?.y ?? medkit.y;
    if (!visual) {
      visual = { ...medkit };
      smoothing.medkits.set(medkit.id, visual);
    } else {
      Object.assign(visual, medkit);
    }
    const snap = !existed || distanceSquared(previousX, previousY, medkit.x, medkit.y) > 120 * 120;
    visual.x = snap ? medkit.x : approachCoordinate(previousX, medkit.x, actorResponse);
    visual.y = snap ? medkit.y : approachCoordinate(previousY, medkit.y, actorResponse);
    medkits[medkitWrite++] = visual;
  }
  medkits.length = medkitWrite;
  for (const id of smoothing.medkits.keys()) if (!smoothing.medkitIds.has(id)) smoothing.medkits.delete(id);

  smoothing.cameraX += (state.cameraFocusX - smoothing.cameraX) * actorResponse;
  smoothing.cameraY += (state.cameraFocusY - smoothing.cameraY) * actorResponse;
  smoothing.cameraZoom += (state.cameraZoom - smoothing.cameraZoom) * actorResponse;
  smoothing.cameraTrauma += (state.cameraTrauma - smoothing.cameraTrauma) * projectileResponse;
  smoothing.cameraPhase = Math.abs(smoothing.cameraPhase - state.cameraPhase) > 2
    ? state.cameraPhase
    : smoothing.cameraPhase + frameDt * 26;

  renderState.player = hostPlayer ?? players[0];
  renderState.elapsed = smoothing.visualElapsed;
  renderState.cameraFocusX = smoothing.cameraX;
  renderState.cameraFocusY = smoothing.cameraY;
  renderState.cameraZoom = smoothing.cameraZoom;
  renderState.cameraTrauma = smoothing.cameraTrauma;
  renderState.cameraPhase = smoothing.cameraPhase;
  return renderState;
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
  const networkRenderRef = useRef<NetworkRenderSmoothing>(createNetworkRenderSmoothing());
  const keysRef = useRef(new Set<string>());
  const actionsRef = useRef<PlayerInputState>(createInputState());
  const coopConnectionRef = useRef<CoopConnection | null>(null);
  const coopRoleRef = useRef<CoopRole | null>(null);
  const coopPartnerRef = useRef<CoopIdentity | null>(null);
  const localCoopIdentityRef = useRef<CoopIdentity>({ name: "FIGHTER", pantId: "ghost" });
  const coopControlHandlerRef = useRef<(message: CoopMessage) => void>(() => undefined);
  const coopStateHandlerRef = useRef<(message: CoopMessage) => void>(() => undefined);
  const coopClosingRef = useRef(false);
  const receivedSnapshotRef = useRef(0);
  const coopReceiptRef = useRef("");
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
    gameRef.current = null;
    networkRenderRef.current = createNetworkRenderSmoothing();
    coopReceiptRef.current = "";
    setCoopMessage(message);
    setCoopPhase("error");
    setCoopPartner(null);
    coopPartnerRef.current = null;
    setCoopView(coopRoleRef.current === "host" ? "host" : "join");
    setCoopOpen(true);
    changeScreen("menu");
  }, [changeScreen]);

  const makeCoopHandlers = useCallback(() => ({
    onOpen: () => setCoopPhase("ready"),
    onStatus: (status: "waiting" | "connecting" | "connected" | "closed") => {
      if (status === "waiting") {
        setCoopPhase("waiting");
        if (screenRef.current === "playing" || screenRef.current === "upgrade") {
          const partner = gameRef.current?.players.find((fighter) => fighter.id !== coopRoleRef.current);
          if (partner) partner.connected = false;
        }
        setCoopMessage(screenRef.current === "playing" || screenRef.current === "upgrade" ? "Your squadmate is reconnecting to the dedicated server..." : "Room live on the dedicated server. Share the private invite.");
      }
      else if (status === "connecting" && !coopPartnerRef.current) setCoopPhase("connecting");
      else if (status === "connected") setCoopPhase("ready");
    },
    onControl: (message: CoopMessage) => coopControlHandlerRef.current(message),
    onState: (message: CoopMessage) => coopStateHandlerRef.current(message),
    onError: (message: string) => handleCoopDisconnect(message),
    onClose: () => handleCoopDisconnect("Your co-op partner left the room."),
  }), [handleCoopDisconnect]);

  useEffect(() => {
    coopControlHandlerRef.current = (message) => {
      if (message.type === "welcome") {
        if (message.role === "host" || message.role === "guest") {
          coopRoleRef.current = message.role;
          setCoopRole(message.role);
        }
        if (typeof message.roomId === "string") setCoopRoomId(message.roomId);
        return;
      }
      if (message.type === "lobby" && Array.isArray(message.players)) {
        const role = coopRoleRef.current;
        const localRecord = message.players.find((candidate) => isRecord(candidate) && candidate.id === role && candidate.connected !== false);
        const localIdentity = readCoopIdentity(localRecord, role === "guest" ? "FIGHTER 02" : "FIGHTER 01");
        if (localIdentity) {
          localCoopIdentityRef.current = localIdentity;
          setSelectedPant(localIdentity.pantId);
        }
        const partnerRecord = message.players.find((candidate) => isRecord(candidate) && candidate.id !== role && candidate.connected !== false);
        const identity = readCoopIdentity(partnerRecord, role === "host" ? "FIGHTER 02" : "FIGHTER 01");
        coopPartnerRef.current = identity;
        setCoopPartner(identity);
        const ready = message.phase !== "waiting" && Boolean(identity);
        setCoopPhase(ready ? "ready" : "waiting");
        setCoopMessage(ready
          ? role === "host" ? "Squad linked through the dedicated server. Launch when ready." : "Squad linked through the dedicated server. Waiting for the squad leader."
          : "Waiting for the second fighter on the dedicated server…");
        return;
      }
      if (message.type === "hello") {
        const identity = readCoopIdentity(message, coopRoleRef.current === "host" ? "FIGHTER 02" : "FIGHTER 01");
        if (!identity) return;
        coopPartnerRef.current = identity;
        setCoopPartner(identity);
        setCoopPhase("ready");
        setCoopMessage(coopRoleRef.current === "host" ? "Squad linked through the dedicated server. Launch when ready." : "Squad linked through the dedicated server. Waiting for the squad leader.");
        return;
      }
      if (message.type === "start" || message.type === "started") {
        if (!isCoopSnapshot(message.state)) return;
        const snapshot = message.state;
        const hostPlayer = snapshot.players.find((fighter) => fighter.id === "host");
        const guestPlayer = snapshot.players.find((fighter) => fighter.id === "guest");
        if (!hostPlayer || !guestPlayer) return;
        const hostIdentity = readCoopIdentity(message.host ?? hostPlayer, "FIGHTER 01");
        const guestIdentity = readCoopIdentity(message.guest ?? guestPlayer, "FIGHTER 02");
        const cityId = typeof message.city === "string" && CITIES.some((item) => item.id === message.city) ? message.city as CityId : "neon";
        if (!hostIdentity || !guestIdentity) return;
        const role = coopRoleRef.current ?? "guest";
        const localIdentity = role === "host" ? hostIdentity : guestIdentity;
        const partnerIdentity = role === "host" ? guestIdentity : hostIdentity;
        localCoopIdentityRef.current = localIdentity;
        coopPartnerRef.current = partnerIdentity;
        setCoopPartner(partnerIdentity);
        setPlayerName(localIdentity.name);
        setSelectedPant(localIdentity.pantId);
        chooseCity(cityId);
        snapshot.player = hostPlayer;
        snapshot.pantId = hostPlayer.pantId;
        snapshot.audioEvents = snapshot.audioEvents.slice(0, 24);
        gameRef.current = snapshot;
        networkRenderRef.current = createNetworkRenderSmoothing();
        receivedSnapshotRef.current = 0;
        coopReceiptRef.current = "";
        setResult(null);
        setSubmitted(false);
        setSubmitStatus("");
        setUpgrades([]);
        setHud(INITIAL_HUD);
        setCoopPhase("ready");
        setCoopOpen(false);
        audioRef.current?.resetForRun();
        changeScreen("playing");
        if (window.location.hash.startsWith("#coop=")) history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        return;
      }
      if (message.type === "screen") {
        if (message.screen === "upgrade") {
          if (gameRef.current) gameRef.current.pendingUpgrade = true;
          const choices = Array.isArray(message.choices)
            ? message.choices.flatMap((choice) => {
              if (!isRecord(choice) || typeof choice.id !== "string") return [];
              const upgrade = UPGRADES.find((item) => item.id === choice.id);
              return upgrade ? [upgrade] : [];
            })
            : [];
          setUpgrades(coopRoleRef.current === "host" ? choices : []);
          changeScreen("upgrade");
        } else if (message.screen === "playing") {
          if (gameRef.current) gameRef.current.pendingUpgrade = false;
          setUpgrades([]);
          changeScreen("playing");
        } else if (message.screen === "gameover") {
          const nextResult = readResult(message.result);
          if (!nextResult) return;
          coopReceiptRef.current = typeof message.receipt === "string" ? message.receipt : "";
          setResult(nextResult);
          setSubmitStatus(coopRoleRef.current === "guest" ? "Only the squad leader submits the shared score." : "");
          changeScreen("gameover");
          void fetchLeaderboard();
        }
        return;
      }
      if (message.type === "error") {
        const errorMessage = typeof message.message === "string" ? message.message : "The dedicated match server rejected that request.";
        setCoopMessage(errorMessage);
        if (message.code === "PANT_LOCKED") return;
        if (screenRef.current === "menu") setCoopPhase(message.code === "START_DENIED" && coopPartnerRef.current ? "ready" : "error");
        else if (screenRef.current === "gameover" && message.code === "START_DENIED") {
          setCoopPhase("ready");
          setSubmitStatus(errorMessage);
        }
      }
    };

    coopStateHandlerRef.current = (message) => {
      if (message.type === "snapshot" && coopRoleRef.current) {
        if (!Number.isSafeInteger(message.seq) || (message.seq as number) <= receivedSnapshotRef.current || !isCoopSnapshot(message.state)) return;
        const smoothing = networkRenderRef.current;
        smoothing.snapshotReceivedAt = performance.now();
        if (isRecord(message.ack)) {
          const role = coopRoleRef.current;
          const ackSeq = message.ack[role];
          const echoedAt = message.ack[role === "host" ? "hostTime" : "guestTime"];
          if (Number.isSafeInteger(ackSeq) && (ackSeq as number) >= smoothing.lastAckSeq) smoothing.lastAckSeq = ackSeq as number;
          if (Number.isSafeInteger(echoedAt) && (echoedAt as number) > 0) {
            const sample = Date.now() - (echoedAt as number);
            if (sample >= 0 && sample <= 2_000) {
              smoothing.roundTripMs = smoothing.latencySamples === 0
                ? sample
                : smoothing.roundTripMs * .82 + sample * .18;
              smoothing.latencySamples += 1;
            }
          }
        }
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
    if (!hud.reviveAvailable) actionsRef.current.revive = false;
  }, [hud.reviveAvailable]);

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
      actionsRef.current.revive = false;
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
      let renderElapsed = elapsed;
      let simulationSteps = 0;
      const activeRole = coopRoleRef.current;
      let localInputX = actionsRef.current.dx + (keysRef.current.has("d") || keysRef.current.has("arrowright") ? 1 : 0) - (keysRef.current.has("a") || keysRef.current.has("arrowleft") ? 1 : 0);
      let localInputY = actionsRef.current.dy + (keysRef.current.has("s") || keysRef.current.has("arrowdown") ? 1 : 0) - (keysRef.current.has("w") || keysRef.current.has("arrowup") ? 1 : 0);
      const localInputLength = Math.hypot(localInputX, localInputY);
      if (localInputLength > 1) { localInputX /= localInputLength; localInputY /= localInputLength; }
      const reviveHeld = actionsRef.current.revive || keysRef.current.has("f");
      if (activeRole) {
        inputClock += elapsed;
        hudClock += elapsed;
        if (inputClock >= 1 / 30) {
          inputClock %= 1 / 30;
          coopConnectionRef.current?.sendState({
            type: "input",
            input: { dx: localInputX, dy: localInputY, attack: actionsRef.current.attack || keysRef.current.has(" ") || keysRef.current.has("j"), revive: reviveHeld },
          });
          for (const action of ["attackQueued", "dash", "ability", "swap", "reload"] as const) {
            if (actionsRef.current[action] && coopConnectionRef.current?.sendControl({ type: "action", action })) actionsRef.current[action] = false;
          }
        }
        if (accumulator < FIXED_STEP) return;
        renderElapsed = clamp(accumulator, 1 / 240, .05);
        accumulator %= FIXED_STEP;
        simulationSteps = 1;
      } else {
        const touchRevive = actionsRef.current.revive;
        actionsRef.current.revive = reviveHeld;
        while (accumulator >= FIXED_STEP && simulationSteps < 3) {
          updateGame(state, FIXED_STEP, keysRef.current, actionsRef.current);
          accumulator -= FIXED_STEP;
          hudClock += FIXED_STEP;
          simulationSteps += 1;
        }
        actionsRef.current.revive = touchRevive;
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
        || livingEnemies >= (mobileProfile ? 15 : 16)
        || state.effects.length >= 80
        || state.projectiles.length >= 40
        ? 2
        : scalePressure > .35
          || livingEnemies >= (mobileProfile ? 10 : 12)
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
      const renderState = activeRole
        ? smoothNetworkRenderState(state, networkRenderRef.current, renderElapsed, localPlayerId, localInputX, localInputY)
        : state;
      drawGame(
        ctx,
        renderState,
        imagesRef.current,
        arenaLayersRef.current,
        renderTexturesRef.current,
        getCity(selectedCityRef.current),
        reducedMotion,
        mobileProfile,
        quality,
        renderPressureTier,
        localPlayerId,
        activeRole ? networkRenderRef.current.effectLead : 0,
      );
      if (hudClock > 0.1) {
        hudClock %= .1;
        const localPlayer = state.players.find((fighter) => fighter.id === localPlayerId) ?? state.player;
        const partner = state.players.find((fighter) => fighter.id !== localPlayerId);
        const nearPickup = state.pickups.find((pickup) => pickup.id === localPlayer.nearPickupId);
        const downedFighter = localPlayer.hp <= 0 ? localPlayer : partner && partner.hp <= 0 ? partner : null;
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
          reviveAvailable: Boolean(
            partner?.connected
            && partner.hp <= 0
            && localPlayer.hp > 0
            && distanceSquared(localPlayer.x, localPlayer.y, partner.x, partner.y) <= REVIVE_RANGE * REVIVE_RANGE,
          ),
          reviveProgress: Math.round((downedFighter?.reviveProgress ?? 0) * 100) / 100,
        };
        setHud((current) => hudMatches(current, nextHud) ? current : nextHud);
      }
      if (!activeRole && state.players.filter((fighter) => fighter.connected).every((fighter) => fighter.hp <= 0) && state.gameOverTimer <= 0) {
        cancelAnimationFrame(frameId);
        const finalResult: Result = { runId: state.runId, score: state.score, wave: state.wave, kills: state.kills, maxCombo: state.maxCombo, elapsed: state.elapsed, mode: state.mode };
        setResult(finalResult);
        setSubmitStatus("");
        changeScreen("gameover");
        void fetchLeaderboard();
        return;
      }
      if (!activeRole && state.pendingUpgrade) {
        cancelAnimationFrame(frameId);
        const choices = pickUpgradeChoices(state.player);
        setUpgrades(choices);
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
    coopReceiptRef.current = "";
    networkRenderRef.current = createNetworkRenderSmoothing();
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
    if (coopRoleRef.current) {
      if (coopRoleRef.current === "host") {
        const sent = coopConnectionRef.current?.sendControl({ type: "upgrade", upgradeId: upgrade.id });
        if (sent) setCoopMessage("Upgrade locked. The dedicated server is syncing the squad…");
      }
      return;
    }
    const state = gameRef.current;
    if (!state) return;
    for (const fighter of state.players) upgrade.apply(fighter);
    state.pendingUpgrade = false;
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

  const changeCoopPant = (pantId: PantId) => {
    const previous = localCoopIdentityRef.current;
    const nextIdentity = { name: normalizeFighterName(playerName, coopRole === "guest" ? "FIGHTER 02" : "FIGHTER 01"), pantId };
    localCoopIdentityRef.current = nextIdentity;
    setSelectedPant(pantId);
    const connection = coopConnectionRef.current;
    if (!connection) return;
    if (!connection.sendControl({ type: "pant", pantId })) {
      localCoopIdentityRef.current = previous;
      setSelectedPant(previous.pantId);
      setCoopMessage("The pants change could not reach the match server. Try again.");
      return;
    }
    setCoopMessage(`${getPant(pantId).callSign} selected. Syncing your co-op loadout...`);
  };

  const createPrivateRoom = async () => {
    coopClosingRef.current = false;
    setCoopView("host");
    setCoopPhase("creating");
    setCoopMessage("Opening a low-latency Frankfurt match room...");
    const identity: CoopIdentity = { name: normalizeFighterName(playerName, "FIGHTER 01"), pantId: selectedPant };
    localCoopIdentityRef.current = identity;
    coopRoleRef.current = "host";
    setCoopRole("host");
    try {
      if (coopConnectionRef.current) await coopConnectionRef.current.close();
      const room = await createCoopRoom(makeCoopHandlers(), identity);
      coopConnectionRef.current = room.connection;
      setCoopRoomId(room.roomId);
      setCoopInviteUrl(buildCoopInviteUrl(room.roomId, room.inviteToken));
      setCoopPhase("waiting");
      setCoopMessage("Dedicated room live. Send the private link to your second fighter.");
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
      setCoopMessage("That invite link is incomplete. Ask the squad leader to copy the full private link.");
      return;
    }
    coopClosingRef.current = false;
    setCoopView("join");
    setCoopPhase("connecting");
    setCoopMessage("Connecting through the dedicated match server. A sleeping server can take up to a minute...");
    const identity: CoopIdentity = { name: normalizeFighterName(playerName, "FIGHTER 02"), pantId: selectedPant };
    localCoopIdentityRef.current = identity;
    coopRoleRef.current = "guest";
    setCoopRole("guest");
    try {
      if (coopConnectionRef.current) await coopConnectionRef.current.close(false);
      const room = await joinCoopRoom(invite, makeCoopHandlers(), identity);
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
    coopReceiptRef.current = "";
    networkRenderRef.current = createNetworkRenderSmoothing();
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
    coopReceiptRef.current = "";
    networkRenderRef.current = createNetworkRenderSmoothing();
    setSubmitted(false);
    const sent = coopConnectionRef.current.sendControl({ type: "start", city: selectedCityRef.current });
    if (!sent) {
      setCoopMessage("The squad is not ready to launch yet.");
      return;
    }
    setCoopPhase("connecting");
    setCoopMessage("Squad locked. The dedicated server is starting the run...");
    if (screenRef.current === "gameover") setSubmitStatus("The dedicated server is preparing the rematch...");
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
    if (result.mode === "coop" && coopRoleRef.current !== "host") return;
    const receipt = result.mode === "coop" ? coopReceiptRef.current : "";
    if (result.mode === "coop" && !receipt) {
      setSubmitStatus("The dedicated server confirmation is missing. Reconnect before submitting.");
      return;
    }
    const normalized = playerName.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (Array.from(normalized).length < 2) { setSubmitStatus("Enter at least two characters."); return; }
    setSubmitStatus("Posting your street record…");
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, playerName: normalized, pantId: selectedPant, ...(receipt ? { receipt } : {}) }),
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
    pantId: selectedPant,
    accent: pant.color,
    connected: true,
    ready: coopPhase === "ready",
  };
  const partnerLobbySlot: CoopPlayerSlot | null = coopPartner ? {
    name: coopPartner.name,
    pant: getPant(coopPartner.pantId).callSign,
    pantId: coopPartner.pantId,
    accent: getPant(coopPartner.pantId).color,
    connected: true,
    ready: true,
  } : null;
  const hostLobbySlot = coopRole === "guest"
    ? partnerLobbySlot ?? { name: "LEADER LINKING", pant: "AWAITING SERVER RELAY", connected: false }
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
              <p className="control-copy">WASD / ARROWS MOVE | SPACE / J ATTACK | SHIFT / K DASH | E / L POWER | Q SWAP | R RELOAD | F REVIVE</p>
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
          selectedPant={selectedPant}
          canStart={coopRole === "host" && coopPhase === "ready" && Boolean(coopPartner)}
          onClose={() => { if (coopConnectionRef.current) leaveCoop(); else setCoopOpen(false); }}
          onChoose={(view) => { setCoopView(view); setCoopPhase("idle"); setCoopMessage(""); }}
          onCreate={() => { void createPrivateRoom(); }}
          onJoin={(value) => { void joinPrivateRoom(value); }}
          onCopy={(value) => { void copyInvite(value); }}
          onShare={(value) => { void shareInvite(value); }}
          onStart={startCoopRun}
          onPantChange={changeCoopPant}
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
                  <strong>{!hud.partnerConnected ? "OFFLINE" : hud.partnerHealth <= 0 ? hud.reviveProgress > 0 ? `REVIVING ${Math.round(hud.reviveProgress * 100)}%` : "DOWN" : `${Math.ceil(hud.partnerHealth)} HP`}</strong>
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
          <div className="desktop-controls"><span>WASD MOVE</span><span>SPACE ATTACK</span><span>SHIFT DASH</span><span>E ABILITY</span><span>Q SWAP</span><span>R RELOAD</span><span>F REVIVE</span></div>
          {coopRole && (hud.health <= 0 || hud.reviveAvailable || hud.reviveProgress > 0) && (
            <div className="revive-hud-prompt" aria-live="polite">
              <strong>{hud.health <= 0 ? (hud.reviveProgress > 0 ? "BEING REVIVED" : "WAIT FOR TEAMMATE") : hud.reviveAvailable ? "HOLD REVIVE // TEAMMATE" : "MOVE TO TEAMMATE"}</strong>
              <span><i style={{ width: `${hud.reviveProgress * 100}%` }} /></span>
            </div>
          )}
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
            <div className="joystick" aria-label="Movement joystick" onPointerDown={startJoystick} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) handleJoystick(event); }} onPointerUp={releaseJoystick} onPointerCancel={releaseJoystick} onLostPointerCapture={releaseJoystick}><i /></div>
            <div className="action-cluster">
              <button type="button" className="touch-weapon" aria-label="Swap or drop weapon" onPointerDown={() => { actionsRef.current.swap = true; }}><img className="touch-icon" src={WEAPONS[hud.weapon].icon} alt="" /><span>SWAP</span></button>
              <button type="button" className={`touch-ability ${hud.abilityCd <= 0 ? "ready" : "cooldown"}`} aria-label={`${pant.ability} ability`} onPointerDown={() => { actionsRef.current.ability = true; }}><span>{hud.abilityCd <= 0 ? "POWER" : hud.abilityCd.toFixed(1)}</span></button>
              <button type="button" className="touch-attack" aria-label={WEAPONS[hud.weapon].firearm ? "Fire weapon" : "Attack"} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); actionsRef.current.attack = true; actionsRef.current.attackQueued = true; }} onPointerUp={() => { actionsRef.current.attack = false; }} onPointerCancel={() => { actionsRef.current.attack = false; }} onLostPointerCapture={() => { actionsRef.current.attack = false; }}><img className="touch-icon" src={WEAPONS[hud.weapon].icon} alt="" /><span>{WEAPONS[hud.weapon].firearm ? "FIRE" : "HIT"}</span></button>
              <button type="button" className={`touch-reload ${hud.reloading ? "reloading" : ""}`} aria-label="Reload weapon" disabled={!WEAPONS[hud.weapon].firearm} onPointerDown={() => { actionsRef.current.reload = true; }}><img className="touch-icon" src="/pixel/icons/reload.png" alt="" /><span>{WEAPONS[hud.weapon].firearm ? `${hud.ammo}/${hud.reserve}` : "—"}</span></button>
              <button type="button" className={`touch-dash ${hud.dashCd <= 0 ? "ready" : "cooldown"}`} aria-label={hud.dashCd <= 0 ? "Dash ready" : `Dash ready in ${hud.dashCd.toFixed(1)} seconds`} onPointerDown={() => { actionsRef.current.dash = true; }}><img className="touch-icon" src="/pixel/icons/dash.png" alt="" /><span>{hud.dashCd <= 0 ? "DASH" : hud.dashCd.toFixed(1)}</span></button>
              {coopRole && hud.reviveAvailable && (
                <button
                  type="button"
                  className="touch-revive ready"
                  aria-label="Hold to revive teammate"
                  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); actionsRef.current.revive = true; }}
                  onPointerUp={() => { actionsRef.current.revive = false; }}
                  onPointerCancel={() => { actionsRef.current.revive = false; }}
                  onLostPointerCapture={() => { actionsRef.current.revive = false; }}
                >
                  <span>REVIVE</span><small>{Math.round(hud.reviveProgress * 100)}%</small>
                </button>
              )}
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
                <p className="eyebrow">WAVE CLEARED // {coopRole === "guest" ? "SQUAD LEADER SELECTING" : "CHOOSE ONE"}</p><h2 id="upgrade-title">LEVEL UP THE FIT</h2>
                {coopRole === "guest"
                  ? <div className="coop-guest-wait"><i aria-hidden="true" /><strong>SQUAD UPGRADE PENDING</strong><span>The squad leader is choosing a server-synced boost.</span></div>
                  : <div className="upgrade-grid">{upgrades.map((upgrade, index) => <button key={upgrade.id} onClick={() => chooseUpgrade(upgrade)}><span>0{index + 1}</span><strong>{upgrade.name}</strong><small>{upgrade.description}</small></button>)}</div>}
              </div>
            </div>
          )}

          {screen === "gameover" && result && (
            <div className="modal-backdrop results-backdrop" role="dialog" aria-modal="true" aria-labelledby="results-title">
              <div className="results-panel cut-panel">
                <div><p className="eyebrow">RUN TERMINATED</p><h2 id="results-title">OVERRUN</h2><p className="result-score">{result.score.toLocaleString()}</p><span className="score-caption">FINAL SCORE</span></div>
                <div className="result-stats"><div><strong>{result.wave}</strong><span>WAVE</span></div><div><strong>{result.kills}</strong><span>KOs</span></div><div><strong>x{result.maxCombo}</strong><span>MAX COMBO</span></div><div><strong>{formatTime(result.elapsed)}</strong><span>SURVIVED</span></div></div>
                <div className="submit-block"><label htmlFor="result-name">{result.mode === "coop" ? "SQUAD LEADER" : "FIGHTER NAME"}</label><input id="result-name" maxLength={18} value={playerName} onChange={(event) => setPlayerName(event.target.value)} disabled={result.mode === "coop"} />{coopRole !== "guest" && <button className="primary-button" disabled={submitted} onClick={submitScore}>{submitted ? "SCORE LOCKED" : "SUBMIT SCORE"}</button>}<p role="status">{submitStatus}</p></div>
                <div className="result-actions"><button onClick={result.mode === "coop" ? (coopRole === "host" ? startCoopRun : undefined) : startRun} disabled={result.mode === "coop" && (coopRole !== "host" || coopPhase === "connecting")}>{result.mode === "coop" && coopRole === "guest" ? "WAITING FOR SQUAD LEADER" : result.mode === "coop" && coopPhase === "connecting" ? "SERVER STARTING…" : "FIGHT AGAIN"}</button><button onClick={() => { setResult(null); if (result.mode === "coop") leaveCoop(); else changeScreen("menu"); }}>CHANGE PANTS</button><button onClick={openLeaderboard}>LEADERBOARD</button></div>
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
