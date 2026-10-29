/**
 * Procedural Candy Studio Lighting, PMREM Environment Map, Opaque Chibi Face
 * CanvasTextures, and Shared Material/Texture Factories for QQ Tang 3D (QQ堂 3D).
 *
 * CRITICAL THREE.JS TRANSMISSION RULE:
 *   All character & mount body/face materials use `transparent: false` so Three.js's
 *   internal `renderTransmissionPass` includes them in `_transmissionRenderTarget` and
 *   keeps character faces 100% sharp and visible inside transmissive/transparent bubbles!
 *
 * 100% relative ES module imports — zero bare specifiers.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { ARENA_METADATA, CHARACTER_METADATA } from '../contracts/constants.js';

const textureCache = new Map();

/**
 * Configures WebGLRenderer for vibrant candy toy-diorama color, tone mapping, and soft shadows.
 * @param {THREE.WebGLRenderer} renderer
 */
export function configureRendererPipeline(renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

/**
 * Builds an offscreen procedural Candy Studio Lightbox scene and bakes a crisp
 * PMREM reflection environment map so MeshPhysicalMaterial (`clearcoat`, `transmission`,
 * `iridescence`, `metalness`) gleams with vibrant highlights and zero external assets.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.Texture}
 */
export function createCandyStudioEnvMap(renderer) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const studioScene = new THREE.Scene();
  studioScene.background = new THREE.Color(0xfff4f8);

  const tempGeos = [];
  const tempMats = [];

  const addPanel = (geo, colorHex, intensity, pos, lookAtOrigin = true) => {
    const color = new THREE.Color(colorHex).multiplyScalar(intensity);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (lookAtOrigin) {
      mesh.lookAt(0, 0, 0);
    }
    studioScene.add(mesh);
    tempGeos.push(geo);
    tempMats.push(mat);
    return mesh;
  };

  // Warm cream sky dome
  const domeGeo = new THREE.SphereGeometry(28, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xfff5fa),
    side: THREE.BackSide,
  });
  studioScene.add(new THREE.Mesh(domeGeo, domeMat));
  tempGeos.push(domeGeo);
  tempMats.push(domeMat);

  // Overhead key softboxes (bright crisp specular catchlights on bubbles & clearcoats)
  addPanel(new THREE.PlaneGeometry(14, 14), 0xffffff, 3.6, [0, 18, 4]);
  addPanel(new THREE.PlaneGeometry(10, 8), 0xfffbeb, 3.0, [-9, 14, 8]);
  addPanel(new THREE.PlaneGeometry(10, 8), 0xf0f9ff, 2.8, [10, 13, 6]);

  // Pastel candy rim cards (strawberry pink, sky cyan, butter gold)
  addPanel(new THREE.PlaneGeometry(14, 9), 0xff8ec7, 2.1, [-16, 5, -4]);
  addPanel(new THREE.PlaneGeometry(14, 9), 0x67e8f9, 2.1, [16, 5, -4]);
  addPanel(new THREE.PlaneGeometry(16, 8), 0xfde68a, 1.8, [0, 6, -17]);

  // Warm bounce floor so undersides of spheres & chins stay colorful
  const bounceFloor = addPanel(new THREE.CircleGeometry(22, 24), 0xffe4ef, 1.15, [0, -10, 0], false);
  bounceFloor.rotation.x = -Math.PI * 0.5;

  const envRT = pmremGenerator.fromScene(studioScene, 0.035);
  for (const g of tempGeos) g.dispose();
  for (const m of tempMats) m.dispose();
  pmremGenerator.dispose();

  return envRT.texture;
}

/**
 * Helper to create an offscreen 2D canvas and wrap it as an sRGB THREE.CanvasTexture.
 * @param {string} cacheKey
 * @param {number} width
 * @param {number} height
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} drawFn
 * @param {object} [options]
 * @returns {THREE.CanvasTexture}
 */
export function getOrCreateCanvasTexture(cacheKey, width, height, drawFn, options = {}) {
  if (cacheKey && textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = options.wrapS || THREE.ClampToEdgeWrapping;
  tex.wrapT = options.wrapT || THREE.ClampToEdgeWrapping;
  if (options.repeatX || options.repeatY) {
    tex.repeat.set(options.repeatX || 1, options.repeatY || 1);
  }
  tex.anisotropy = 4;
  tex.needsUpdate = true;

  if (cacheKey) {
    textureCache.set(cacheKey, tex);
  }
  return tex;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/**
 * Paints a high-detail 512x512 opaque chibi face texture (`normal`, `happy`, `trapped`)
 * baked directly onto warm peach skin (`transparent: false` material).
 *
 * UV Projection Note:
 *   Applied to `SphereGeometry` rotated by `rotation.y = -Math.PI * 0.5`, which places
 *   UV `(0.5, 0.5)` directly on the `+Z` front of the head. Because equirectangular UVs
 *   span `2*pi` horizontally vs `pi` vertically, we apply `ctx.scale(0.5, 1.0)` around
 *   `(256, 266)` when painting facial features so anime eyes, cheeks, and mouths render
 *   with zero horizontal stretch on the 3D sphere!
 *
 * @param {string} characterId
 * @param {'normal'|'happy'|'trapped'} expression
 * @returns {THREE.CanvasTexture}
 */
export function createChibiFaceTexture(characterId = 'miduo', expression = 'normal') {
  const safeChar = CHARACTER_METADATA[characterId] ? characterId : 'miduo';
  const safeExpr = expression === 'happy' || expression === 'trapped' ? expression : 'normal';
  const key = `face:${safeChar}:${safeExpr}`;

  return getOrCreateCanvasTexture(key, 512, 512, (ctx, w, h) => {
    // 1. Opaque warm peach chibi skin base with gentle top/bottom gradient
    const skinGrad = ctx.createLinearGradient(0, 0, 0, h);
    skinGrad.addColorStop(0.0, '#FFE4CF');
    skinGrad.addColorStop(0.48, '#FFD8BC');
    skinGrad.addColorStop(0.78, '#FFCBA8');
    skinGrad.addColorStop(1.0, '#F5B895');
    ctx.fillStyle = skinGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle warm cheek ambient glow around front face center (256, 286)
    ctx.save();
    ctx.translate(256, 272);
    ctx.scale(0.5, 1.0); // Compensate 2:1 equirectangular sphere UV ratio!

    // Per-character iris & brow palette
    const styleMap = {
      miduo: {
        irisTop: '#5B2C1D',
        irisBot: '#C2593F',
        brow: '#6E3524',
        cheek: 'rgba(255, 102, 148, 0.52)',
      },
      xiaoqiang: {
        irisTop: '#1E293B',
        irisBot: '#2563EB',
        brow: '#1E293B',
        cheek: 'rgba(255, 118, 118, 0.42)',
      },
      haiwangzi: {
        irisTop: '#0F3A7D',
        irisBot: '#38BDF8',
        brow: '#0E4F8B',
        cheek: 'rgba(255, 132, 155, 0.36)',
      },
      wanzi: {
        irisTop: '#3E1F2B',
        irisBot: '#9D4EDD',
        brow: '#4A2033',
        cheek: 'rgba(255, 110, 150, 0.56)',
      },
    };
    const st = styleMap[safeChar];

    // Rosy oval cheeks + cute white cheek highlight dot
    for (const dir of [-1, 1]) {
      const cx = dir * 74;
      const cy = 28;
      ctx.fillStyle = st.cheek;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 28, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tiny diagonal anime blush lines when happy or trapped
      if (safeExpr !== 'normal') {
        ctx.strokeStyle = 'rgba(235, 68, 110, 0.55)';
        ctx.lineWidth = 2.6;
        for (let b = -1; b <= 1; b += 1) {
          ctx.beginPath();
          ctx.moveTo(cx + b * 9 - 4, cy + 5);
          ctx.lineTo(cx + b * 9 + 4, cy - 5);
          ctx.stroke();
        }
      }
    }

    // Tiny cute button nose shadow
    ctx.fillStyle = 'rgba(214, 128, 96, 0.65)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 5.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes & Brows by expression
    const eyeOffsets = [-54, 54];

    if (safeExpr === 'trapped') {
      // Panicked >_< / teary anime eyes + sweat drop!
      for (const ex of eyeOffsets) {
        const dir = Math.sign(ex);
        // Worried upturned eyebrows
        ctx.strokeStyle = st.brow;
        ctx.lineWidth = 6.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - dir * 24, -44);
        ctx.quadraticCurveTo(ex, -52, ex + dir * 22, -62);
        ctx.stroke();

        // Tightly squeezed >   < chevrons with glossy tear droplet at outer corner
        ctx.strokeStyle = '#2B1820';
        ctx.lineWidth = 9.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        if (dir < 0) {
          // Left eye '>'
          ctx.moveTo(ex - 24, -26);
          ctx.lineTo(ex + 16, -6);
          ctx.lineTo(ex - 24, 14);
        } else {
          // Right eye '<'
          ctx.moveTo(ex + 24, -26);
          ctx.lineTo(ex - 16, -6);
          ctx.lineTo(ex + 24, 14);
        }
        ctx.stroke();

        // Sparkling cyan tear drop at outer corner
        const tx = ex + dir * 28;
        const ty = 12;
        ctx.fillStyle = '#67E8F9';
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 11);
        ctx.quadraticCurveTo(tx + dir * 12, ty + 4, tx, ty + 13);
        ctx.quadraticCurveTo(tx - dir * 10, ty + 4, tx, ty - 11);
        ctx.fill();
        ctx.stroke();
      }

      // Big comic sweat drop on temple
      ctx.fillStyle = '#BAE6FD';
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(96, -68);
      ctx.quadraticCurveTo(112, -40, 96, -28);
      ctx.quadraticCurveTo(80, -40, 96, -68);
      ctx.fill();
      ctx.stroke();

      // Wavy panicked mouth
      ctx.fillStyle = '#9F1239';
      ctx.strokeStyle = '#3B0A18';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-30, 48);
      ctx.bezierCurveTo(-15, 34, 15, 34, 30, 48);
      ctx.bezierCurveTo(22, 72, -22, 72, -30, 48);
      ctx.fill();
      ctx.stroke();

      // Pink tongue inside open mouth
      ctx.fillStyle = '#FB7185';
      ctx.beginPath();
      ctx.ellipse(0, 56, 17, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (safeExpr === 'happy') {
      // Joyful sparkling anime eyes (with noble wink for HaiWangZi!) + big celebratory grin
      for (let i = 0; i < 2; i += 1) {
        const ex = eyeOffsets[i];
        const dir = Math.sign(ex);

        // High cheerful brows
        ctx.strokeStyle = st.brow;
        ctx.lineWidth = 6.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - 23, -50);
        ctx.quadraticCurveTo(ex, -63, ex + 23, -50);
        ctx.stroke();

        if (safeChar === 'haiwangzi' && i === 1) {
          // Dashing Ocean Prince playful wink on right eye + sparkling sapphire left eye!
          ctx.strokeStyle = '#1E0E18';
          ctx.lineWidth = 9.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ex - 25, 2);
          ctx.quadraticCurveTo(ex, -26, ex + 25, 2);
          ctx.stroke();
        } else {
          const hasLashes = safeChar === 'wanzi' || safeChar === 'miduo';
          drawAnimeEye(ctx, ex, -8, 28, 33, st.irisTop, st.irisBot, hasLashes, dir);
        }
      }

      // Big happy open D-shaped smile with bright tongue
      ctx.fillStyle = '#881337';
      ctx.strokeStyle = '#2D1219';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-30, 36);
      ctx.quadraticCurveTo(0, 40, 30, 36);
      ctx.bezierCurveTo(28, 72, -28, 72, -30, 36);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FF7597';
      ctx.beginPath();
      ctx.ellipse(0, 53, 18, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 'normal' — Expressive signature anime eyes with dual white catchlights!
      for (const ex of eyeOffsets) {
        const dir = Math.sign(ex);
        // Character-specific eyebrow angle
        ctx.strokeStyle = st.brow;
        ctx.lineWidth = 6.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (safeChar === 'xiaoqiang') {
          // Sporty confident angled brows
          ctx.moveTo(ex - dir * 22, -46);
          ctx.quadraticCurveTo(ex, -54, ex + dir * 24, -58);
        } else if (safeChar === 'haiwangzi') {
          // Crisp noble brows
          ctx.moveTo(ex - dir * 22, -49);
          ctx.lineTo(ex + dir * 23, -54);
        } else {
          // Soft arched cute brows
          ctx.moveTo(ex - 21, -50);
          ctx.quadraticCurveTo(ex, -60, ex + 21, -50);
        }
        ctx.stroke();

        const hasLashes = safeChar === 'wanzi' || safeChar === 'miduo';
        drawAnimeEye(ctx, ex, -8, 26, 31, st.irisTop, st.irisBot, hasLashes, dir);
      }

      // Signature mouth per character
      ctx.strokeStyle = '#3B1520';
      ctx.lineWidth = 5.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (safeChar === 'wanzi') {
        // Adorable cat-smile 'ω'
        ctx.beginPath();
        ctx.moveTo(-22, 40);
        ctx.quadraticCurveTo(-11, 52, 0, 41);
        ctx.quadraticCurveTo(11, 52, 22, 40);
        ctx.stroke();
      } else if (safeChar === 'xiaoqiang') {
        // Cheeky sporty grin with bright white tooth band
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(-26, 38);
        ctx.quadraticCurveTo(2, 42, 28, 34);
        ctx.quadraticCurveTo(18, 58, -26, 38);
        ctx.fill();
        ctx.stroke();
      } else if (safeChar === 'haiwangzi') {
        // Confident gentle prince smile
        ctx.beginPath();
        ctx.moveTo(-21, 41);
        ctx.quadraticCurveTo(2, 52, 24, 38);
        ctx.stroke();
      } else {
        // MiDuo cheerful open smile
        ctx.fillStyle = '#9F1239';
        ctx.beginPath();
        ctx.moveTo(-24, 38);
        ctx.quadraticCurveTo(0, 41, 24, 38);
        ctx.bezierCurveTo(20, 62, -20, 62, -24, 38);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FF7597';
        ctx.beginPath();
        ctx.ellipse(0, 50, 13, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  });
}

function drawAnimeEye(ctx, cx, cy, rx, ry, irisTop, irisBot, lashes = false, sideDir = 1) {
  // White sclera rim
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 4, ry + 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rich vertical gradient iris
  const ig = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  ig.addColorStop(0.0, irisTop);
  ig.addColorStop(0.55, irisTop);
  ig.addColorStop(1.0, irisBot);
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, rx - 1, ry - 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Deep dark pupil center
  ctx.fillStyle = '#140C14';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, rx * 0.48, ry * 0.50, 0, 0, Math.PI * 2);
  ctx.fill();

  // Thick upper anime lash arch
  ctx.strokeStyle = '#1E0E18';
  ctx.lineWidth = 7.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + 2, rx + 2, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();

  if (lashes) {
    ctx.lineWidth = 5.0;
    ctx.beginPath();
    ctx.moveTo(cx + sideDir * (rx + 1), cy - 10);
    ctx.lineTo(cx + sideDir * (rx + 10), cy - 18);
    ctx.stroke();
  }

  // Dual crisp pure-white catchlights (upper-left large + lower-right small)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy - 10, 7.5, 8.5, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx + 8, cy + 10, 4.2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Procedural surface textures for the 4 arenas, mounts, and boss warning decals.
 */
export function createPeppermintStripeTexture() {
  return getOrCreateCanvasTexture(
    'tex:peppermint',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#FFF8FA';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#FF4D79';
      for (let i = -w; i < w * 2; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 32, 0);
        ctx.lineTo(i - 64 + 32, h);
        ctx.lineTo(i - 64, h);
        ctx.closePath();
        ctx.fill();
      }
    },
    { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping }
  );
}

export function createGiftBoxTexture(baseHex = '#FFE066', ribbonHex = '#FF4D8D') {
  return getOrCreateCanvasTexture(`tex:gift:${baseHex}:${ribbonHex}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, w, h);

    // Subtle polka dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let y = 28; y < h; y += 56) {
      for (let x = 28; x < w; x += 56) {
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Soft bevel border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // Crossed satin ribbon
    ctx.fillStyle = ribbonHex;
    ctx.fillRect(w * 0.5 - 22, 0, 44, h);
    ctx.fillRect(0, h * 0.5 - 22, w, 44);

    // Gold trim along ribbon edges
    ctx.fillStyle = '#FFF3B0';
    ctx.fillRect(w * 0.5 - 24, 0, 4, h);
    ctx.fillRect(w * 0.5 + 20, 0, 4, h);
    ctx.fillRect(0, h * 0.5 - 24, w, 4);
    ctx.fillRect(0, h * 0.5 + 20, w, 4);
  });
}

export function createWoodCrateTexture() {
  return getOrCreateCanvasTexture('tex:pirate_crate', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#C9823B';
    ctx.fillRect(0, 0, w, h);

    // Plank slats
    ctx.fillStyle = '#A66324';
    for (let y = 0; y < h; y += 52) {
      ctx.fillRect(0, y, w, 5);
    }

    // Diagonal X-brace
    ctx.strokeStyle = '#8B4D17';
    ctx.lineWidth = 28;
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(w - 20, h - 20);
    ctx.moveTo(w - 20, 20);
    ctx.lineTo(20, h - 20);
    ctx.stroke();

    ctx.strokeStyle = '#DF9A52';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(w - 20, h - 20);
    ctx.moveTo(w - 20, 20);
    ctx.lineTo(20, h - 20);
    ctx.stroke();

    // Outer frame
    ctx.strokeStyle = '#7C4212';
    ctx.lineWidth = 26;
    ctx.strokeRect(13, 13, w - 26, h - 26);

    // Iron corner rivets
    ctx.fillStyle = '#334155';
    for (const [rx, ry] of [
      [22, 22],
      [w - 22, 22],
      [22, h - 22],
      [w - 22, h - 22],
    ]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function createDeckPlankTexture(hex = '#D9A066') {
  return getOrCreateCanvasTexture(`tex:deck:${hex}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);

    // Wood grain streaks
    ctx.fillStyle = 'rgba(110, 62, 22, 0.14)';
    for (let i = 0; i < 18; i += 1) {
      const y = (i * 15) % h;
      ctx.fillRect(0, y, w, 3);
    }

    // Plank seams
    ctx.strokeStyle = 'rgba(92, 48, 16, 0.42)';
    ctx.lineWidth = 4;
    for (const y of [64, 128, 192]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Brass deck nails
    ctx.fillStyle = 'rgba(75, 42, 16, 0.55)';
    for (const y of [32, 96, 160, 224]) {
      ctx.beginPath();
      ctx.arc(16, y, 3.5, 0, Math.PI * 2);
      ctx.arc(w - 16, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function createIceBlockTexture() {
  return getOrCreateCanvasTexture('tex:ice_block', 256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0.0, '#E0F7FF');
    g.addColorStop(0.5, '#93E2FF');
    g.addColorStop(1.0, '#60C5F8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Specular diagonal frost sheen
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(92, 0);
    ctx.lineTo(0, 92);
    ctx.lineTo(0, 28);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(140, 0);
    ctx.lineTo(175, 0);
    ctx.lineTo(0, 175);
    ctx.lineTo(0, 140);
    ctx.closePath();
    ctx.fill();

    // Beveled ice brick border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 14;
    drawRoundedRect(ctx, 10, 10, w - 20, h - 20, 22);
    ctx.stroke();
  });
}

export function createToyBlockTexture(bgHex = '#60A5FA', symbolHex = '#FEF08A', kind = 'star') {
  return getOrCreateCanvasTexture(`tex:toy:${bgHex}:${kind}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, w, h);

    // Cream inner play-block frame
    ctx.fillStyle = '#FFFBEB';
    drawRoundedRect(ctx, 24, 24, w - 48, h - 48, 28);
    ctx.fill();

    ctx.fillStyle = bgHex;
    drawRoundedRect(ctx, 38, 38, w - 76, h - 76, 20);
    ctx.fill();

    // Cheerful center icon (star or heart or crown)
    ctx.fillStyle = symbolHex;
    const cx = w * 0.5;
    const cy = h * 0.5;
    if (kind === 'heart') {
      ctx.beginPath();
      ctx.moveTo(cx, cy + 44);
      ctx.bezierCurveTo(cx - 58, cy + 6, cx - 52, cy - 44, cx, cy - 18);
      ctx.bezierCurveTo(cx + 52, cy - 44, cx + 58, cy + 6, cx, cy + 44);
      ctx.fill();
    } else {
      // 5-point star
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const ang = -Math.PI * 0.5 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 52 : 24;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  });
}

export function createTurtleShellTexture() {
  return getOrCreateCanvasTexture('tex:turtle_shell', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#059669';
    ctx.fillRect(0, 0, w, h);

    // Hexagonal scute rings
    ctx.strokeStyle = '#A7F3D0';
    ctx.fillStyle = '#10B981';
    ctx.lineWidth = 7;

    const centers = [
      [128, 128, 42],
      [128, 52, 30],
      [128, 204, 30],
      [60, 88, 30],
      [196, 88, 30],
      [60, 168, 30],
      [196, 168, 30],
    ];
    for (const [cx, cy, r] of centers) {
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  });
}

export function createHazardTelegraphTexture() {
  return getOrCreateCanvasTexture('tex:boss_hazard', 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    // Translucent fiery fill
    const rg = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
    rg.addColorStop(0.0, 'rgba(255, 230, 102, 0.72)');
    rg.addColorStop(0.65, 'rgba(239, 68, 68, 0.38)');
    rg.addColorStop(1.0, 'rgba(239, 68, 68, 0.22)');
    ctx.fillStyle = rg;
    drawRoundedRect(ctx, 8, 8, w - 16, h - 16, 24);
    ctx.fill();

    // Bold pulsing outer border
    ctx.strokeStyle = '#FF3B30';
    ctx.lineWidth = 16;
    drawRoundedRect(ctx, 14, 14, w - 28, h - 28, 20);
    ctx.stroke();

    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 6;
    drawRoundedRect(ctx, 26, 26, w - 52, h - 52, 14);
    ctx.stroke();

    // Target bullseye ring + crosshair
    ctx.strokeStyle = '#FFFBEB';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(128, 128, 54, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(128, 50);
    ctx.lineTo(128, 86);
    ctx.moveTo(128, 170);
    ctx.lineTo(128, 206);
    ctx.moveTo(50, 128);
    ctx.lineTo(86, 128);
    ctx.moveTo(170, 128);
    ctx.lineTo(206, 128);
    ctx.stroke();

    // Exclamation mark center
    ctx.fillStyle = '#FEF08A';
    drawRoundedRect(ctx, 118, 92, 20, 48, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(128, 158, 10, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Creates a glossy candy-plastic opaque material (`transparent: false` guaranteed).
 * @param {number|string} color
 * @param {object} [opts]
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function createCandyMaterial(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.26,
    metalness: opts.metalness ?? 0.03,
    clearcoat: opts.clearcoat ?? 0.68,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.16,
    envMapIntensity: opts.envMapIntensity ?? 0.58,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0.0,
    transparent: false,
  });
}

/**
 * Creates a brushed/gleaming metallic opaque material (`transparent: false` guaranteed).
 * @param {number|string} color
 * @param {object} [opts]
 * @returns {THREE.MeshStandardMaterial}
 */
export function createMetallicMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.28,
    metalness: opts.metalness ?? 0.78,
    envMapIntensity: opts.envMapIntensity ?? 1.15,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0.0,
    transparent: false,
  });
}

/**
 * Returns theme lighting palette for an arenaId.
 * @param {string} arenaId
 */
export function getArenaThemeLighting(arenaId) {
  switch (arenaId) {
    case 'pirate_bay':
      return {
        skyHex: 0xbae6fd,
        fogHex: 0xdcf4ff,
        hemiSky: 0xfffbeb,
        hemiGround: 0x38bdf8,
        hemiIntensity: 0.78,
        dirColor: 0xfff7ed,
        dirIntensity: 1.42,
      };
    case 'ice_village':
      return {
        skyHex: 0xbae6fd,
        fogHex: 0xdcf4ff,
        hemiSky: 0xf8fafc,
        hemiGround: 0x38bdf8,
        hemiIntensity: 0.74,
        dirColor: 0xffffff,
        dirIntensity: 1.32,
      };
    case 'toy_kingdom':
      return {
        skyHex: 0xdbeafe,
        fogHex: 0xeff6ff,
        hemiSky: 0xfffef0,
        hemiGround: 0xfda4af,
        hemiIntensity: 0.76,
        dirColor: 0xfffbeb,
        dirIntensity: 1.38,
      };
    case 'candy_town':
    default:
      return {
        skyHex: 0xffd6e8,
        fogHex: 0xffe8f2,
        hemiSky: 0xfff7ed,
        hemiGround: 0xf472b6,
        hemiIntensity: 0.76,
        dirColor: 0xfffaf0,
        dirIntensity: 1.38,
      };
  }
}
