/* Shared namespace + math / collision helpers */
window.PD = window.PD || {};

(function (PD) {
  'use strict';

  PD.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  PD.lerp = (a, b, t) => a + (b - a) * t;
  // Frame-rate independent smoothing toward a target.
  PD.damp = (a, b, lambda, dt) => PD.lerp(a, b, 1 - Math.exp(-lambda * dt));
  PD.wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  PD.dampAngle = (a, b, lambda, dt) => a + PD.wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
  PD.dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

  // Seeded RNG (mulberry32) so the city layout is identical every run.
  PD.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  PD.makeBox = (minX, maxX, minZ, maxZ, maxY, minY) => ({
    minX, maxX, minZ, maxZ, minY: minY || 0, maxY: maxY == null ? 10 : maxY,
  });

  /**
   * Push a circle (p.x, p.z, radius r) out of a list of axis-aligned boxes.
   * Returns the averaged collision normal {x,z} or null when nothing was hit.
   */
  PD.resolveCircle = function (p, r, boxes, out) {
    let hit = false, nx = 0, nz = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (p.x + r < b.minX || p.x - r > b.maxX || p.z + r < b.minZ || p.z - r > b.maxZ) continue;
      const cx = PD.clamp(p.x, b.minX, b.maxX), cz = PD.clamp(p.z, b.minZ, b.maxZ);
      let dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        p.x += dx * (r - d); p.z += dz * (r - d);
      } else {
        // Centre is inside the box: leave along the axis of least penetration.
        const l = p.x - b.minX, rt = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
        const m = Math.min(l, rt, t, bt);
        if (m === l) { dx = -1; dz = 0; p.x = b.minX - r; }
        else if (m === rt) { dx = 1; dz = 0; p.x = b.maxX + r; }
        else if (m === t) { dx = 0; dz = -1; p.z = b.minZ - r; }
        else { dx = 0; dz = 1; p.z = b.maxZ + r; }
      }
      hit = true; nx += dx; nz += dz;
    }
    if (!hit) return null;
    const l = Math.hypot(nx, nz) || 1;
    out = out || {};
    out.x = nx / l; out.z = nz / l;
    return out;
  };

  // Push circle out of other circles [{x,z,r}]; returns normal or null.
  PD.resolveCircleCircles = function (p, r, circles, out) {
    let hit = false, nx = 0, nz = 0;
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (rr - d); p.z += (dz / d) * (rr - d);
      nx += dx / d; nz += dz / d; hit = true;
    }
    if (!hit) return null;
    const l = Math.hypot(nx, nz) || 1;
    out = out || {};
    out.x = nx / l; out.z = nz / l;
    return out;
  };

  // Ray vs AABB (slab method). Returns hit distance or Infinity.
  PD.rayBox = function (ox, oy, oz, dx, dy, dz, b, maxT) {
    let t0 = 0, t1 = maxT;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    const mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < mn[a] || o[a] > mx[a]) return Infinity;
      } else {
        const inv = 1 / d[a];
        let tn = (mn[a] - o[a]) * inv, tf = (mx[a] - o[a]) * inv;
        if (tn > tf) { const s = tn; tn = tf; tf = s; }
        if (tn > t0) t0 = tn;
        if (tf < t1) t1 = tf;
        if (t0 > t1) return Infinity;
      }
    }
    return t0;
  };

  // Closest hit distance against several box lists (dir must be normalised).
  PD.raycastBoxes = function (ox, oy, oz, dx, dy, dz, maxT, lists) {
    let best = maxT;
    for (let l = 0; l < lists.length; l++) {
      const boxes = lists[l];
      for (let i = 0; i < boxes.length; i++) {
        const t = PD.rayBox(ox, oy, oz, dx, dy, dz, boxes[i], best);
        if (t < best) best = t;
      }
    }
    return best;
  };

  // Ray vs sphere. Returns distance or Infinity.
  PD.raySphere = function (ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz;
    const tca = lx * dx + ly * dy + lz * dz;
    if (tca < 0) return Infinity;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    if (d2 > r * r) return Infinity;
    return tca - Math.sqrt(r * r - d2);
  };

  // Canvas text texture (signs).
  PD.textTexture = function (text, opts) {
    opts = opts || {};
    const c = document.createElement('canvas');
    c.width = opts.w || 512; c.height = opts.h || 128;
    const g = c.getContext('2d');
    g.fillStyle = opts.bg || '#1b2a4a';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = opts.fg || '#ffffff';
    g.font = 'bold ' + (opts.size || 72) + 'px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 4);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  };
})(window.PD);
