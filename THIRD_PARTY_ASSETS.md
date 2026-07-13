# Third-Party Assets

This file records the external artwork used by Camo Clash. The source pages were
reviewed on 2026-07-13. The game uses local, optimized derivatives and selected
subsets rather than hotlinking the original downloads.

## Asset sources

### Yopta City Parallax

- Creator: Frontend Pashtet
- Source: <https://drxwat.itch.io/city-parallax>
- License: Creative Commons Zero (CC0). The source page permits use and
  modification, including in commercial projects.
- Local derivatives: `public/pixel/city/`
  - `layer_1_ground.png`
  - `layer_2_stars.png`
  - `layer_3_moon.png`
  - `layer_4_clouds_1.png`
  - `layer_5_clouds_2.png`
  - `layer_6_far_buildings.png`
  - `layer_7_bg_buildings.png`
  - `layer_8_fg_buildings.png`
  - `layer_9_wall.png`
- Changes: the nine selected parallax layers are precomposed and color-graded at
  runtime for the game's night-street palette.

### Industrial Punk tileset

- Creator: Goncalo M. C. Oliveira
- Source: <https://goncalomcoliveira.itch.io/industrial-punk>
- License: Creative Commons Zero 1.0 Universal (CC0). Attribution is optional.
- Local derivative: `public/pixel/industrial-tileset.png`
- Changes: the selected tilesheet is color-graded with the environment layers.

### 1-bit Pixel Icons

- Creator: Nikoichu
- Source: <https://nikoichu.itch.io/pixel-icons>
- License: Creative Commons Zero 1.0 Universal (CC0). Attribution is optional.
- Local derivatives: selected icons under `public/pixel/icons/`, currently
  `ammo.png`, `bat.png`, `dash.png`, `fist.png`, `knife.png`, `pause.png`,
  `pistol.png`, `reload.png`, `shells.png`, and `shotgun.png`.
- Changes: only the icons needed by the game were selected; they remain in the
  high-contrast interface palette.

### Animated Monsters — zombie

- Creator: Stealthix
- Source: <https://opengameart.org/content/animated-monsters>
- License: Creative Commons Zero 1.0 Universal (CC0). Attribution is optional.
- Local derivative: `public/zombies/walker-sheet.png`.
- Changes: only the 40-frame zombie sheet was selected. The game maps its fall,
  hurt, idle, punch, and walk sequences to Camo Clash enemy states.

### Zombie Sprite

- Creator: Stoner Games
- Source: <https://lpc.opengameart.org/content/zombie-sprite>
- License: Creative Commons Zero 1.0 Universal (CC0). Attribution is optional.
- Local derivative: `public/zombies/mutant-sheet.png`.
- Changes: the twelve-frame strip is used as a rarer mutant/elite zombie model.

### RPG Asset Character "Zombie" NES

- Creator: Chasersgaming
- Source: <https://opengameart.org/content/rpg-asset-character-zombie-nes>
- License: Creative Commons Zero 1.0 Universal (CC0) / Public Domain. The
  source permits unrestricted use and does not require attribution.
- Local derivative: `public/zombies/mutant-sheet-v2.png`.
- Changes: selected side-facing frames were repacked into a compact 17-frame
  horizontal sheet with 24 by 32 pixel cells. The game maps its idle, walk,
  attack, hurt, and death sequences to the mutant enemy states and mirrors the
  sheet at runtime when the enemy changes direction.

### Zombie Noises and Moans

- Creator: ianzazz
- Source: <https://opengameart.org/content/zombie-noises-and-moans>
- License: Creative Commons Zero 1.0 Universal (CC0). Attribution is optional.
- Local derivatives: `public/audio/zombie-attack.ogg`,
  `zombie-groan-1.ogg`, `zombie-groan-2.ogg`, and `zombie-death.ogg`.
- Changes: files were renamed by gameplay purpose and are decoded locally by
  the game's bounded Web Audio sound system.

## Project-created assets

### Camo City v2

- Origin: project-original AI-generated artwork created for Camo Clash; it is
  not a downloaded third-party asset.
- Local asset: `public/pixel/city/camo-city-v2.webp`.
- Changes: the 1280 by 720 city scene is stored as an optimized WebP for the
  game's colored street-fight backdrop.

## Distribution note

The files under `public/pixel/`, `public/zombies/`, and `public/audio/` are
game-ready derivatives and selected subsets.
They are included for use by Camo Clash, not as a replacement download for the
original asset packs. Refer to each source page for its current license text and
original download.
