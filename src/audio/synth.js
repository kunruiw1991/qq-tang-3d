/**
 * Nostalgic Procedural WebAudio BGM Sequencer & Arcade SFX Synthesizer
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Pure ES2022 module using relative imports only.
 * Safe pre-gesture & headless Chrome execution (zero unhandled promise rejections).
 */

import { EVENT_TYPES } from '../contracts/constants.js';

// MIDI note to frequency helper (A4 = 69 -> 440 Hz)
function midiToFreq(midi) {
  if (!midi || midi <= 0) return 0;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 7 distinct nostalgic arcade step-sequencer patterns (16 steps per bar)
const TRACK_PATTERNS = Object.freeze({
  menu: {
    bpm: 132,
    leadWave: 'triangle',
    bassWave: 'sine',
    leadGain: 0.13,
    bassGain: 0.11,
    hats: true,
    lead: [72, 76, 79, 84, 81, 79, 76, 72, 74, 77, 81, 86, 84, 79, 76, 74],
    bass: [48, 0, 55, 0, 57, 0, 52, 0, 50, 0, 55, 0, 48, 55, 60, 0],
  },
  candy_town: {
    bpm: 138,
    leadWave: 'triangle',
    bassWave: 'triangle',
    leadGain: 0.14,
    bassGain: 0.11,
    hats: true,
    // Bouncy F-major bubblegum marimba melody
    lead: [77, 81, 84, 89, 86, 84, 81, 77, 79, 82, 86, 84, 81, 77, 84, 0],
    bass: [53, 0, 60, 0, 58, 0, 60, 0, 55, 0, 60, 0, 53, 57, 60, 0],
  },
  pirate_bay: {
    bpm: 140,
    leadWave: 'sawtooth',
    bassWave: 'triangle',
    leadGain: 0.08,
    bassGain: 0.12,
    hats: true,
    // Jaunty D-minor sea-shanty bounce
    lead: [74, 0, 74, 77, 81, 0, 81, 84, 86, 84, 81, 79, 77, 76, 74, 0],
    bass: [50, 0, 57, 0, 53, 0, 60, 0, 55, 0, 58, 0, 57, 0, 50, 0],
  },
  ice_village: {
    bpm: 126,
    leadWave: 'sine',
    bassWave: 'triangle',
    leadGain: 0.16,
    bassGain: 0.10,
    hats: false,
    // Sparkling G-major winter celesta chimes
    lead: [79, 83, 86, 91, 90, 86, 83, 79, 81, 84, 88, 91, 86, 83, 79, 86],
    bass: [55, 0, 62, 0, 59, 0, 62, 0, 57, 0, 60, 0, 55, 62, 67, 0],
  },
  toy_kingdom: {
    bpm: 144,
    leadWave: 'square',
    bassWave: 'triangle',
    leadGain: 0.075,
    bassGain: 0.12,
    hats: true,
    // Playful Bb-major staccato toy-piano march
    lead: [70, 74, 77, 82, 79, 77, 74, 0, 75, 79, 82, 86, 84, 82, 77, 0],
    bass: [46, 53, 46, 53, 51, 58, 51, 58, 48, 55, 53, 60, 46, 53, 58, 0],
  },
  boss_golem: {
    bpm: 150,
    leadWave: 'sawtooth',
    bassWave: 'sawtooth',
    leadGain: 0.095,
    bassGain: 0.11,
    hats: true,
    // Urgent E-minor mechanical boss encounter theme
    lead: [64, 67, 71, 76, 75, 71, 67, 64, 69, 72, 76, 79, 78, 75, 71, 0],
    bass: [40, 40, 52, 40, 43, 43, 55, 43, 45, 45, 57, 45, 47, 47, 54, 47],
  },
  podium: {
    bpm: 136,
    leadWave: 'triangle',
    bassWave: 'triangle',
    leadGain: 0.15,
    bassGain: 0.12,
    hats: true,
    // Celebratory C-major victory fanfare
    lead: [72, 76, 79, 84, 84, 88, 91, 0, 89, 86, 84, 83, 84, 79, 84, 0],
    bass: [48, 55, 60, 0, 52, 55, 60, 0, 53, 57, 60, 55, 48, 55, 60, 0],
  },
});

const RECOGNIZED_SFX_EVENTS = new Set(Object.values(EVENT_TYPES));

export class AudioSynth {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._bgmGain = null;
    this._sfxGain = null;
    this._noiseBuffer = null;

    this._unlocked = false;
    this._muted = false;
    this._currentTrack = 'menu';
    this._sfxCount = 0;
    this._bgmStepCount = 0;
    this._candyRainRumbleCount = 0;

    this._stepIndex = 0;
    this._seqTimer = null;
    this._seqTimerTrack = null;
    this._seqTimerStepMs = 0;

    this._boundGestureUnlock = (ev) => {
      if (ev && ev.repeat) return;
      if (
        this._unlocked &&
        this._ctx &&
        this._ctx.state === 'running' &&
        (this._muted || !this._currentTrack || this._seqTimer !== null)
      ) {
        return;
      }
      this.unlock();
    };
    this._attachGlobalGestureListeners();
  }

  _attachGlobalGestureListeners() {
    if (typeof window === 'undefined') return;
    const opts = { capture: true, passive: true };
    window.addEventListener('pointerdown', this._boundGestureUnlock, opts);
    window.addEventListener('mousedown', this._boundGestureUnlock, opts);
    window.addEventListener('touchstart', this._boundGestureUnlock, opts);
    window.addEventListener('keydown', this._boundGestureUnlock, opts);
  }

  _ensureContext() {
    if (this._ctx) return this._ctx;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = this._muted ? 0 : 0.34;
      master.connect(ctx.destination);

      const bgm = ctx.createGain();
      bgm.gain.value = 0.52;
      bgm.connect(master);

      const sfx = ctx.createGain();
      sfx.gain.value = 0.88;
      sfx.connect(master);

      this._ctx = ctx;
      this._masterGain = master;
      this._bgmGain = bgm;
      this._sfxGain = sfx;
      this._noiseBuffer = this._buildNoiseBuffer(ctx);
      return ctx;
    } catch (_) {
      return null;
    }
  }

  _buildNoiseBuffer(ctx) {
    try {
      const length = Math.floor(ctx.sampleRate * 0.35);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    } catch (_) {
      return null;
    }
  }

  /**
   * Unlocks WebAudio safely from a user gesture with zero unhandled rejections.
   */
  unlock() {
    const firstUnlock = !this._unlocked;
    this._unlocked = true;
    const ctx = this._ensureContext();
    if (!ctx) return;

    try {
      if (ctx.state === 'suspended') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
      // Only play the 1-frame silent warmup buffer on first unlock or while context is not yet running
      if (firstUnlock || ctx.state !== 'running') {
        const silent = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = silent;
        src.connect(this._masterGain);
        src.start(0);
      }
    } catch (_) {
      // Ignore autoplay errors prior to browser readiness
    }

    if (firstUnlock || this._seqTimer === null) {
      this._syncSequencerTimer();
    }
  }

  unlockFromUserGesture() {
    this.unlock();
  }

  setMuted(muted) {
    this._muted = Boolean(muted);
    if (this._ctx && this._masterGain) {
      try {
        const now = this._ctx.currentTime;
        this._masterGain.gain.cancelScheduledValues(now);
        this._masterGain.gain.setTargetAtTime(this._muted ? 0 : 0.34, now, 0.015);
      } catch (_) {}
    }
    this._syncSequencerTimer();
    return this._muted;
  }

  isMuted() {
    return this._muted;
  }

  toggleMuted() {
    return this.setMuted(!this._muted);
  }

  setTrack(trackId) {
    const normalized = trackId && TRACK_PATTERNS[trackId] ? trackId : trackId === null ? null : 'menu';
    if (this._currentTrack !== normalized) {
      this._currentTrack = normalized;
      this._stepIndex = 0;
    }
    this._syncSequencerTimer();
  }

  setThemeTrack(trackId) {
    this.setTrack(trackId);
  }

  _syncSequencerTimer() {
    const pat =
      this._unlocked && !this._muted && this._currentTrack
        ? TRACK_PATTERNS[this._currentTrack] || null
        : null;

    if (!pat) {
      if (this._seqTimer !== null) {
        clearInterval(this._seqTimer);
        this._seqTimer = null;
      }
      this._seqTimerTrack = null;
      this._seqTimerStepMs = 0;
      return;
    }

    const stepMs = Math.max(85, Math.round((60 / pat.bpm / 2) * 1000));
    if (
      this._seqTimer !== null &&
      this._seqTimerTrack === this._currentTrack &&
      this._seqTimerStepMs === stepMs
    ) {
      return;
    }

    if (this._seqTimer !== null) {
      clearInterval(this._seqTimer);
      this._seqTimer = null;
    }
    this._seqTimerTrack = this._currentTrack;
    this._seqTimerStepMs = stepMs;
    this._seqTimer = setInterval(() => {
      this._tickSequencerStep();
    }, stepMs);
  }

  _canSynthesizeNow() {
    return Boolean(
      this._unlocked &&
      !this._muted &&
      this._ctx &&
      this._ctx.state === 'running' &&
      this._sfxGain
    );
  }

  _tickSequencerStep() {
    if (!this._canSynthesizeNow() || !this._currentTrack) return;
    const pat = TRACK_PATTERNS[this._currentTrack];
    if (!pat) return;

    const idx = this._stepIndex % pat.lead.length;
    this._stepIndex = (this._stepIndex + 1) % pat.lead.length;
    this._bgmStepCount += 1;

    const now = this._ctx.currentTime;
    const stepDur = 60 / pat.bpm / 2;

    const leadMidi = pat.lead[idx];
    if (leadMidi > 0) {
      this._playTone({
        freqStart: midiToFreq(leadMidi),
        freqEnd: midiToFreq(leadMidi),
        type: pat.leadWave,
        gain: pat.leadGain,
        duration: stepDur * 0.78,
        dest: this._bgmGain,
        startTime: now,
      });
    }

    const bassMidi = pat.bass[idx];
    if (bassMidi > 0) {
      this._playTone({
        freqStart: midiToFreq(bassMidi),
        freqEnd: midiToFreq(bassMidi),
        type: pat.bassWave,
        gain: pat.bassGain,
        duration: stepDur * 0.9,
        dest: this._bgmGain,
        startTime: now,
      });
    }

    if (pat.hats && idx % 2 === 1) {
      this._playNoiseBurst({
        duration: 0.03,
        gain: 0.03,
        filterType: 'highpass',
        filterFreq: 5200,
        dest: this._bgmGain,
        startTime: now,
      });
    }
  }

  /**
   * Consumes simulation per-tick events and synthesizes crisp QQ Tang arcade SFX.
   * Increments sfxCount deterministically for every recognized simulation event.
   *
   * @param {Array<{type: string}>} events
   */
  consumeEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return;

    const playedThisBatch = new Set();
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (!ev || !ev.type) continue;
      if (RECOGNIZED_SFX_EVENTS.has(ev.type)) {
        this._sfxCount += 1;
      }
      if (ev.type === EVENT_TYPES.CANDY_RAIN_WARNING) {
        this._candyRainRumbleCount += 1;
      }
      if (!playedThisBatch.has(ev.type)) {
        playedThisBatch.add(ev.type);
        this._triggerEventSfx(ev);
      }
    }
  }

  playUiTap() {
    if (!this._canSynthesizeNow()) return;
    this._playTone({
      freqStart: 560,
      freqEnd: 840,
      type: 'triangle',
      gain: 0.14,
      duration: 0.065,
      dest: this._sfxGain,
    });
  }

  playFuseTick(urgency = 0.5) {
    this._sfxCount += 1;
    if (!this._canSynthesizeNow()) return;
    const baseFreq = 820 + Math.max(0, Math.min(1, urgency)) * 520;
    this._playTone({
      freqStart: baseFreq,
      freqEnd: baseFreq * 1.18,
      type: 'square',
      gain: 0.11,
      duration: 0.042,
      dest: this._sfxGain,
    });
  }

  playCountdownBeep(isGo = false) {
    this._sfxCount += 1;
    if (!this._canSynthesizeNow()) return;
    if (isGo) {
      this._playTone({
        freqStart: 783.99,
        freqEnd: 1046.5,
        type: 'triangle',
        gain: 0.20,
        duration: 0.18,
        dest: this._sfxGain,
      });
    } else {
      this._playTone({
        freqStart: 523.25,
        freqEnd: 523.25,
        type: 'triangle',
        gain: 0.15,
        duration: 0.09,
        dest: this._sfxGain,
      });
    }
  }

  _triggerEventSfx(ev) {
    if (!this._canSynthesizeNow()) return;
    const now = this._ctx.currentTime;

    switch (ev.type) {
      case EVENT_TYPES.BUBBLE_DROP:
        this._playTone({
          freqStart: 270,
          freqEnd: 610,
          type: 'sine',
          gain: 0.22,
          duration: 0.095,
          startTime: now,
        });
        break;

      case EVENT_TYPES.KICK_SLIDE:
        this._playNoiseBurst({
          duration: 0.09,
          gain: 0.14,
          filterType: 'bandpass',
          filterFreq: 1400,
          startTime: now,
        });
        this._playTone({
          freqStart: 360,
          freqEnd: 680,
          type: 'triangle',
          gain: 0.14,
          duration: 0.08,
          startTime: now,
        });
        break;

      case EVENT_TYPES.EXPLODE:
        this._playNoiseBurst({
          duration: 0.20,
          gain: 0.24,
          filterType: 'lowpass',
          filterFreq: 1650,
          startTime: now,
        });
        this._playTone({
          freqStart: 155,
          freqEnd: 52,
          type: 'triangle',
          gain: 0.26,
          duration: 0.18,
          startTime: now,
        });
        break;

      case EVENT_TYPES.CHAIN_EXPLODE: {
        const chainMult = Math.pow(1.12, Math.min(6, Math.max(1, (ev.chainCount || 2) - 1)));
        this._playNoiseBurst({
          duration: 0.22,
          gain: 0.24,
          filterType: 'bandpass',
          filterFreq: 1950 * Math.min(1.5, chainMult),
          startTime: now,
        });
        this._playTone({
          freqStart: 523.25 * chainMult,
          freqEnd: 783.99 * chainMult,
          type: 'triangle',
          gain: 0.18,
          duration: 0.16,
          startTime: now,
        });
        break;
      }

      case EVENT_TYPES.BLOCK_BREAK:
        this._playTone({
          freqStart: 420,
          freqEnd: 185,
          type: 'square',
          gain: 0.10,
          duration: 0.075,
          startTime: now,
        });
        break;

      case EVENT_TYPES.TRAP:
        this._playTone({
          freqStart: 480,
          freqEnd: 290,
          type: 'sine',
          gain: 0.22,
          duration: 0.16,
          startTime: now,
        });
        this._playTone({
          freqStart: 310,
          freqEnd: 540,
          type: 'triangle',
          gain: 0.16,
          duration: 0.14,
          startTime: now + 0.07,
        });
        break;

      case EVENT_TYPES.RESCUE:
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          this._playTone({
            freqStart: freq,
            freqEnd: freq,
            type: 'triangle',
            gain: 0.16,
            duration: 0.09,
            startTime: now + idx * 0.045,
          });
        });
        break;

      case EVENT_TYPES.NEEDLE_RESCUE:
        this._playTone({
          freqStart: 1180,
          freqEnd: 1760,
          type: 'sine',
          gain: 0.20,
          duration: 0.08,
          startTime: now,
        });
        this._playTone({
          freqStart: 660,
          freqEnd: 990,
          type: 'triangle',
          gain: 0.16,
          duration: 0.11,
          startTime: now + 0.04,
        });
        break;

      case EVENT_TYPES.POP:
        this._playTone({
          freqStart: 520,
          freqEnd: 1180,
          type: 'sine',
          gain: 0.22,
          duration: 0.06,
          startTime: now,
        });
        this._playNoiseBurst({
          duration: 0.11,
          gain: 0.20,
          filterType: 'bandpass',
          filterFreq: 2100,
          startTime: now + 0.03,
        });
        break;

      case EVENT_TYPES.SHIELD_BREAK:
        this._playTone({
          freqStart: 980,
          freqEnd: 460,
          type: 'triangle',
          gain: 0.18,
          duration: 0.15,
          startTime: now,
        });
        break;

      case EVENT_TYPES.MOUNT_RIDE:
        if (ev.mount === 'ufo') {
          this._playTone({
            freqStart: 440,
            freqEnd: 920,
            type: 'sine',
            gain: 0.18,
            duration: 0.18,
            startTime: now,
          });
        } else {
          [392, 523.25, 659.25].forEach((f, idx) => {
            this._playTone({
              freqStart: f,
              freqEnd: f * 1.04,
              type: 'triangle',
              gain: 0.16,
              duration: 0.075,
              startTime: now + idx * 0.05,
            });
          });
        }
        break;

      case EVENT_TYPES.MOUNT_BREAK:
        this._playTone({
          freqStart: 410,
          freqEnd: 165,
          type: 'sawtooth',
          gain: 0.14,
          duration: 0.16,
          startTime: now,
        });
        break;

      case EVENT_TYPES.PICKUP:
      case EVENT_TYPES.BUN_PICKUP:
        [659.25, 880.0, 1174.66].forEach((f, idx) => {
          this._playTone({
            freqStart: f,
            freqEnd: f * 1.12,
            type: 'triangle',
            gain: 0.16,
            duration: 0.065,
            startTime: now + idx * 0.042,
          });
        });
        break;

      case EVENT_TYPES.CANDY_RAIN_DROP:
        this._playTone({
          freqStart: 220,
          freqEnd: 75,
          type: 'triangle',
          gain: 0.18,
          duration: 0.12,
          startTime: now,
        });
        break;

      case EVENT_TYPES.BUN_DROP:
        this._playTone({
          freqStart: 440,
          freqEnd: 260,
          type: 'sine',
          gain: 0.14,
          duration: 0.10,
          startTime: now,
        });
        break;

      case EVENT_TYPES.BUN_SCORE:
        [587.33, 783.99, 987.77, 1174.66].forEach((f, idx) => {
          this._playTone({
            freqStart: f,
            freqEnd: f,
            type: 'triangle',
            gain: 0.18,
            duration: 0.10,
            startTime: now + idx * 0.055,
          });
        });
        break;

      case EVENT_TYPES.BOSS_TELEGRAPH:
        this._playTone({
          freqStart: 440,
          freqEnd: 554.37,
          type: 'sawtooth',
          gain: 0.12,
          duration: 0.12,
          startTime: now,
        });
        this._playTone({
          freqStart: 440,
          freqEnd: 554.37,
          type: 'sawtooth',
          gain: 0.12,
          duration: 0.12,
          startTime: now + 0.14,
        });
        break;

      case EVENT_TYPES.BOSS_ATTACK:
        this._playNoiseBurst({
          duration: 0.22,
          gain: 0.22,
          filterType: 'lowpass',
          filterFreq: 950,
          startTime: now,
        });
        break;

      case EVENT_TYPES.BOSS_HIT:
        this._playTone({
          freqStart: ev.isHumanHit ? 1046.5 : 880,
          freqEnd: 320,
          type: 'square',
          gain: ev.isHumanHit ? 0.20 : 0.15,
          duration: 0.14,
          startTime: now,
        });
        if (ev.isHumanHit) {
          this._playTone({
            freqStart: 659.25,
            freqEnd: 1318.5,
            type: 'triangle',
            gain: 0.18,
            duration: 0.12,
            startTime: now + 0.04,
          });
        }
        break;

      case EVENT_TYPES.CANDY_RAIN_WARNING:
        this._playNoiseBurst({
          duration: 0.42,
          gain: 0.24,
          filterType: 'lowpass',
          filterFreq: 260,
          startTime: now,
        });
        this._playTone({
          freqStart: 112,
          freqEnd: 46,
          type: 'sawtooth',
          gain: 0.24,
          duration: 0.42,
          startTime: now,
        });
        this._playTone({
          freqStart: 587.33,
          freqEnd: 440,
          type: 'triangle',
          gain: 0.18,
          duration: 0.22,
          startTime: now + 0.08,
        });
        break;

      case EVENT_TYPES.CANDY_RAIN_DROP:
        this._playNoiseBurst({
          duration: 0.12,
          gain: 0.16,
          filterType: 'lowpass',
          filterFreq: 380,
          startTime: now,
        });
        this._playTone({
          freqStart: 135,
          freqEnd: 55,
          type: 'triangle',
          gain: 0.20,
          duration: 0.14,
          startTime: now,
        });
        break;

      case EVENT_TYPES.BOSS_DEFEAT:
      case EVENT_TYPES.MATCH_END:
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
          this._playTone({
            freqStart: f,
            freqEnd: f,
            type: 'triangle',
            gain: 0.18,
            duration: 0.22,
            startTime: now + idx * 0.07,
          });
        });
        break;

      default:
        break;
    }
  }

  _playTone({
    freqStart,
    freqEnd,
    type = 'triangle',
    gain = 0.15,
    duration = 0.1,
    dest = null,
    startTime = null,
  }) {
    if (!this._ctx) return;
    try {
      const t0 = startTime !== null ? startTime : this._ctx.currentTime;
      const t1 = t0 + Math.max(0.02, duration);
      const osc = this._ctx.createOscillator();
      const env = this._ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freqStart), t0);
      if (freqEnd && Math.abs(freqEnd - freqStart) > 0.5) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t1);
      }

      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.012, duration * 0.25));
      env.gain.exponentialRampToValueAtTime(0.0001, t1);

      osc.connect(env);
      env.connect(dest || this._sfxGain);
      osc.start(t0);
      osc.stop(t1 + 0.01);
    } catch (_) {}
  }

  _playNoiseBurst({
    duration = 0.12,
    gain = 0.15,
    filterType = 'lowpass',
    filterFreq = 1500,
    dest = null,
    startTime = null,
  }) {
    if (!this._ctx || !this._noiseBuffer) return;
    try {
      const t0 = startTime !== null ? startTime : this._ctx.currentTime;
      const t1 = t0 + Math.max(0.02, duration);

      const src = this._ctx.createBufferSource();
      src.buffer = this._noiseBuffer;

      const filter = this._ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, t0);

      const env = this._ctx.createGain();
      env.gain.setValueAtTime(gain, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t1);

      src.connect(filter);
      filter.connect(env);
      env.connect(dest || this._sfxGain);
      src.start(t0);
      src.stop(t1 + 0.01);
    } catch (_) {}
  }

  getDiagnostics() {
    return {
      unlocked: this._unlocked,
      muted: this._muted,
      currentTrack: this._currentTrack,
      sfxCount: this._sfxCount,
      bgmStepCount: this._bgmStepCount,
      candyRainRumbleCount: this._candyRainRumbleCount,
    };
  }
}
