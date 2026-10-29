/**
 * Kid-friendly, zero-text-wall inline SVG iconography & portraits
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Designed so a non-reading 5-year-old on iPad or nostalgic desktop player
 * recognizes every hero, arena, game mode, and HUD control at a glance.
 */

export const UI_ICONS = Object.freeze({
  logoBubbleBadge: `<svg viewBox="0 0 96 96" focusable="false">
    <defs>
      <radialGradient id="logoBubGrad" cx="35%" cy="30%" r="68%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="42%" stop-color="#7dd3fc" stop-opacity="0.92"/>
        <stop offset="82%" stop-color="#38bdf8" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#ec4899" stop-opacity="0.95"/>
      </radialGradient>
    </defs>
    <circle cx="48" cy="50" r="38" fill="url(#logoBubGrad)" stroke="#ffffff" stroke-width="4"/>
    <ellipse cx="33" cy="34" rx="12" ry="7" transform="rotate(-28 33 34)" fill="#ffffff" opacity="0.88"/>
    <circle cx="63" cy="64" r="6" fill="#fde047" opacity="0.85"/>
    <polygon points="48,6 53,18 66,18 55,26 59,38 48,30 37,38 41,26 30,18 43,18" fill="#facc15" stroke="#fff" stroke-width="2.5"/>
  </svg>`,

  playBig: `<svg viewBox="0 0 64 64" focusable="false">
    <path d="M20 13 C20 9, 25 7, 29 9.5 L51 24.5 C55 27, 55 33, 51 35.5 L29 50.5 C25 53, 20 51, 20 47 Z"
      fill="#ffffff" stroke="#166534" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="14" cy="16" r="3.5" fill="#fde047"/>
    <circle cx="52" cy="14" r="3" fill="#fde047"/>
  </svg>`,

  homePause: `<svg viewBox="0 0 64 64" focusable="false">
    <rect x="17" y="15" width="11" height="34" rx="5.5" fill="#ffffff" stroke="#1e3a8a" stroke-width="2.5"/>
    <rect x="36" y="15" width="11" height="34" rx="5.5" fill="#ffffff" stroke="#1e3a8a" stroke-width="2.5"/>
  </svg>`,

  audioOn: `<svg viewBox="0 0 64 64" focusable="false">
    <path d="M12 25 H22 L35 14 V50 L22 39 H12 Z" fill="#ffffff" stroke="#1e3a8a" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M43 22 C48 27, 48 37, 43 42" fill="none" stroke="#fde047" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M50 15 C58 24, 58 40, 50 49" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
  </svg>`,

  audioOff: `<svg viewBox="0 0 64 64" focusable="false">
    <path d="M12 25 H22 L35 14 V50 L22 39 H12 Z" fill="#e2e8f0" stroke="#334155" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M42 23 L56 37 M56 23 L42 37" fill="none" stroke="#fb7185" stroke-width="5" stroke-linecap="round"/>
  </svg>`,

  hudBubble: `<svg viewBox="0 0 80 80" focusable="false">
    <defs>
      <radialGradient id="hudBubGrad" cx="32%" cy="28%" r="70%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.98"/>
        <stop offset="40%" stop-color="#67e8f9" stop-opacity="0.92"/>
        <stop offset="80%" stop-color="#0ea5e9" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="#f472b6" stop-opacity="0.95"/>
      </radialGradient>
    </defs>
    <circle cx="40" cy="40" r="29" fill="url(#hudBubGrad)" stroke="#ffffff" stroke-width="3.5"/>
    <ellipse cx="29" cy="26" rx="10" ry="5.5" transform="rotate(-30 29 26)" fill="#ffffff" opacity="0.92"/>
    <circle cx="51" cy="51" r="4.5" fill="#fef08a" opacity="0.88"/>
  </svg>`,

  hudNeedle: `<svg viewBox="0 0 72 72" focusable="false">
    <circle cx="34" cy="40" r="19" fill="#bae6fd" fill-opacity="0.55" stroke="#ffffff" stroke-width="3" stroke-dasharray="5 3"/>
    <path d="M56 14 L26 44" stroke="#fef08a" stroke-width="6" stroke-linecap="round"/>
    <path d="M56 14 L23 47" stroke="#f43f5e" stroke-width="3" stroke-linecap="round"/>
    <circle cx="57" cy="13" r="6" fill="#facc15" stroke="#ffffff" stroke-width="2.5"/>
    <polygon points="22,48 16,56 26,52" fill="#ffffff"/>
  </svg>`,

  joystickBase: `<svg viewBox="0 0 136 136" focusable="false">
    <circle cx="68" cy="68" r="62" fill="rgba(15, 23, 42, 0.28)" stroke="rgba(255,255,255,0.68)" stroke-width="3"/>
    <polygon points="68,14 59,27 77,27" fill="rgba(255,255,255,0.82)"/>
    <polygon points="68,122 59,109 77,109" fill="rgba(255,255,255,0.82)"/>
    <polygon points="14,68 27,59 27,77" fill="rgba(255,255,255,0.82)"/>
    <polygon points="122,68 109,59 109,77" fill="rgba(255,255,255,0.82)"/>
  </svg>`,

  players1P: `<svg viewBox="0 0 56 44" focusable="false">
    <circle cx="28" cy="15" r="9.5" fill="#ffffff"/>
    <path d="M14 39 C14 28, 42 28, 42 39 Z" fill="#ffffff"/>
  </svg>`,

  players2P: `<svg viewBox="0 0 56 44" focusable="false">
    <circle cx="19" cy="15" r="8.5" fill="#fde047"/>
    <path d="M7 39 C7 29, 31 29, 31 39 Z" fill="#fde047"/>
    <circle cx="38" cy="15" r="8.5" fill="#ffffff"/>
    <path d="M26 39 C26 29, 50 29, 50 39 Z" fill="#ffffff"/>
  </svg>`,

  restartLoop: `<svg viewBox="0 0 56 56" focusable="false">
    <path d="M42 20 A16 16 0 1 0 44 33" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round"/>
    <polygon points="45,10 46,24 33,21" fill="#ffffff"/>
  </svg>`,

  gridMenu: `<svg viewBox="0 0 56 56" focusable="false">
    <rect x="11" y="11" width="14" height="14" rx="4" fill="#ffffff"/>
    <rect x="31" y="11" width="14" height="14" rx="4" fill="#fde047"/>
    <rect x="11" y="31" width="14" height="14" rx="4" fill="#67e8f9"/>
    <rect x="31" y="31" width="14" height="14" rx="4" fill="#ffffff"/>
  </svg>`,

  crownTrophy: `<svg viewBox="0 0 64 52" focusable="false">
    <path d="M8 42 L13 16 L25 27 L32 10 L39 27 L51 16 L56 42 Z" fill="#facc15" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="32" cy="9" r="4" fill="#fb7185"/>
  </svg>`,
});

export const CHARACTER_PORTRAITS = Object.freeze({
  miduo: `<svg viewBox="0 0 88 88" focusable="false">
    <circle cx="44" cy="44" r="40" fill="#ffe4ef" stroke="#ff5e99" stroke-width="3.5"/>
    <path d="M18 40 C20 18, 68 18, 70 40 Z" fill="#ff7a2f"/>
    <ellipse cx="44" cy="37" rx="27" ry="8" fill="#fb923c"/>
    <polygon points="44,17 46.8,23 53,23.5 48,27.5 49.5,33.5 44,30 38.5,33.5 40,27.5 35,23.5 41.2,23" fill="#fde047"/>
    <circle cx="44" cy="51" r="21" fill="#ffd8be"/>
    <circle cx="36" cy="49" r="3.6" fill="#291d18"/>
    <circle cx="52" cy="49" r="3.6" fill="#291d18"/>
    <circle cx="37.2" cy="47.8" r="1.3" fill="#ffffff"/>
    <circle cx="53.2" cy="47.8" r="1.3" fill="#ffffff"/>
    <ellipse cx="30" cy="55" rx="4" ry="2.2" fill="#fb7185" opacity="0.65"/>
    <ellipse cx="58" cy="55" rx="4" ry="2.2" fill="#fb7185" opacity="0.65"/>
    <path d="M38 57 Q44 64 50 57" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.8" stroke-linecap="round"/>
    <rect x="28" y="69" width="32" height="8" rx="4" fill="#ef4444"/>
  </svg>`,

  xiaoqiang: `<svg viewBox="0 0 88 88" focusable="false">
    <circle cx="44" cy="44" r="40" fill="#dbeafe" stroke="#2d7ff9" stroke-width="3.5"/>
    <path d="M34 22 Q26 8 19 14" fill="none" stroke="#dc2626" stroke-width="4" stroke-linecap="round"/>
    <path d="M54 22 Q62 8 69 14" fill="none" stroke="#dc2626" stroke-width="4" stroke-linecap="round"/>
    <circle cx="19" cy="14" r="4" fill="#facc15"/>
    <circle cx="69" cy="14" r="4" fill="#facc15"/>
    <circle cx="44" cy="47" r="24" fill="#2563eb"/>
    <circle cx="44" cy="52" r="19" fill="#ffd8be"/>
    <circle cx="36" cy="50" r="3.5" fill="#1e293b"/>
    <circle cx="52" cy="50" r="3.5" fill="#1e293b"/>
    <circle cx="37" cy="48.8" r="1.2" fill="#ffffff"/>
    <circle cx="53" cy="48.8" r="1.2" fill="#ffffff"/>
    <path d="M37 58 Q45 63 52 57" fill="none" stroke="#7c2d12" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`,

  haiwangzi: `<svg viewBox="0 0 88 88" focusable="false">
    <circle cx="44" cy="44" r="40" fill="#e0f2fe" stroke="#0284c7" stroke-width="3.5"/>
    <polygon points="27,27 31,13 39,22 44,10 49,22 57,13 61,27" fill="#facc15" stroke="#b45309" stroke-width="2"/>
    <circle cx="44" cy="21" r="2.8" fill="#ef4444"/>
    <path d="M21 46 C21 26, 67 26, 67 46 Z" fill="#06b6d4"/>
    <circle cx="44" cy="52" r="19.5" fill="#ffe0c8"/>
    <path d="M24 42 Q36 33 48 43 Q58 34 64 44" fill="#22d3ee"/>
    <circle cx="36" cy="51" r="3.4" fill="#0f172a"/>
    <circle cx="52" cy="51" r="3.4" fill="#0f172a"/>
    <path d="M39 59 Q44 63 49 59" fill="none" stroke="#7c2d12" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`,

  wanzi: `<svg viewBox="0 0 88 88" focusable="false">
    <circle cx="44" cy="44" r="40" fill="#fef3c7" stroke="#f59e0b" stroke-width="3.5"/>
    <circle cx="21" cy="28" r="11" fill="#581c87"/>
    <circle cx="67" cy="28" r="11" fill="#581c87"/>
    <circle cx="25" cy="32" r="4" fill="#facc15"/>
    <circle cx="63" cy="32" r="4" fill="#facc15"/>
    <path d="M22 48 C22 25, 66 25, 66 48 Z" fill="#6b21a8"/>
    <circle cx="44" cy="52" r="19.5" fill="#ffe2cc"/>
    <circle cx="36" cy="51" r="3.8" fill="#291d18"/>
    <circle cx="52" cy="51" r="3.8" fill="#291d18"/>
    <circle cx="37.2" cy="49.6" r="1.4" fill="#ffffff"/>
    <circle cx="53.2" cy="49.6" r="1.4" fill="#ffffff"/>
    <ellipse cx="29.5" cy="56" rx="4.2" ry="2.4" fill="#fb7185" opacity="0.72"/>
    <ellipse cx="58.5" cy="56" rx="4.2" ry="2.4" fill="#fb7185" opacity="0.72"/>
    <path d="M39 58 Q41.5 61 44 58 Q46.5 61 49 58" fill="none" stroke="#9f1239" stroke-width="2.3" stroke-linecap="round"/>
  </svg>`,
});

export const ARENA_ILLUSTRATIONS = Object.freeze({
  candy_town: `<svg viewBox="0 0 88 64" focusable="false">
    <rect x="4" y="4" width="80" height="56" rx="14" fill="#ffe4ef"/>
    <rect x="22" y="34" width="24" height="18" rx="4" fill="#f472b6"/>
    <path d="M18 35 C18 22, 50 22, 50 35 Z" fill="#fff1f2" stroke="#fb7185" stroke-width="2.5"/>
    <circle cx="34" cy="20" r="5" fill="#ef4444"/>
    <line x1="63" y1="32" x2="63" y2="52" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
    <circle cx="63" cy="24" r="11" fill="#38bdf8" stroke="#ffffff" stroke-width="3"/>
  </svg>`,

  pirate_bay: `<svg viewBox="0 0 88 64" focusable="false">
    <rect x="4" y="4" width="80" height="56" rx="14" fill="#bae6fd"/>
    <path d="M18 38 H70 L60 51 H28 Z" fill="#92400e" stroke="#451a03" stroke-width="2.5"/>
    <line x1="44" y1="12" x2="44" y2="38" stroke="#78350f" stroke-width="3.5"/>
    <path d="M44 13 L66 25 L44 33 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <path d="M8 53 Q22 47 36 53 T64 53 T80 53" fill="none" stroke="#0284c7" stroke-width="4" stroke-linecap="round"/>
  </svg>`,

  ice_village: `<svg viewBox="0 0 88 64" focusable="false">
    <rect x="4" y="4" width="80" height="56" rx="14" fill="#dbeafe"/>
    <path d="M16 49 C16 28, 52 28, 52 49 Z" fill="#f8fafc" stroke="#38bdf8" stroke-width="2.5"/>
    <path d="M29 49 C29 39, 39 39, 39 49 Z" fill="#7dd3fc"/>
    <polygon points="66,15 54,37 78,37" fill="#38bdf8"/>
    <polygon points="66,26 52,48 80,48" fill="#0ea5e9"/>
  </svg>`,

  toy_kingdom: `<svg viewBox="0 0 88 64" focusable="false">
    <rect x="4" y="4" width="80" height="56" rx="14" fill="#fef3c7"/>
    <rect x="16" y="31" width="26" height="20" rx="4" fill="#ef4444"/>
    <rect x="20" y="26" width="7" height="5" rx="1.5" fill="#dc2626"/>
    <rect x="31" y="26" width="7" height="5" rx="1.5" fill="#dc2626"/>
    <rect x="46" y="23" width="26" height="28" rx="4" fill="#3b82f6"/>
    <polygon points="59,29 61.5,35 68,35.5 63,39.5 64.5,46 59,42.5 53.5,46 55,39.5 50,35.5 56.5,35" fill="#fde047"/>
  </svg>`,
});

export const MODE_ILLUSTRATIONS = Object.freeze({
  classic_2v2: `<svg viewBox="0 0 84 60" focusable="false">
    <circle cx="29" cy="32" r="17" fill="#38bdf8" stroke="#ffffff" stroke-width="3"/>
    <ellipse cx="23" cy="25" rx="5" ry="3" transform="rotate(-25 23 25)" fill="#ffffff"/>
    <circle cx="55" cy="32" r="17" fill="#fb7185" stroke="#ffffff" stroke-width="3"/>
    <ellipse cx="49" cy="25" rx="5" ry="3" transform="rotate(-25 49 25)" fill="#ffffff"/>
    <polygon points="42,8 45,16 53,16 46.5,21 49,29 42,24 35,29 37.5,21 31,16 39,16" fill="#facc15" stroke="#ffffff" stroke-width="1.8"/>
  </svg>`,

  bun_grab: `<svg viewBox="0 0 84 60" focusable="false">
    <path d="M14 48 C14 33, 42 33, 42 48 Z" fill="#fef3c7" stroke="#f59e0b" stroke-width="2.5"/>
    <path d="M42 48 C42 33, 70 33, 70 48 Z" fill="#fef3c7" stroke="#f59e0b" stroke-width="2.5"/>
    <path d="M26 36 C26 17, 58 17, 58 36 Z" fill="#fde68a" stroke="#d97706" stroke-width="2.8"/>
    <circle cx="42" cy="20" r="3.2" fill="#f59e0b"/>
  </svg>`,

  boss_golem: `<svg viewBox="0 0 84 60" focusable="false">
    <polygon points="20,24 14,9 28,17" fill="#f59e0b"/>
    <polygon points="64,24 70,9 56,17" fill="#f59e0b"/>
    <rect x="22" y="16" width="40" height="34" rx="9" fill="#64748b" stroke="#1e293b" stroke-width="3"/>
    <rect x="29" y="25" width="26" height="9" rx="4.5" fill="#0f172a"/>
    <circle cx="36" cy="29.5" r="3.2" fill="#22d3ee"/>
    <circle cx="48" cy="29.5" r="3.2" fill="#22d3ee"/>
    <circle cx="42" cy="42" r="5" fill="#ef4444" stroke="#fde047" stroke-width="2"/>
  </svg>`,
});
