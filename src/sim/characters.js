/**
 * Classic playable QQ Tang (QQ堂) character profiles, roster assignment,
 * player entity initialization, and stat/pickup application logic.
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

import {
  BUN_CARRY_SPEED_MULT,
  CHARACTER_IDS,
  CHARACTER_METADATA,
  ITEM_TYPES,
  MAX_NEEDLES,
  MODE_IDS,
  PLAYER_STATES,
  SPEED_STEP_PER_PICKUP,
  TRAPPED_SPEED_MULT,
  TURTLE_BASE_SPEED,
  TURTLE_BOOST_THRESHOLD,
  TURTLE_BOOSTED_SPEED,
  UFO_HOVER_SPEED,
  normalizeItemType,
} from '../contracts/constants.js';

export const CHARACTERS = CHARACTER_METADATA;

/**
 * Resolves a valid character profile, falling back to 'miduo'.
 * @param {string} characterId
 */
export function getCharacterProfile(characterId) {
  if (characterId && Object.prototype.hasOwnProperty.call(CHARACTERS, characterId)) {
    return CHARACTERS[characterId];
  }
  return CHARACTERS.miduo;
}

/**
 * Builds the 4-character match roster (P1 + Ally/Co-op + Rivals/Co-op)
 * ensuring all 4 classic characters appear with distinct silhouettes when possible.
 *
 * @param {object} options
 * @returns {Array<{id: string, characterId: string, team: 0|1, isHuman: boolean}>}
 */
export function buildMatchRoster({
  modeId = 'classic_2v2',
  p1CharacterId = 'miduo',
  p2CharacterId = null,
  p2Enabled = false,
} = {}) {
  const p1Char = getCharacterProfile(p1CharacterId).id;
  const remaining = CHARACTER_IDS.filter((cid) => cid !== p1Char);

  // Pair speed tiers fairly by default (miduo 5.0 <-> haiwangzi 5.2 = 10.2; xiaoqiang 4.8 <-> wanzi 5.5 = 10.3)
  // so Blue and Red have balanced foot speed across all 4 P1 character selections while keeping all 4 cast members on field!
  const balancedPartnerByChar = {
    miduo: 'haiwangzi',
    haiwangzi: 'miduo',
    xiaoqiang: 'wanzi',
    wanzi: 'xiaoqiang',
  };

  let p2Char = p2CharacterId ? getCharacterProfile(p2CharacterId).id : null;
  if (!p2Char || (p2Char === p1Char && remaining.length > 0)) {
    p2Char = balancedPartnerByChar[p1Char] || remaining[0];
  }
  const poolAfterSecond = CHARACTER_IDS.filter((cid) => cid !== p1Char && cid !== p2Char);
  const thirdChar = poolAfterSecond[0] || remaining[1] || 'haiwangzi';
  const fourthChar = poolAfterSecond[1] || remaining[2] || 'wanzi';

  const isCoopBoss = modeId === MODE_IDS[2] || modeId === 'boss_golem';

  return [
    {
      id: 'p1',
      characterId: p1Char,
      team: 0,
      isHuman: true,
    },
    {
      id: p2Enabled ? 'p2' : 'bot1',
      characterId: p2Char,
      team: 0,
      isHuman: Boolean(p2Enabled),
    },
    {
      id: 'bot2',
      characterId: thirdChar,
      team: isCoopBoss ? 0 : 1,
      isHuman: false,
    },
    {
      id: 'bot3',
      characterId: fourthChar,
      team: isCoopBoss ? 0 : 1,
      isHuman: false,
    },
  ];
}

/**
 * Computes effective movement speed (in tiles/s) for a player given state, mount, and bun weight.
 * @param {object} player
 * @returns {number}
 */
export function computeEffectiveSpeed(player) {
  if (player.state === PLAYER_STATES.ELIMINATED) {
    return 0;
  }
  if (player.state === PLAYER_STATES.TRAPPED) {
    return +(player.baseSpeed * TRAPPED_SPEED_MULT).toFixed(4);
  }
  let speed = player.baseSpeed;
  if (player.mount === ITEM_TYPES.UFO) {
    // UFO hover ignores carry slowdown (F20)
    return UFO_HOVER_SPEED;
  }
  if (player.mount === ITEM_TYPES.TURTLE) {
    speed = player.speedUps >= TURTLE_BOOST_THRESHOLD ? TURTLE_BOOSTED_SPEED : TURTLE_BASE_SPEED;
  }
  if (player.carryingBun) {
    speed *= BUN_CARRY_SPEED_MULT;
  }
  return +speed.toFixed(4);
}

/**
 * Creates a fresh simulation player entity at a spawn pad.
 * @param {object} slot
 * @param {{col: number, row: number, x?: number, z?: number}} spawn
 * @param {boolean} autoPlayP1
 * @returns {object}
 */
export function createPlayerEntity(slot, spawn, autoPlayP1 = false) {
  const profile = getCharacterProfile(slot.characterId);
  const col = Math.max(0, Math.min(14, Math.floor(spawn.col)));
  const row = Math.max(0, Math.min(12, Math.floor(spawn.row)));
  const x = typeof spawn.x === 'number' ? spawn.x : col + 0.5;
  const z = typeof spawn.z === 'number' ? spawn.z : row + 0.5;

  const player = {
    id: slot.id,
    characterId: profile.id,
    nameZh: profile.nameZh,
    team: slot.team,
    isHuman: slot.isHuman,
    isBotControlled: !slot.isHuman || (slot.id === 'p1' && Boolean(autoPlayP1)),
    state: PLAYER_STATES.ALIVE,
    x,
    z,
    col: Math.max(0, Math.min(14, Math.floor(x))),
    row: Math.max(0, Math.min(12, Math.floor(z))),
    spawnCol: col,
    spawnRow: row,
    facingRad: slot.team === 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
    isMoving: false,
    maxBubbles: profile.startBubbles,
    activeBubbles: 0,
    blastRange: profile.startPower,
    baseSpeed: profile.startSpeed,
    effectiveSpeed: profile.startSpeed,
    speedUps: 0,
    canKick: false,
    needles: 0,
    hasShield: false,
    mount: null,
    carryingBun: false,
    carriedBuns: 0,
    bunPickupLockSec: 0,
    trapTimer: 0,
    trappedBy: null,
    invulnTimer: 0,
    respawnTimer: 0,
    stats: {
      kos: 0,
      rescues: 0,
      blocksBroken: 0,
      bunsBanked: 0,
      distanceMoved: 0,
      bubblesPlaced: 0,
    },
  };
  player.effectiveSpeed = computeEffectiveSpeed(player);
  return player;
}

/**
 * Applies optional startingLoadout overrides cleanly while clamping to valid bounds.
 * @param {object} player
 * @param {object} loadout
 */
export function applyStartingLoadout(player, loadout) {
  if (!loadout || typeof loadout !== 'object') return;
  const profile = getCharacterProfile(player.characterId);

  if (typeof loadout.maxBubbles === 'number') {
    player.maxBubbles = Math.max(1, Math.min(profile.maxBubblesCap, Math.floor(loadout.maxBubbles)));
  }
  if (typeof loadout.blastRange === 'number') {
    player.blastRange = Math.max(1, Math.min(profile.maxPowerCap, Math.floor(loadout.blastRange)));
  }
  if (typeof loadout.speedUps === 'number') {
    player.speedUps = Math.max(0, Math.floor(loadout.speedUps));
    player.baseSpeed = Math.min(
      profile.maxSpeedCap,
      +(profile.startSpeed + player.speedUps * SPEED_STEP_PER_PICKUP).toFixed(4)
    );
  }
  if (typeof loadout.baseSpeed === 'number') {
    player.baseSpeed = Math.max(2.0, Math.min(profile.maxSpeedCap, loadout.baseSpeed));
  }
  if (typeof loadout.canKick === 'boolean') {
    player.canKick = loadout.canKick;
  }
  if (typeof loadout.needles === 'number') {
    player.needles = Math.max(0, Math.min(MAX_NEEDLES, Math.floor(loadout.needles)));
  }
  if (typeof loadout.hasShield === 'boolean') {
    player.hasShield = loadout.hasShield;
  }
  if (loadout.mount !== undefined) {
    const normMount = loadout.mount ? normalizeItemType(loadout.mount) : null;
    player.mount =
      normMount === ITEM_TYPES.TURTLE || normMount === ITEM_TYPES.UFO ? normMount : null;
  }
  player.effectiveSpeed = computeEffectiveSpeed(player);
}

/**
 * Applies a collected pickup or mount to an 'alive' player.
 * Returns { previousMount } so physics can clear any soft block if dismounting UFO.
 *
 * @param {object} player
 * @param {string} rawItemType
 * @returns {{appliedType: string|null, previousMount: string|null}}
 */
export function applyPickupToPlayer(player, rawItemType) {
  const type = normalizeItemType(rawItemType);
  if (!type || player.state !== PLAYER_STATES.ALIVE) {
    return { appliedType: null, previousMount: null };
  }
  const profile = getCharacterProfile(player.characterId);
  const previousMount = player.mount;

  switch (type) {
    case ITEM_TYPES.BUBBLE:
      player.maxBubbles = Math.min(profile.maxBubblesCap, player.maxBubbles + 1);
      break;
    case ITEM_TYPES.POWER:
      player.blastRange = Math.min(profile.maxPowerCap, player.blastRange + 1);
      break;
    case ITEM_TYPES.SPEED:
      player.speedUps += 1;
      player.baseSpeed = Math.min(
        profile.maxSpeedCap,
        +(player.baseSpeed + SPEED_STEP_PER_PICKUP).toFixed(4)
      );
      break;
    case ITEM_TYPES.KICK:
      player.canKick = true;
      break;
    case ITEM_TYPES.NEEDLE:
      player.needles = Math.min(MAX_NEEDLES, player.needles + 1);
      break;
    case ITEM_TYPES.SHIELD:
      player.hasShield = true;
      break;
    case ITEM_TYPES.TURTLE:
      player.mount = ITEM_TYPES.TURTLE;
      break;
    case ITEM_TYPES.UFO:
      player.mount = ITEM_TYPES.UFO;
      break;
    default:
      return { appliedType: null, previousMount: null };
  }

  player.effectiveSpeed = computeEffectiveSpeed(player);
  return { appliedType: type, previousMount };
}
