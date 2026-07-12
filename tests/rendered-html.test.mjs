import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

test("ships monochrome pixel assets, weapons, and complete mobile controls", async () => {
  const [game, css, config, assets] = await Promise.all([
    readFile(new URL("../app/CamoClashGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_ASSETS.md", import.meta.url), "utf8"),
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

  assert.match(game, /"bat" \| "knife" \| "pistol" \| "shotgun"/);
  assert.match(game, /startup: 0\.09/);
  assert.match(game, /state\.hitStop/);
  assert.match(game, /touch-weapon/);
  assert.match(game, /touch-ability/);
  assert.match(game, /touch-reload/);
  assert.match(game, /setPointerCapture/);
  assert.match(game, /createArenaLayers/);
  assert.match(game, /FRAME_INTERVAL/);
  assert.match(game, /renderScale = mobileProfile \? 0\.75 : 1/);
  assert.match(game, /pickupLock/);
  assert.match(game, /attackPressed/);
  assert.match(game, /INFECTED HORDE/);
  assert.match(css, /game-shell\.is-fighting/);
  assert.match(css, /rotate-notice/);
  assert.match(css, /image-rendering: pixelated/);
  assert.match(config, /combo control/);
  assert.match(assets, /Creative Commons Zero/);
  assert.doesNotMatch(`${game}\n${css}\n${config}`, /#d7ff35|#73e6de|#ff652f|#ef4141|#b28cff|#9ecf72/i);
});
