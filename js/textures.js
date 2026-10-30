/*
 * Procedural PBR textures (albedo + normal + roughness) generated at start-up
 * from tileable fractal noise. Every texture tiles seamlessly; geometry uses
 * world-space UVs so 1 texture repeat = `tile` metres.
 */
(function (PD) {
  'use strict';

  // ---------------------------------------------------------------- noise
  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // Periodic value noise: period p cells across the texture.
  function vnoise(u, v, p, seed) {
    const x = u * p, y = v * p;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(u, v, p, oct, seed) {
    let s = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < oct; o++) { s += vnoise(u, v, p, seed + o * 17) * amp; tot += amp; amp *= 0.5; p *= 2; }
    return s / tot;
  }

  /**
   * gen(u, v, out) fills out = {r,g,b (0..1), h (height 0..1), rough (0..1)}.
   */
  function build(size, gen, normalStrength) {
    const n = size * size;
    const col = new Uint8ClampedArray(n * 4), rough = new Uint8ClampedArray(n * 4), height = new Float32Array(n);
    const o = { r: 0, g: 0, b: 0, h: 0, rough: 0.9 };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      gen(x / size, y / size, o, x, y);
      col[i * 4] = o.r * 255; col[i * 4 + 1] = o.g * 255; col[i * 4 + 2] = o.b * 255; col[i * 4 + 3] = 255;
      const r = o.rough * 255;
      rough[i * 4] = r; rough[i * 4 + 1] = r; rough[i * 4 + 2] = r; rough[i * 4 + 3] = 255;
      height[i] = o.h;
    }
    // normal map from height (wrapping Sobel)
    const nor = new Uint8ClampedArray(n * 4);
    const H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * normalStrength, ny = dy * normalStrength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      nor[i] = (nx / l * 0.5 + 0.5) * 255; nor[i + 1] = (ny / l * 0.5 + 0.5) * 255; nor[i + 2] = (nz / l * 0.5 + 0.5) * 255; nor[i + 3] = 255;
    }
    const tex = (data, srgb) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = PD.maxAniso || 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { map: tex(col, true), normalMap: tex(nor, false), roughnessMap: tex(rough, false) };
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  const GEN = {
    asphalt(u, v, o) {
      const base = fbm(u, v, 8, 5, 1);
      const patch = fbm(u, v, 3, 3, 9);
      const grain = hash(Math.floor(u * 1024), Math.floor(v * 1024), 3);
      let c = 0.16 + base * 0.08 + (patch > 0.62 ? -0.035 : 0);
      let h = base * 0.4;
      if (grain > 0.9) { c += 0.08 * (grain - 0.9) * 10; h += 0.5; }
      else if (grain < 0.05) { c -= 0.03; h -= 0.2; }
      // hairline cracks
      const cr = Math.abs(fbm(u, v, 4, 4, 33) - 0.5);
      if (cr < 0.0025) { c *= 0.8; h -= 0.3; }
      // faint tyre polish / oil stains
      const st = fbm(u, v, 2, 3, 44);
      if (st > 0.66) c *= 1 - (st - 0.66) * 0.6;
      o.r = c; o.g = c; o.b = c * 1.03; o.h = h;
      o.rough = clamp01(0.82 + base * 0.15 - (patch > 0.62 ? 0.12 : 0));
    },
    concrete(u, v, o, x, y) {
      // 2 x 2 slabs per tile, recessed joints
      const S = 512, j = 3;
      const jx = x % (S / 2) < j, jy = y % (S / 2) < j;
      const n = fbm(u, v, 16, 5, 5), st = fbm(u, v, 4, 3, 77);
      let c = 0.56 + n * 0.12 - (st > 0.6 ? (st - 0.6) * 0.5 : 0);
      if (hash(x, y, 8) > 0.97) c -= 0.05;
      let h = n * 0.3;
      if (jx || jy) { c *= 0.6; h = -0.8; }
      o.r = c; o.g = c * 0.99; o.b = c * 0.96; o.h = h; o.rough = 0.88;
    },
    brick(u, v, o, x, y) {
      const bh = 16, bw = 64, m = 3; // 32 rows x 8 bricks: tiles exactly
      const row = Math.floor(y / bh), off = (row % 2) * (bw / 2);
      const bx = Math.floor((x + off) / bw);
      const lx = (x + off) % bw, ly = y % bh;
      const mortar = lx < m || ly < m;
      const id = hash(bx % 8, row, 11);
      const n = fbm(u, v, 32, 4, 13);
      if (mortar) {
        const c = 0.62 + n * 0.08;
        o.r = c; o.g = c * 0.97; o.b = c * 0.92; o.h = 0.05 + n * 0.1; o.rough = 0.95;
      } else {
        const t = 0.75 + id * 0.35 + (n - 0.5) * 0.25;
        o.r = clamp01(0.5 * t); o.g = clamp01(0.24 * t); o.b = clamp01(0.18 * t);
        if (id > 0.92) { o.r *= 0.7; o.g *= 0.7; o.b *= 0.75; }
        o.h = 0.6 + n * 0.25; o.rough = 0.85;
      }
    },
    plaster(u, v, o) {
      const n = fbm(u, v, 16, 6, 21), d = fbm(u, v, 3, 3, 4);
      const c = 0.84 + (n - 0.5) * 0.1 - (d > 0.65 ? (d - 0.65) * 0.35 : 0);
      o.r = c; o.g = c; o.b = c; o.h = n * 0.5; o.rough = 0.92;
    },
    panels(u, v, o, x, y) {
      // precast concrete facade panels (4 x 4 per tile)
      const n = fbm(u, v, 24, 5, 41);
      const seam = x % 128 < 2 || y % 128 < 2;
      let c = 0.7 + (n - 0.5) * 0.1;
      if (seam) c *= 0.55;
      o.r = c; o.g = c * 0.98; o.b = c * 0.95; o.h = seam ? -0.5 : n * 0.3; o.rough = 0.8;
    },
    grass(u, v, o) {
      const n = fbm(u, v, 32, 5, 51), m = fbm(u, v, 4, 3, 52);
      const blade = hash(Math.floor(u * 512), Math.floor(v * 512), 53);
      const t = 0.6 + n * 0.5 + (blade - 0.5) * 0.35;
      o.r = clamp01((0.17 + m * 0.08) * t); o.g = clamp01((0.34 + m * 0.06) * t); o.b = clamp01(0.09 * t);
      o.h = n * 0.6 + blade * 0.4; o.rough = 0.95;
    },
    leaves(u, v, o) {
      const n = fbm(u, v, 24, 5, 61), cell = hash(Math.floor(u * 128), Math.floor(v * 128), 62);
      const t = 0.55 + n * 0.6 + (cell - 0.5) * 0.3;
      o.r = clamp01(0.16 * t); o.g = clamp01(0.3 * t); o.b = clamp01(0.08 * t);
      o.h = n * 0.5 + cell * 0.5; o.rough = 0.8;
    },
    curtain(u, v, o, x, y) {
      // glass curtain wall: 4 x 4 panes per tile, light mullions
      const mx = x % 128, my = y % 128;
      const mull = mx < 5 || my < 5;
      const n = fbm(u, v, 8, 3, 81), pane = hash(Math.floor(x / 128), Math.floor(y / 128), 82);
      if (mull) { o.r = 0.55; o.g = 0.57; o.b = 0.6; o.h = 1; o.rough = 0.45; }
      else { const c = 0.12 + pane * 0.08 + n * 0.04; o.r = c * 0.85; o.g = c; o.b = c * 1.2; o.h = 0; o.rough = 0.05 + n * 0.05; }
    },
    metal(u, v, o, x) {
      // corrugated sheet metal (warehouse)
      const n = fbm(u, v, 16, 4, 71);
      const w = Math.sin((x / 512) * Math.PI * 2 * 24);
      const c = 0.62 + w * 0.04 + (n - 0.5) * 0.12;
      o.r = c * 0.95; o.g = c; o.b = c * 1.02; o.h = w * 0.5 + 0.5; o.rough = 0.45 + n * 0.25;
    },
  };

  const cache = {};
  function get(name, strength) {
    if (!cache[name]) cache[name] = build(512, GEN[name], strength || 3);
    return cache[name];
  }

  PD.Tex = { get };
})(window.PD);
