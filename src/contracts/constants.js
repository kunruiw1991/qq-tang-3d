/**
 * Canonical shared constants, enums, stat/metadata tables, and DOM test selectors
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

export const FIXED_DT = 1 / 60;
export const MAX_ACCUMULATOR_SEC = 0.1;

export const GRID_COLS = 15;
export const GRID_ROWS = 13;
export const TILE_SIZE = 1.0;

export const PLAYER_RADIUS = 0.36;
export const BLAST_HURT_HALF_EXTENT = 0.72; // |pos - tileCenter| < 0.72 hits on tile, prevents adjacent-lane sniping
export const PLAYER_CONTACT_DIST = 0.76;    // Circle-to-circle touch distance for rescue / pop
export const PICKUP_COLLECT_DIST = 0.62;

export const TILE_TYPE = Object.freeze({
  EMPTY: 0,
  HARD_WALL: 1,
  SOFT_BLOCK: 2,
  BUN_SHRINE: 3,
  TEAM_BASE_BLUE: 4,
  TEAM_BASE_RED: 5,
});

export const CHARACTER_IDS = Object.freeze([
  'miduo',
  'xiaoqiang',
  'haiwangzi',
  'wanzi',
]);

export const ARENA_IDS = Object.freeze([
  'candy_town',
  'pirate_bay',
  'ice_village',
  'toy_kingdom',
]);

export const MODE_IDS = Object.freeze([
  'classic_2v2',
  'bun_grab',
  'boss_golem',
]);

export const ITEM_TYPES = Object.freeze({
  BUBBLE: 'bubble',   // +1 maxBubbles
  POWER: 'power',     // +1 blastRange
  SPEED: 'speed',     // +0.45 baseSpeed
  KICK: 'kick',       // canKick = true (slide stationary solid bubbles at 10.0 tiles/s)
  NEEDLE: 'needle',   // +1 needles (cap 3; self-rescue when state === 'trapped')
  SHIELD: 'shield',   // hasShield = true (absorbs 1 blast + 1.1s invuln)
  TURTLE: 'turtle',   // mount = 'turtle' (3.6 tiles/s steady or 6.2 boosted; absorbs 1 blast -> mount = null + 1.1s invuln)
  UFO: 'ufo',         // mount = 'ufo' (6.6 tiles/s hover, ignores carry slow, glides over SOFT_BLOCK; absorbs 1 blast -> mount = null + 1.1s invuln)
});

export const PLAYER_STATES = Object.freeze({
  ALIVE: 'alive',
  TRAPPED: 'trapped',
  ELIMINATED: 'eliminated',
});

export const MATCH_PHASES = Object.freeze({
  PLAYING: 'playing',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  DRAW: 'draw',
});

export const SCREEN_IDS = Object.freeze({
  TITLE: 'title',
  SELECT: 'select',
  PLAYING: 'playing',
  PAUSED: 'paused',
  PODIUM: 'podium',
});

export const EVENT_TYPES = Object.freeze({
  BUBBLE_DROP: 'bubble_drop',
  KICK_SLIDE: 'kick_slide',
  EXPLODE: 'explode',
  CHAIN_EXPLODE: 'chain_explode',
  BLOCK_BREAK: 'block_break',
  TRAP: 'trap',
  RESCUE: 'rescue',
  NEEDLE_RESCUE: 'needle_rescue',
  POP: 'pop',
  SHIELD_BREAK: 'shield_break',
  MOUNT_RIDE: 'mount_ride',
  MOUNT_BREAK: 'mount_break',
  PICKUP: 'pickup',
  BUN_PICKUP: 'bun_pickup',
  BUN_DROP: 'bun_drop',
  BUN_SCORE: 'bun_score',
  BOSS_TELEGRAPH: 'boss_telegraph',
  BOSS_ATTACK: 'boss_attack',
  BOSS_HIT: 'boss_hit',
  BOSS_DEFEAT: 'boss_defeat',
  CANDY_RAIN_WARNING: 'candy_rain_warning',
  CANDY_RAIN_DROP: 'candy_rain_drop',
  MATCH_END: 'match_end',
});

// Core combat & lifecycle timings
export const BUBBLE_FUSE_SEC = 2.6;
export const BLAST_LINGER_SEC = 0.45;
export const TRAP_DURATION_SEC = 5.5;
export const DISMOUNT_INVULN_SEC = 1.1; // Strictly > BLAST_LINGER_SEC so mount/shield sacrifice never traps rider on next tick!
export const RESCUE_INVULN_SEC = 1.5;
export const RESPAWN_INVULN_SEC = 2.0;
export const PICKUP_SPAWN_GRACE_SEC = 0.55; // Strictly > BLAST_LINGER_SEC so revealing blast never vaporizes its own drop!
export const HIT_STOP_TRAP_SEC = 0.07;
export const HIT_STOP_KO_SEC = 0.11;
export const COUNTDOWN_TOTAL_SEC = 1.5;
export const P1_MARKER_DURATION_SEC = 5.0;
export const CANDY_RAIN_WARNING_LEAD_SEC = 1.0;

// Movement & item parameters
export const SPEED_STEP_PER_PICKUP = 0.45;
export const KICK_SLIDE_SPEED = 10.0;
export const TRAPPED_SPEED_MULT = 0.22;
export const BUN_CARRY_SPEED_MULT = 0.75;
export const MAX_NEEDLES = 3;
export const TURTLE_BASE_SPEED = 3.6;
export const TURTLE_BOOSTED_SPEED = 6.2;
export const TURTLE_BOOST_THRESHOLD = 3;
export const UFO_HOVER_SPEED = 6.6;
export const SOFT_BLOCK_DROP_RATE = 0.52;

// Mode & Boss parameters
export const MATCH_DURATION_SEC = 120;
export const OVERTIME_DURATION_SEC = 20;
export const CLASSIC_TEAM_LIVES = 3;
export const CLASSIC_RESPAWN_SEC = 2.5;
export const SUDDEN_DEATH_START_SEC = 30;
export const CANDY_RAIN_INTERVAL_SEC = 0.5;
export const BUN_WIN_SCORE = 5;
export const ACTIVE_BUN_TARGET = 1;
export const BUN_DROP_LOCK_SEC = 0.60;
export const BUN_RESPAWN_DELAY_SEC = 2.6;
export const PLAYER_RESPAWN_SEC = 3.5;
export const BOSS_PLAYER_RESPAWN_SEC = 4.0;
export const BOSS_MAX_HP = 24;
export const BOSS_PHASE2_HP = 12;
export const BOSS_HUMAN_HIT_DAMAGE = 2;
export const BOSS_BOT_HIT_DAMAGE = 1;
export const BOSS_HIT_INVULN_SEC = 0.45;
export const BOSS_TELEGRAPH_SEC = 1.0;
export const BOSS_SHARED_LIVES = 4;

export const CARDINAL_DIRS = Object.freeze([
  Object.freeze({ name: 'north', dc: 0, dr: -1 }),
  Object.freeze({ name: 'south', dc: 0, dr: 1 }),
  Object.freeze({ name: 'west', dc: -1, dr: 0 }),
  Object.freeze({ name: 'east', dc: 1, dr: 0 }),
]);

// Weighted loot table for broken SOFT_BLOCK drops
export const ITEM_METADATA = Object.freeze({
  [ITEM_TYPES.BUBBLE]: Object.freeze({
    id: ITEM_TYPES.BUBBLE,
    nameZh: '糖泡',
    nameEn: 'Sugar Bubble',
    colorHex: '#38BDF8',
    accentHex: '#FF6B9D',
    dropWeight: 24,
  }),
  [ITEM_TYPES.POWER]: Object.freeze({
    id: ITEM_TYPES.POWER,
    nameZh: '威力糖浆',
    nameEn: 'Power Syrup',
    colorHex: '#FF9F1C',
    accentHex: '#FFE66D',
    dropWeight: 24,
  }),
  [ITEM_TYPES.SPEED]: Object.freeze({
    id: ITEM_TYPES.SPEED,
    nameZh: '溜冰鞋',
    nameEn: 'Roller Skates',
    colorHex: '#4CC9F0',
    accentHex: '#FFFFFF',
    dropWeight: 20,
  }),
  [ITEM_TYPES.KICK]: Object.freeze({
    id: ITEM_TYPES.KICK,
    nameZh: '踢泡靴',
    nameEn: 'Kick Boot',
    colorHex: '#EF476F',
    accentHex: '#FFD166',
    dropWeight: 10,
  }),
  [ITEM_TYPES.NEEDLE]: Object.freeze({
    id: ITEM_TYPES.NEEDLE,
    nameZh: '救命针',
    nameEn: 'Rescue Needle',
    colorHex: '#FFD166',
    accentHex: '#FF5D8F',
    dropWeight: 8,
  }),
  [ITEM_TYPES.SHIELD]: Object.freeze({
    id: ITEM_TYPES.SHIELD,
    nameZh: '护盾',
    nameEn: 'Candy Shield',
    colorHex: '#FACC15',
    accentHex: '#FEF08A',
    dropWeight: 6,
  }),
  [ITEM_TYPES.TURTLE]: Object.freeze({
    id: ITEM_TYPES.TURTLE,
    nameZh: '乌龟',
    nameEn: 'Turtle Mount',
    colorHex: '#10B981',
    accentHex: '#FBBF24',
    dropWeight: 4,
  }),
  [ITEM_TYPES.UFO]: Object.freeze({
    id: ITEM_TYPES.UFO,
    nameZh: '飞碟',
    nameEn: 'UFO Mount',
    colorHex: '#A855F7',
    accentHex: '#22D3EE',
    dropWeight: 4,
  }),
});

export const CHARACTER_METADATA = Object.freeze({
  miduo: Object.freeze({
    id: 'miduo',
    nameZh: '米多',
    nameEn: 'MiDuo',
    traitZh: '全能甜心',
    primaryHex: '#FF5E99',
    secondaryHex: '#FFF7FA',
    accentHex: '#E63956',
    startBubbles: 1,
    maxBubblesCap: 7,
    startPower: 2,
    maxPowerCap: 7,
    startSpeed: 5.0,
    maxSpeedCap: 7.5,
  }),
  xiaoqiang: Object.freeze({
    id: 'xiaoqiang',
    nameZh: '小强',
    nameEn: 'XiaoQiang',
    traitZh: '连泡达人',
    primaryHex: '#2D7FF9',
    secondaryHex: '#FFD13B',
    accentHex: '#EF4444',
    startBubbles: 2,
    maxBubblesCap: 8,
    startPower: 1,
    maxPowerCap: 6,
    startSpeed: 4.8,
    maxSpeedCap: 7.2,
  }),
  haiwangzi: Object.freeze({
    id: 'haiwangzi',
    nameZh: '海王子',
    nameEn: 'HaiWangZi',
    traitZh: '深海威力',
    primaryHex: '#1B3B8B',
    secondaryHex: '#38D9FF',
    accentHex: '#FBBF24',
    startBubbles: 1,
    maxBubblesCap: 6,
    startPower: 2,
    maxPowerCap: 8,
    startSpeed: 5.2,
    maxSpeedCap: 7.6,
  }),
  wanzi: Object.freeze({
    id: 'wanzi',
    nameZh: '丸子',
    nameEn: 'WanZi',
    traitZh: '疾风冲刺',
    primaryHex: '#FFB830',
    secondaryHex: '#3CCF91',
    accentHex: '#FF758F',
    startBubbles: 1,
    maxBubblesCap: 6,
    startPower: 1,
    maxPowerCap: 6,
    startSpeed: 5.5,
    maxSpeedCap: 8.0,
  }),
});

export const ARENA_METADATA = Object.freeze({
  candy_town: Object.freeze({
    id: 'candy_town',
    nameZh: '糖果镇',
    nameEn: 'Candy Town',
    floorHexA: '#FFF1F6',
    floorHexB: '#FFE0EC',
    wallHex: '#FF7AA2',
    softHex: '#FBBF24',
    skyHex: '#FFEAF2',
    bgmTrack: 'candy_town',
  }),
  pirate_bay: Object.freeze({
    id: 'pirate_bay',
    nameZh: '海盗船',
    nameEn: 'Pirate Bay',
    floorHexA: '#D9A066',
    floorHexB: '#C2874E',
    wallHex: '#374151',
    softHex: '#B45309',
    skyHex: '#BAE6FD',
    bgmTrack: 'pirate_bay',
  }),
  ice_village: Object.freeze({
    id: 'ice_village',
    nameZh: '冰雪村',
    nameEn: 'Ice & Snow Village',
    floorHexA: '#F0F9FF',
    floorHexB: '#CFEBFD',
    wallHex: '#38BDF8',
    softHex: '#93C5FD',
    skyHex: '#E0F2FE',
    bgmTrack: 'ice_village',
  }),
  toy_kingdom: Object.freeze({
    id: 'toy_kingdom',
    nameZh: '积木城',
    nameEn: 'Toy Block Kingdom',
    floorHexA: '#FEF9C3',
    floorHexB: '#FDE68A',
    wallHex: '#EF4444',
    softHex: '#3B82F6',
    skyHex: '#FEF3C7',
    bgmTrack: 'toy_kingdom',
  }),
});

export const MODE_METADATA = Object.freeze({
  classic_2v2: Object.freeze({
    id: 'classic_2v2',
    nameZh: '经典对战',
    nameEn: 'Classic 2v2 Arena',
    accentHex: '#3B82F6',
  }),
  bun_grab: Object.freeze({
    id: 'bun_grab',
    nameZh: '抢包山',
    nameEn: 'Bun Mountain Grab',
    accentHex: '#F59E0B',
  }),
  boss_golem: Object.freeze({
    id: 'boss_golem',
    nameZh: '机械傀儡',
    nameEn: 'Co-op Boss Golem',
    accentHex: '#EF4444',
  }),
});

// Mandatory DOM data-testid contract from PROJECT.md § 3
export const TEST_IDS = Object.freeze({
  ARENA_CANVAS: 'arena-canvas',
  BTN_PLAY: 'btn-play',
  BTN_QUICK_START: 'btn-quick-start',
  CHAR_CARDS: Object.freeze({
    miduo: 'char-card-miduo',
    xiaoqiang: 'char-card-xiaoqiang',
    haiwangzi: 'char-card-haiwangzi',
    wanzi: 'char-card-wanzi',
  }),
  ARENA_CARDS: Object.freeze({
    candy_town: 'arena-card-candy_town',
    pirate_bay: 'arena-card-pirate_bay',
    ice_village: 'arena-card-ice_village',
    toy_kingdom: 'arena-card-toy_kingdom',
  }),
  MODE_CARDS: Object.freeze({
    classic_2v2: 'mode-card-classic_2v2',
    bun_grab: 'mode-card-bun_grab',
    boss_golem: 'mode-card-boss_golem',
  }),
  BTN_TOGGLE_2P: 'btn-toggle-2p',
  BTN_TOGGLE_DIFFICULTY: 'btn-toggle-difficulty',
  BTN_START_MATCH: 'btn-start-match',
  HUD_BTN_HOME: 'hud-btn-home',
  HUD_BTN_AUDIO: 'hud-btn-audio',
  HUD_JOYSTICK: 'hud-joystick',
  HUD_BTN_ITEM: 'hud-btn-item',
  HUD_BTN_BUBBLE: 'hud-btn-bubble',
  HUD_P1_MARKER: 'hud-p1-marker',
  HUD_TRAPPED_HINT: 'hud-trapped-hint',
  HUD_TRAPPED_RING: 'hud-trapped-ring',
  HUD_CANDY_RAIN_STAMP: 'hud-candy-rain-stamp',
  BTN_RESUME: 'btn-resume',
  BTN_RESTART: 'btn-restart',
  BTN_QUIT_SELECT: 'btn-quit-select',
  PODIUM_OVERLAY: 'podium-overlay',
  BTN_PLAY_AGAIN: 'btn-play-again',
  BTN_BACK_SELECT: 'btn-back-select',
});

// Pure coordinate conversion helpers between continuous tile-space [0..15]x[0..13] and centered 3D world-space
export function tileToWorldX(tileX) {
  return (tileX - GRID_COLS * 0.5) * TILE_SIZE;
}

export function tileToWorldZ(tileZ) {
  return (tileZ - GRID_ROWS * 0.5) * TILE_SIZE;
}

export function colToWorldX(col) {
  return (col + 0.5 - GRID_COLS * 0.5) * TILE_SIZE;
}

export function rowToWorldZ(row) {
  return (row + 0.5 - GRID_ROWS * 0.5) * TILE_SIZE;
}

const ITEM_ALIAS_MAP = Object.freeze({
  bubble: ITEM_TYPES.BUBBLE,
  bubble_up: ITEM_TYPES.BUBBLE,
  sugar_bubble: ITEM_TYPES.BUBBLE,
  power: ITEM_TYPES.POWER,
  power_up: ITEM_TYPES.POWER,
  syrup: ITEM_TYPES.POWER,
  speed: ITEM_TYPES.SPEED,
  speed_up: ITEM_TYPES.SPEED,
  skates: ITEM_TYPES.SPEED,
  kick: ITEM_TYPES.KICK,
  push: ITEM_TYPES.KICK,
  needle: ITEM_TYPES.NEEDLE,
  shield: ITEM_TYPES.SHIELD,
  turtle: ITEM_TYPES.TURTLE,
  mount_turtle: ITEM_TYPES.TURTLE,
  ufo: ITEM_TYPES.UFO,
  mount_ufo: ITEM_TYPES.UFO,
});

export function normalizeItemType(rawType) {
  if (!rawType) return null;
  const key = String(rawType).toLowerCase();
  return ITEM_ALIAS_MAP[key] || null;
}
