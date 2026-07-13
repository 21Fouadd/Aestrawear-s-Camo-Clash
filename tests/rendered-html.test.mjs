import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

test("defines the Camo Clash fighter select", async () => {
  const [page, layout, game, config] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CamoClashGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /title: "Camo Clash/);
  assert.match(layout, /AESTRAWEAR/);
  assert.match(game, /CAMO/);
  assert.match(game, /CLASH/);
  assert.match(game, /ENTER THE STREET/);
  assert.match(config, /Ghost Step/);
  assert.match(game, /TOP SCORES/);
  assert.doesNotMatch(`${page}\n${layout}\n${game}`, /codex-preview|Your site is taking shape/);
});

test("ships the four optimized pants and leaderboard binding", async () => {
  const [hosting, page, game, packageJson, leaderboardRoute] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CamoClashGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/leaderboard/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(hosting, /"d1": "DB"/);
  assert.match(page, /CamoClashGame/);
  assert.match(game, /PANTS\.map/);
  assert.match(game, /\/api\/leaderboard/);
  assert.match(leaderboardRoute, /Run statistics are not plausible/);
  assert.match(leaderboardRoute, /minimumDuration/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("ships colored pixel assets, animated zombies, audio, weapons, and mobile controls", async () => {
  const [game, css, config, assets, audio] = await Promise.all([
    readFile(new URL("../app/CamoClashGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_ASSETS.md", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-audio.ts", import.meta.url), "utf8"),
  ]);

  for (const name of ["fist", "bat", "knife", "pistol", "shotgun", "reload", "dash"]) {
    await access(new URL(`../public/pixel/icons/${name}.png`, import.meta.url));
  }
  for (let layer = 1; layer <= 9; layer += 1) {
    const files = [
      "ground", "stars", "moon", "clouds_1", "clouds_2",
      "far_buildings", "bg_buildings", "fg_buildings", "wall",
    ];
    await access(new URL(`../public/pixel/city/layer_${layer}_${files[layer - 1]}.png`, import.meta.url));
  }
  const cityV2 = new URL("../public/pixel/city/camo-city-v2.webp", import.meta.url);
  await access(cityV2);
  const cityV2Bytes = (await stat(cityV2)).size;
  assert.ok(cityV2Bytes > 10_000, "the Camo City backdrop should contain rendered artwork");
  assert.ok(cityV2Bytes < 350_000, "the Camo City backdrop should stay mobile-friendly");

  let zombieSpriteBytes = 0;
  for (const name of ["walker-sheet.png", "mutant-sheet-v2.png"]) {
    const url = new URL(`../public/zombies/${name}`, import.meta.url);
    await access(url);
    const bytes = (await stat(url)).size;
    assert.ok(bytes > 500, `${name} should contain rendered sprite frames`);
    zombieSpriteBytes += bytes;
  }
  let zombieAudioBytes = 0;
  for (const name of ["zombie-attack.ogg", "zombie-death.ogg", "zombie-groan-1.ogg", "zombie-groan-2.ogg"]) {
    const url = new URL(`../public/audio/${name}`, import.meta.url);
    await access(url);
    zombieAudioBytes += (await stat(url)).size;
  }
  assert.ok(zombieSpriteBytes < 30_000, "zombie sprites should stay mobile-friendly");
  assert.ok(zombieAudioBytes < 300_000, "zombie audio should stay mobile-friendly");

  assert.match(game, /"bat" \| "knife" \| "pistol" \| "shotgun"/);
  assert.match(game, /startup: 0\.09/);
  assert.match(game, /state\.hitStop/);
  assert.match(game, /touch-weapon/);
  assert.match(game, /touch-ability/);
  assert.match(game, /touch-reload/);
  assert.match(game, /setPointerCapture/);
  assert.match(game, /createArenaLayers/);
  assert.match(game, /city-premium/);
  assert.match(game, /cameraTrauma/);
  assert.match(game, /waveClearTimer/);
  assert.match(game, /drawEnemyTelegraph/);
  assert.match(game, /effect\.kind === "slash"/);
  assert.match(game, /effect\.kind === "burst"/);
  assert.match(game, /drawOutlinedLimb/);
  assert.match(game, /drawArticulatedPants/);
  assert.match(game, /drawArenaAmbient/);
  assert.match(game, /damageFlash/);
  assert.match(game, /player\.hp > 0 && state\.gameOverTimer === 0/);
  assert.match(game, /if \(enemy\.dead\) continue/);
  assert.match(game, /FRAME_INTERVAL/);
  assert.match(game, /renderScale = mobileProfile \? 0\.75 : 1/);
  assert.match(game, /pickupLock/);
  assert.match(game, /attackPressed/);
  assert.match(game, /INFECTED HORDE/);
  assert.match(game, /zombieFrame/);
  assert.match(game, /emitZombieSound/);
  assert.match(game, /SFX/);
  assert.match(css, /game-shell\.is-fighting/);
  assert.match(css, /rotate-notice/);
  assert.match(css, /image-rendering: pixelated/);
  assert.match(config, /combo control/);
  assert.match(config, /#63d8ff/);
  assert.match(css, /--acid: #d8ff3e/);
  assert.match(audio, /class ZombieAudio/);
  assert.match(audio, /createStereoPanner/);
  assert.match(audio, /playCue\(cue: GameCueId/);
  assert.match(audio, /waveClear/);
  assert.match(css, /health-warning/);
  assert.match(css, /combo-pop/);
  assert.match(assets, /Creative Commons Zero/);
  assert.match(assets, /mutant-sheet-v2\.png/);
  assert.match(assets, /rpg-asset-character-zombie-nes/);
  assert.match(assets, /camo-city-v2\.webp/);
  assert.match(assets, /project-original AI-generated artwork/);
});
