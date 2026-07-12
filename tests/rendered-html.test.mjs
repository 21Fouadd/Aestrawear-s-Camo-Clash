import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  const [hosting, page, game, packageJson] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CamoClashGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(hosting, /"d1": "DB"/);
  assert.match(page, /CamoClashGame/);
  assert.match(game, /PANTS\.map/);
  assert.match(game, /\/api\/leaderboard/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
