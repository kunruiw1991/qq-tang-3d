/**
 * Seedable deterministic Mulberry32 PRNG for reproducible simulation,
 * soft-block loot rolls, Boss attack selection, and AI tie-breaking.
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

export class Mulberry32 {
  /**
   * @param {number} seed - Initial 32-bit integer seed.
   */
  constructor(seed = 12345) {
    this.initialSeed = (Number(seed) || 12345) >>> 0;
    if (this.initialSeed === 0) {
      this.initialSeed = 0x6d2b79f5;
    }
    this.state = this.initialSeed;
  }

  /**
   * Returns a deterministic float in [0, 1).
   * @returns {number}
   */
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a deterministic float in [min, max).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  rangeFloat(min, max) {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a deterministic integer in [min, max] inclusive.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  rangeInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /**
   * Returns true with probability p in [0, 1].
   * @param {number} p
   * @returns {boolean}
   */
  chance(p) {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  /**
   * Picks a random element from a non-empty array.
   * @template T
   * @param {readonly T[]} list
   * @returns {T}
   */
  pick(list) {
    if (!list || list.length === 0) {
      throw new Error('Mulberry32.pick called on empty list');
    }
    return list[Math.floor(this.next() * list.length)];
  }

  /**
   * Picks an item using non-negative numeric weights.
   * @template T
   * @param {readonly T[]} items
   * @param {function(T): number} weightFn
   * @returns {T}
   */
  pickWeighted(items, weightFn) {
    let total = 0;
    for (let i = 0; i < items.length; i += 1) {
      total += Math.max(0, weightFn(items[i]));
    }
    if (total <= 0) {
      return this.pick(items);
    }
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i += 1) {
      const w = Math.max(0, weightFn(items[i]));
      if (roll < w) {
        return items[i];
      }
      roll -= w;
    }
    return items[items.length - 1];
  }

  /**
   * Returns a new shuffled shallow copy using Fisher-Yates.
   * @template T
   * @param {readonly T[]} list
   * @returns {T[]}
   */
  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}

export function createPRNG(seed = 12345) {
  return new Mulberry32(seed);
}
