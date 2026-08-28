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
  assert.match(game, /CUSTOMIZE FIGHTER/);
  assert.match(game, /BUILD YOUR LOOK/);
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
  assert.match(leaderboardRoute, /async function verifyCoopReceipt/);
  assert.match(leaderboardRoute, /MATCH_TICKET_SECRET/);
  assert.match(leaderboardRoute, /crypto\.subtle\.verify/);
  assert.match(leaderboardRoute, /mode === "coop"/);
  assert.match(leaderboardRoute, /valid match-server receipt/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("ships colored pixel assets, animated zombies, audio, weapons, and mobile controls", async () => {
  const [game, core, css, config, assets, audio] = await Promise.all([
    readFile(new URL("../app/CamoClashGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-core.ts", import.meta.url), "utf8"),
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
  for (const name of ["evil-hello-kitty.webp", "dubai-chocolate-labubu.webp"]) {
    const url = new URL(`../public/enemies/${name}`, import.meta.url);
    await access(url);
    const bytes = (await stat(url)).size;
    assert.ok(bytes > 1_000, `${name} should contain rendered enemy artwork`);
    assert.ok(bytes < 100_000, `${name} should stay mobile-friendly`);
  }
  for (const name of ["hello-kitty-boss-cute.webp", "hello-kitty-boss-peel-1.webp", "hello-kitty-boss-peel-2.webp", "hello-kitty-boss-zombie.webp"]) {
    const url = new URL(`../public/enemies/${name}`, import.meta.url);
    await access(url);
    const bytes = (await stat(url)).size;
    assert.ok(bytes > 20_000, `${name} should contain detailed boss artwork`);
    assert.ok(bytes < 150_000, `${name} should stay mobile-friendly`);
  }
  let zombieAudioBytes = 0;
  for (const name of ["zombie-attack.ogg", "zombie-death.ogg", "zombie-groan-1.ogg", "zombie-groan-2.ogg"]) {
    const url = new URL(`../public/audio/${name}`, import.meta.url);
    await access(url);
    zombieAudioBytes += (await stat(url)).size;
  }
  assert.ok(zombieSpriteBytes < 30_000, "zombie sprites should stay mobile-friendly");
  assert.ok(zombieAudioBytes < 300_000, "zombie audio should stay mobile-friendly");

  assert.match(game, /from "\.\.\/lib\/game-core"/);
  assert.match(core, /export type WeaponKind = "fists" \| "bat" \| "knife" \| "pistol" \| "shotgun"/);
  assert.match(core, /startup: 0\.09/);
  assert.match(core, /state\.hitStop/);
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
  assert.match(game, /drawCustomizedHead/);
  assert.match(game, /SKIN_TONE_OPTIONS/);
  assert.match(game, /HAIR_STYLE_OPTIONS/);
  assert.match(core, /export type CharacterLook/);
  assert.match(core, /normalizeCharacterLook/);
  assert.match(game, /drawArenaAmbient/);
  assert.match(game, /drawDistrictMotion/);
  assert.match(game, /style-meter/);
  assert.match(core, /STREET FINISHER \+75/);
  assert.match(core, /const flowRush = state\.combo >= 8 \? 1\.35 : 1/);
  assert.match(game, /damageFlash/);
  assert.match(core, /state\.players\.some\(\(fighter\) => fighter\.connected && fighter\.hp > 0/);
  assert.match(core, /if \(enemy\.dead\) continue/);
  assert.match(core, /export const FIXED_STEP = 1 \/ 60/);
  assert.match(game, /const measureBaseScale = \(\) =>/);
  assert.match(game, /canvas\.getBoundingClientRect\(\)/);
  assert.match(game, /baseScale = measureBaseScale\(\)/);
  assert.match(core, /function chooseEnemyKind/);
  assert.match(core, /PERFECT DODGE/);
  assert.match(core, /player\.weapon\.kind === "shotgun"/);
  assert.match(core, /const minDot = Math\.cos/);
  assert.match(core, /kind: "tracer"/);
  assert.match(core, /MIN_WINDUPS/);
  assert.match(core, /solidEnemiesScratch\.length = 0/);
  assert.match(game, /function drawSimplifiedEnemy/);
  assert.match(game, /state\.audioEvents\.length = 0/);
  assert.doesNotMatch(game, /state\.audioEvents\.splice\(0\)/);
  assert.match(core, /export type CityId = "neon" \| "harbor" \| "blackout"/);
  assert.match(game, /Neon Ward/);
  assert.match(game, /Iron Harbor/);
  assert.match(game, /Blackout Heights/);
  assert.match(game, /STREET_HORIZON/);
  assert.match(game, /depthScaleForY/);
  assert.match(game, /createRenderTextures/);
  assert.match(game, /camo-clash-city/);
  assert.match(core, /pickupLock/);
  assert.match(core, /attackPressed/);
  assert.match(game, /INFECTED HORDE/);
  assert.match(game, /zombieFrame/);
  assert.match(core, /emitZombieSound/);
  assert.match(core, /EnemyKind = "thug" \| "runner" \| "brute" \| "thrower" \| "walker" \| "kitty" \| "kittyBoss"/);
  assert.match(core, /kind: enemy\.kind === "thrower" \? "thrown" : "labubu"/);
  assert.match(core, /emitGameCue\(state, "kittyHit"/);
  assert.match(game, /function drawKitty/);
  assert.match(game, /\/enemies\/evil-hello-kitty\.webp/);
  assert.match(game, /\/enemies\/dubai-chocolate-labubu\.webp/);
  assert.match(audio, /case "kittyHit"/);
  assert.match(core, /state\.wave === 5 && state\.waveSpawnCount === 0/);
  assert.match(core, /kittyBossPhaseForHealth/);
  assert.match(core, /"bossCuteVoice"/);
  assert.match(core, /"bossZombieVoice"/);
  assert.match(game, /function drawKittyBoss/);
  assert.match(game, /function drawKittyBossHud/);
  assert.match(game, /damage \* 3/);
  assert.match(game, /PINK PLAYTIME \/\/ BOSS/);
  assert.match(game, /hello-kitty-boss-zombie\.webp/);
  assert.match(audio, /SpeechSynthesisUtterance/);
  assert.match(audio, /Come here\.\.\. I only wanna play\./);
  assert.match(audio, /I said I wanna play!/);
  assert.match(core, /export function freshRun/);
  assert.match(core, /export function updateGame/);
  assert.doesNotMatch(core, /\b(?:window|document)\./, "shared simulation must stay browser-independent for the match server");
  assert.match(game, /SFX/);
  assert.match(css, /game-shell\.is-fighting/);
  assert.match(css, /rotate-notice/);
  assert.match(css, /image-rendering: pixelated/);
  assert.match(css, /177\.778svh/);
  assert.match(css, /any-pointer: coarse/);
  assert.match(css, /\.desktop-controls \{[^}]*z-index: 10;/);
  assert.match(css, /\.ability-button \{[^}]*z-index: 11;/);
  assert.match(css, /\.action-cluster \{ width: clamp\(164px, 50svh, 176px\); grid-template-columns: \.82fr \.9fr 1\.24fr;/);
  assert.match(css, /\.touch-attack \{ width: 100% !important; height: clamp\(62px, 20svh, 68px\) !important; \}/);
  assert.match(css, /city-picker/);
  assert.match(config, /combo control/);
  assert.match(config, /#63d8ff/);
  assert.match(css, /--acid: #d8ff3e/);
  assert.match(audio, /class ZombieAudio/);
  assert.match(audio, /createStereoPanner/);
  assert.match(audio, /playCue\(cue: GameCueId/);
  assert.match(audio, /waveClear/);
  assert.match(audio, /resetForRun/);
  assert.match(audio, /0\.96/);
  assert.match(css, /health-warning/);
  assert.match(css, /combo-pop/);
  assert.match(assets, /Creative Commons Zero/);
  assert.match(assets, /mutant-sheet-v2\.png/);
  assert.match(assets, /rpg-asset-character-zombie-nes/);
  assert.match(assets, /camo-city-v2\.webp/);
  assert.match(assets, /project-original AI-generated artwork/);
});

test("ships authoritative hosted two-player co-op with input-only clients", async () => {
  const [
    game,
    lobby,
    core,
    network,
    protocol,
    manager,
    server,
    security,
    integration,
    serverPackage,
    renderBlueprint,
    deployReadme,
    service,
    nginx,
    deploy,
    schema,
    css,
  ] = await Promise.all([
    readFile(new URL("../app/CamoClashGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CoopLobby.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/dedicated-coop-network.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/protocol.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/room-manager.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/security.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/test/integration.test.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/package.json", import.meta.url), "utf8"),
    readFile(new URL("../render.yaml", import.meta.url), "utf8"),
    readFile(new URL("../server/deploy/README.md", import.meta.url), "utf8"),
    readFile(new URL("../server/deploy/camo-clash-server.service.template", import.meta.url), "utf8"),
    readFile(new URL("../server/deploy/nginx-camo-clash.conf.template", import.meta.url), "utf8"),
    readFile(new URL("../server/deploy/deploy.sh", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(game, /CO-OP \/\/ INVITE/);
  assert.match(game, /from "\.\.\/lib\/dedicated-coop-network"/);
  assert.doesNotMatch(game, /from "\.\.\/lib\/coop-network"/);
  assert.doesNotMatch(game, /Jeddah|JEDDAH/, "host-specific region labels must not leak into the hosted UI");
  assert.match(core, /export type GameMode = "solo" \| "coop"/);
  assert.match(core, /budgetForWave\(1, mode\)/);
  assert.match(core, /state\.mode === "coop" \? 1\.2 : 1/);
  assert.match(game, /SQUAD SCORE/);
  assert.match(game, /if \(activeRole\) \{/);
  assert.match(game, /type: "input"/);
  assert.match(game, /if \(!activeRole && state\.pendingUpgrade\)/);
  assert.match(game, /smoothNetworkRenderState/);
  assert.match(game, /sendControl\(\{ type: "start", city: selectedCityRef\.current \}\)/);
  assert.match(game, /sendControl\(\{ type: "upgrade", upgradeId: upgrade\.id \}\)/);
  assert.match(game, /const receipt = result\.mode === "coop" \? coopReceiptRef\.current : ""/);
  assert.match(game, /\.\.\.\(receipt \? \{ receipt \} : \{\}\)/);
  assert.doesNotMatch(game, /sendState\(\{\s*type: "snapshot"/, "browsers must never upload authoritative snapshots");
  assert.doesNotMatch(game, /activeRole === "host"[\s\S]{0,240}updateGame/, "the room leader must not simulate co-op locally");
  assert.doesNotMatch(game, /freshRun\(\{ id: "host", \.\.\.host \}, \{ id: "guest"/, "the browser must wait for the server-owned run");

  assert.match(lobby, /PRIVATE INVITE/);
  assert.match(lobby, /START DUO RUN/);
  assert.doesNotMatch(lobby, /#room=/);

  assert.match(network, /COOP_PROTOCOL_VERSION = 2/);
  assert.match(network, /COOP_WEBSOCKET_PROTOCOL = "camo-clash\.v2"/);
  assert.match(network, /NEXT_PUBLIC_COOP_SERVER_URL/);
  assert.match(network, /ws:\/\/localhost:3002\/v2/);
  assert.match(network, /new WebSocket\(endpoint, COOP_WEBSOCKET_PROTOCOL\)/);
  assert.match(network, /wss:\/\/camo-clash-coop\.onrender\.com\/v2/);
  assert.match(network, /sentAt: Date\.now\(\)/);
  assert.match(network, /function isSafeTimestamp\(value: unknown\)/);
  assert.match(network, /isSafeTimestamp\(hostTime\)/);
  assert.match(network, /isSafeTimestamp\(guestTime\)/);
  assert.doesNotMatch(network, /isSafeCounter\(hostTime\)|isSafeCounter\(guestTime\)/, "epoch timestamps must not use the 32-bit counter validator");
  assert.match(network, /type: "resume"/);
  assert.match(network, /RECONNECT_DELAYS_MS/);
  const coldStartTimeout = network.match(/const COLD_START_WELCOME_TIMEOUT_MS = ([\d_]+);/);
  assert.ok(coldStartTimeout, "the client should define a cold-start welcome timeout");
  assert.ok(Number(coldStartTimeout[1].replaceAll("_", "")) >= 75_000, "free-host cold starts need at least 75 seconds");
  assert.match(network, /this\.welcomed \? ACTIVE_WELCOME_TIMEOUT_MS : COLD_START_WELCOME_TIMEOUT_MS/);
  assert.match(network, /socket\.bufferedAmount > HARD_BUFFER_LIMIT/);
  assert.match(network, /message\.seq <= this\.lastSnapshotSeq/);
  assert.match(network, /#coop=/);
  assert.match(network, /look: CharacterLook/);
  assert.match(protocol, /look: CharacterLook/);
  assert.match(manager, /look: room\.host\.identity\.look/);
  assert.doesNotMatch(network, /RTCPeerConnection|RTCDataChannel|stun:/);

  assert.match(protocol, /WS_SUBPROTOCOL = "camo-clash\.v2"/);
  assert.match(protocol, /MAX_CLIENT_MESSAGE_BYTES = 4 \* 1024/);
  assert.match(server, /url\.pathname !== "\/v2"/);
  assert.match(server, /originAllowed\(request\.headers\.origin, allowedOrigins\)/);
  assert.match(server, /Authentication timed out/);
  assert.match(server, /manager\.tick\(FIXED_STEP\)/);
  assert.match(server, /region: process\.env\.SERVER_REGION \|\| process\.env\.OCI_REGION \|\| "local"/);
  assert.match(manager, /updateGame\(room\.state, dt, EMPTY_KEYS, room\.host\.input, guest\.input\)/);
  assert.match(manager, /room\.inviteTokenHash = null/);
  assert.match(manager, /SNAPSHOT_EVERY_TICKS/);
  assert.match(manager, /INPUT_STALE_MS = 250/);
  assert.match(manager, /hostTime: room\.host\.lastInputSentAt/);
  assert.match(manager, /guestTime: room\.guest\?\.lastInputSentAt \?\? 0/);
  assert.match(manager, /signMatchReceipt\(this\.matchTicketSecret, receiptPayload\)/);
  assert.match(security, /createHmac\("sha256", secret\)/);
  assert.match(security, /timingSafeEqual/);
  assert.match(integration, /authoritative server owns room, start, inputs, and snapshots/);
  assert.match(integration, /rejects non-allowlisted browser origins/);
  assert.match(serverPackage, /"ws": "8\.21\.1"/);

  assert.match(renderBlueprint, /type: web/);
  assert.match(renderBlueprint, /runtime: node/);
  assert.match(renderBlueprint, /plan: free/);
  assert.match(renderBlueprint, /region: frankfurt/);
  assert.match(renderBlueprint, /buildCommand: npm ci --prefix server --include=dev && npm --prefix server run build/);
  assert.match(renderBlueprint, /startCommand: npm --prefix server start/);
  assert.match(renderBlueprint, /healthCheckPath: \/healthz/);
  assert.match(renderBlueprint, /- key: HOST\s+value: 0\.0\.0\.0/);
  assert.match(renderBlueprint, /- key: ALLOWED_ORIGINS\s+value: https:\/\/camo-clash-aestrawear\.aestrawear-camo-clash\.workers\.dev/);
  assert.match(renderBlueprint, /- key: MATCH_TICKET_SECRET\s+sync: false/);
  assert.match(renderBlueprint, /- key: SERVER_REGION\s+value: frankfurt/);

  assert.match(deployReadme, /OCI Jeddah \(`me-jeddah-1`\)/);
  assert.match(deployReadme, /127\.0\.0\.1:3002/);
  assert.match(deployReadme, /wss:\/\/<trusted-hostname>\/v2/);
  assert.match(service, /NoNewPrivileges=true/);
  assert.match(service, /ProtectSystem=strict/);
  assert.match(nginx, /location = \/v2/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3002/);
  assert.match(deploy, /sha256/);
  assert.match(deploy, /systemctl/);
  assert.match(schema, /coop_rooms/);
  assert.match(schema, /leaderboard_mode/);
  assert.match(css, /\.coop-backdrop/);
  assert.match(css, /\.partner-hud/);
});

test("ships co-op loadouts, recovery combat feedback, and frame-budget guards", async () => {
  const [game, lobby, core, network, protocol, manager, css] = await Promise.all([
    readFile(new URL("../app/CamoClashGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CoopLobby.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/dedicated-coop-network.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/protocol.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/room-manager.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(lobby, /function PantSelector/);
  assert.match(lobby, /aria-label="Choose your co-op pants"/);
  assert.match(lobby, /PANTS\.map/);
  assert.match(lobby, /onClick=\{\(\) => onChange\(item\.id\)\}/);
  assert.match(game, /sendControl\(\{ type: "pant", pantId \}\)/);
  assert.match(network, /selectPant\(pantId: PantId\)/);
  assert.match(protocol, /type: "pant"/);
  assert.match(manager, /player\.identity\.pantId = message\.pantId/);

  assert.match(core, /reviveProgress: number/);
  assert.match(core, /revive: boolean/);
  assert.match(core, /target\.reviveProgress = Math\.min\(1, target\.reviveProgress \+ dt \/ REVIVE_DURATION\)/);
  assert.match(network, /revive: this\.latestRevive/);
  assert.match(game, /function drawCoopIndicators/);
  assert.match(game, /ctx\.fillText\("YOU"/);
  assert.match(game, /keysRef\.current\.has\("f"\)/);
  assert.match(game, /className="touch-revive ready"/);
  assert.match(game, /aria-label="Hold to revive teammate"/);
  assert.match(game, /const downed = localPlayer\.hp <= 0 \? localPlayer/);
  assert.match(game, /const downedFighter = localPlayer\.hp <= 0 \? localPlayer/);
  assert.match(game, /onLostPointerCapture=\{releaseJoystick\}/);
  assert.match(game, /\{coopRole && hud\.reviveAvailable && \(/);
  assert.match(game, /\{coopRole && \(hud\.health <= 0 \|\| hud\.reviveAvailable \|\| hud\.reviveProgress > 0\) && \(/);

  assert.match(core, /export type MedkitPickup/);
  assert.match(core, /medkits: MedkitPickup\[\]/);
  assert.match(core, /export function dropMedkitAt/);
  assert.match(core, /rollMedkitDrop\(state, enemy\)/);
  assert.match(game, /function drawMedkit/);
  assert.match(game, /for \(const medkit of state\.medkits\)/);

  assert.match(core, /kind: "blood"/);
  assert.match(core, /seed: enemy\.id \* 17 \+ state\.kills \* 7/);
  assert.match(game, /function effectNoise\(seed: number, index: number\)/);
  assert.match(game, /effect\.kind === "blood"/);
  assert.match(game, /effectNoise\(seed, index\)/);
  assert.match(game, /effect\.life - lifeOffset/);
  assert.match(game, /renderState\.elapsed = smoothing\.visualElapsed/);
  assert.match(game, /renderState: GameState \| null/);
  assert.match(game, /smoothing\.roundTripMs \/ 2000 \+ snapshotAge/);
  assert.match(game, /authoritativePlayers: Map<FighterId/);
  assert.match(game, /smoothing\.snapshotReceivedAt = performance\.now\(\)/);
  assert.doesNotMatch(game, /const playerIds = new Set<FighterId>\(\)/);
  assert.doesNotMatch(game, /const enemyIds = new Set<number>\(\)/);

  assert.match(
    game,
    /if \(activeRole\) \{[\s\S]{0,1200}if \(accumulator < FIXED_STEP\) return;[\s\S]{0,160}accumulator %= FIXED_STEP;/,
    "co-op rendering should be gated to the fixed-step cadence instead of redrawing duplicate snapshots",
  );
  assert.match(
    game,
    /const detailBudget = severePressure \? \(mobileProfile \? 6 : 8\) : lowDetail \? \(mobileProfile \? 9 : 12\) : mobileProfile \? 10 : 14;/,
    "desktop rendering should cap fully detailed non-walker enemies",
  );
  assert.match(
    css,
    /\.game-shell\.is-fighting \.hud-player \{[^}]*backdrop-filter: none;/,
    "the fighting HUD should avoid expensive live backdrop blur",
  );
});
