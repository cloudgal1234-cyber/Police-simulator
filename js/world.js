/*
 * City: a GRID x GRID block layout separated by roads.
 * Geometry is batched per material (world-space UVs, PBR textures) and all
 * repeated details (windows, trees, lamps, traffic lights) are instanced, so a
 * dense city renders in a few dozen draw calls.
 */
(function (PD) {
  'use strict';
  const M = () => PD.Models;

  const SPECIAL = {
    '2,2': 'hq', '1,1': 'store', '4,1': 'park', '1,4': 'apartments', '4,4': 'lot', '5,2': 'warehouse',
  };
  const PLASTER = [0xe9dcc6, 0xd8c3a5, 0xc9d3da, 0xe3c9b0, 0xd9d4c7, 0xc7b8a2, 0xb9c4c9, 0xe8e2d4, 0xd4b8a0];
  const BRICK_TINT = [0xffffff, 0xf0e2da, 0xe2d2c8, 0xd8c8c0];
  const PANEL_TINT = [0xffffff, 0xe8e6e0, 0xd9dde0, 0xcfc8bc];
  const GLASS_TINT = [0xffffff, 0xcfe0ea, 0xd8e8dd, 0xe2dccd];

  // ------------------------------------------------------------ batched geometry
  function GB() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  GB.prototype.quad = function (a, b, c, d, n, uvs, col) {
    const V = [a, b, c, a, c, d], U = [uvs[0], uvs[1], uvs[2], uvs[0], uvs[2], uvs[3]];
    for (let i = 0; i < 6; i++) {
      this.p.push(V[i][0], V[i][1], V[i][2]);
      this.n.push(n[0], n[1], n[2]);
      this.uv.push(U[i][0], U[i][1]);
      this.c.push(col.r, col.g, col.b);
    }
  };
  // Box with world-space UVs (T metres per texture repeat). Top face goes to topB (null = none).
  GB.prototype.box = function (x0, y0, z0, x1, y1, z1, color, T, topB) {
    const col = new THREE.Color(color);
    T = T || 4;
    const w = (u, v) => [u / T, v / T];
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [w(-z1, y0), w(-z0, y0), w(-z0, y1), w(-z1, y1)], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [w(z0, y0), w(z1, y0), w(z1, y1), w(z0, y1)], col);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [w(x0, y0), w(x1, y0), w(x1, y1), w(x0, y1)], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [w(-x1, y0), w(-x0, y0), w(-x0, y1), w(-x1, y1)], col);
    const tb = topB === undefined ? this : topB;
    if (tb) tb.flat(x0, z0, x1, z1, y1, color, T);
  };
  GB.prototype.flat = function (x0, z0, x1, z1, y, color, T) {
    T = T || 4;
    const w = (x, z) => [x / T, -z / T];
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [w(x0, z1), w(x1, z1), w(x1, z0), w(x0, z0)], new THREE.Color(color));
  };
  GB.prototype.mesh = function (material, shadows) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.castShadow = !!shadows; m.receiveShadow = true;
    return m;
  };

  function texMat(name, opts, normalScale) {
    const t = PD.Tex.get(name);
    const m = new THREE.MeshStandardMaterial(Object.assign({
      map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, vertexColors: true, roughness: 1, metalness: 0,
    }, opts || {}));
    if (normalScale) m.normalScale.set(normalScale, normalScale);
    return m;
  }

  function signMat(text, opts) {
    const map = PD.textTexture(text, opts);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 });
  }

  // Instanced-mesh helper: collects matrices + colours then builds the mesh.
  function Inst(geo, mat) { this.geo = geo; this.mat = mat; this.m = []; this.c = []; }
  const _o = new THREE.Object3D();
  Inst.prototype.add = function (x, y, z, ry, sx, sy, sz, color) {
    _o.position.set(x, y, z); _o.rotation.set(0, ry || 0, 0); _o.scale.set(sx || 1, sy || 1, sz || 1);
    _o.updateMatrix();
    this.m.push(_o.matrix.clone());
    this.c.push(color === undefined ? null : new THREE.Color(color));
    return this.m.length - 1;
  };
  Inst.prototype.build = function (scene, cast, recv) {
    if (!this.m.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.m.length);
    this.m.forEach((mx, i) => im.setMatrixAt(i, mx));
    if (this.c.some((c) => c)) this.c.forEach((c, i) => im.setColorAt(i, c || new THREE.Color(1, 1, 1)));
    im.castShadow = !!cast; im.receiveShadow = recv !== false;
    im.computeBoundingSphere();
    scene.add(im);
    return im;
  };

  // Leafy crown: several noisy icospheres merged.
  function crownGeometry() {
    const parts = [[0, 4.3, 0, 1.7], [0.95, 3.8, 0.4, 1.25], [-0.85, 3.9, -0.35, 1.35], [0.2, 5.3, -0.2, 1.15], [-0.35, 3.5, 0.95, 1.05], [0.5, 4.6, -0.9, 1.0]];
    const list = parts.map(([x, y, z, r], k) => {
      const g = new THREE.IcosahedronGeometry(r, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const n = Math.sin(vx * 3.1 + k) * Math.cos(vz * 2.7 + vy * 1.9) * 0.16 + Math.sin(vy * 5.3 + vx * 4.1) * 0.08;
        p.setXYZ(i, vx * (1 + n), vy * (1 + n) * 0.9, vz * (1 + n));
      }
      g.translate(x, y, z);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 3);
      return g;
    });
    const g = THREE.addons.mergeGeometries(list, false);
    g.computeVertexNormals();
    return g;
  }

  function lampGeometry() {
    const pole = new THREE.CylinderGeometry(0.08, 0.13, 7.6, 10); pole.translate(0, 3.8, 0);
    const base = new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10); base.translate(0, 0.3, 0);
    const arm = new THREE.CylinderGeometry(0.05, 0.06, 2.4, 8); arm.rotateX(Math.PI / 2 - 0.12); arm.translate(0, 7.55, 1.15);
    const head = new THREE.CapsuleGeometry(0.16, 0.5, 4, 8); head.rotateX(Math.PI / 2); head.scale(1.6, 0.6, 1); head.translate(0, 7.65, 2.35);
    return THREE.addons.mergeGeometries([pole, base, arm, head].map((g) => (g.index ? g.toNonIndexed() : g)), false);
  }

  function signalGeometry() {
    const pole = new THREE.CylinderGeometry(0.11, 0.14, 6.2, 10); pole.translate(0, 3.1, 0);
    const arm = new THREE.CylinderGeometry(0.07, 0.08, 4.8, 8); arm.rotateZ(Math.PI / 2); arm.translate(-2.4, 6.0, 0);
    const box = new THREE.BoxGeometry(0.42, 1.12, 0.32); box.translate(-4.5, 5.45, 0);
    const back = new THREE.BoxGeometry(0.62, 1.32, 0.04); back.translate(-4.5, 5.45, -0.17);
    const hoods = [0.36, 0, -0.36].map((dy) => { const h = new THREE.BoxGeometry(0.34, 0.04, 0.22); h.translate(-4.5, 5.45 + dy + 0.16, 0.26); return h; });
    return THREE.addons.mergeGeometries([pole, arm, box, back].concat(hoods).map((g) => (g.index ? g.toNonIndexed() : g)), false);
  }

  function World(scene) {
    const W = this;
    W.scene = scene;
    W.GRID = 6; W.CELL = 70; W.ROAD = 14; W.SIDEWALK = 4; W.LANE = 3.5;
    W.HALF = (W.GRID * W.CELL) / 2;
    W.LIMIT = W.HALF + W.ROAD / 2 + 0.5;
    W.colliders = [];
    W.dynColliders = [];
    W.lists = [W.colliders, W.dynColliders];
    W.blocks = [];
    W.blockMap = {};
    W.signalT = 0;

    const rand = PD.rng(20241);
    const roadPos = (i) => -W.HALF + i * W.CELL;
    W.roadPos = roadPos;
    const addCol = (x0, z0, x1, z1, h) => W.colliders.push(PD.makeBox(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), h));

    // batches
    const B = {
      plaster: new GB(), brick: new GB(), panels: new GB(), curtain: new GB(), metal: new GB(),
      roof: new GB(), trim: new GB(), road: new GB(), walk: new GB(), grass: new GB(), paint: new GB(),
    };
    // instanced details
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1d2630, metalness: 0.9, roughness: 0.07 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.2 });
    const unitPlane = new THREE.PlaneGeometry(1, 1);
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const I = {
      glass: new Inst(unitPlane, glassMat),
      shop: new Inst(unitPlane, new THREE.MeshStandardMaterial({ color: 0x2c353e, metalness: 0.75, roughness: 0.08, emissive: 0x3a3226, emissiveIntensity: 0.45 })),
      frame: new Inst(unitPlane, frameMat),
      sill: new Inst(unitBox, new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.8 })),
      awning: new Inst(unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })),
      ac: new Inst(unitBox, new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.5, metalness: 0.4 })),
    };
    const trees = [], lamps = [];

    // Windows on the four faces of a building footprint.
    const FACES = (x0, z0, x1, z1) => [
      { ax: 'x', a: x0, b: x1, f: z1, nx: 0, nz: 1, ry: 0 },
      { ax: 'x', a: x0, b: x1, f: z0, nx: 0, nz: -1, ry: Math.PI },
      { ax: 'z', a: z0, b: z1, f: x1, nx: 1, nz: 0, ry: Math.PI / 2 },
      { ax: 'z', a: z0, b: z1, f: x0, nx: -1, nz: 0, ry: -Math.PI / 2 },
    ];
    function windows(x0, z0, x1, z1, h, opts) {
      opts = opts || {};
      const frameCol = opts.frame || 0xf2f0ea;
      FACES(x0, z0, x1, z1).forEach((F) => {
        const len = F.b - F.a;
        const at = (s, y, out) => (F.ax === 'x' ? [s, y, F.f + F.nz * out] : [F.f + F.nx * out, y, s]);
        // ground floor
        if (opts.shops) {
          const n = Math.max(1, Math.floor((len - 1) / 4.4));
          for (let i = 0; i < n; i++) {
            const s = F.a + (i + 0.5) * (len / n);
            let p = at(s, 1.75, 0.03); I.frame.add(p[0], p[1], p[2], F.ry, 3.7, 3.0, 1, 0x2b2b2b);
            p = at(s, 1.7, 0.05); I.shop.add(p[0], p[1], p[2], F.ry, 3.4, 2.6, 1);
            if (opts.awnings && rand() < 0.55) {
              const ac = [0x7a1e1e, 0x1e3f6b, 0x1f5a3a, 0x6b4a1e, 0x333333][Math.floor(rand() * 5)];
              p = at(s, 3.45, 0.75); I.awning.add(p[0], p[1], p[2], F.ry, 3.8, 0.12, 1.5, ac);
            }
          }
        }
        if (opts.noUpper) return;
        const cols = Math.max(1, Math.floor((len - 1.2) / 2.9));
        for (let y = opts.shops ? 5.2 : 1.9; y < h - 1.3; y += 3.3) {
          for (let i = 0; i < cols; i++) {
            const s = F.a + (i + 0.5) * (len / cols);
            let p = at(s, y, 0.025); I.frame.add(p[0], p[1], p[2], F.ry, 1.55, 1.95, 1, frameCol);
            const lit = rand();
            p = at(s, y + 0.02, 0.045); I.glass.add(p[0], p[1], p[2], F.ry, 1.3, 1.7, 1, lit > 0.93 ? 0xe8d29a : lit > 0.5 ? 0xd0d0d0 : 0xffffff);
            p = at(s, y - 0.97, 0.08); I.sill.add(p[0], p[1], p[2], F.ry, 1.7, 0.08, 0.16);
          }
        }
      });
    }

    function building(x0, z0, x1, z1, h, style, opts) {
      opts = opts || {};
      const pick = (a) => a[Math.floor(rand() * a.length)];
      if (style === 'curtain') {
        B.curtain.box(x0, 0, z0, x1, h, z1, pick(GLASS_TINT), 4, null);
        B.trim.box(x0 - 0.15, h, z0 - 0.15, x1 + 0.15, h + 0.9, z1 + 0.15, 0x8c9196, 4, B.roof);
        B.trim.box(x0 - 0.05, 0, z0 - 0.05, x1 + 0.05, 0.6, z1 + 0.05, 0x6c7176, 4, null);
      } else {
        const b = B[style];
        const tint = style === 'brick' ? pick(BRICK_TINT) : style === 'panels' ? pick(PANEL_TINT) : pick(PLASTER);
        b.box(x0, 0, z0, x1, h, z1, tint, style === 'brick' ? 2.4 : 4, null);
        const corn = new THREE.Color(tint).multiplyScalar(0.8).getHex();
        b.box(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.8, z1 + 0.25, corn, 4, B.roof);
        if (opts.shops) B.trim.box(x0 - 0.06, 3.3, z0 - 0.06, x1 + 0.06, 3.6, z1 + 0.06, 0x3a3a3a, 4, null);
        windows(x0, z0, x1, z1, h, { shops: opts.shops, awnings: opts.shops, frame: style === 'brick' ? 0xece8df : rand() < 0.5 ? 0x3a3a3a : 0xece8df, noUpper: opts.noUpper });
      }
      // rooftop units
      const n = Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const ux = PD.lerp(x0 + 2, x1 - 2, rand()), uz = PD.lerp(z0 + 2, z1 - 2, rand());
        I.ac.add(ux, h + 1.4, uz, rand() * 0.3, 2 + rand() * 2, 1.2, 1.6 + rand());
      }
      addCol(x0, z0, x1, z1, h + 2);
    }

    // ---------- ground & roads
    B.grass.flat(-1200, -1200, 1200, 1200, -0.04, 0xffffff, 6);
    const lim = W.HALF + W.ROAD / 2;
    B.road.flat(-lim, -lim, lim, lim, 0, 0xffffff, 7);

    // lane markings
    for (let i = 0; i <= W.GRID; i++) {
      const r = roadPos(i);
      for (let j = 0; j < W.GRID; j++) {
        const a = roadPos(j) + W.ROAD / 2 + 3, b = roadPos(j + 1) - W.ROAD / 2 - 3;
        // double yellow centre line
        B.paint.flat(a, r - 0.22, b, r - 0.1, 0.012, 0xd8a91c);
        B.paint.flat(a, r + 0.1, b, r + 0.22, 0.012, 0xd8a91c);
        B.paint.flat(r - 0.22, a, r - 0.1, b, 0.012, 0xd8a91c);
        B.paint.flat(r + 0.1, a, r + 0.22, b, 0.012, 0xd8a91c);
        // white edge lines
        B.paint.flat(a, r - 6.1, b, r - 5.95, 0.012, 0xdedede);
        B.paint.flat(a, r + 5.95, b, r + 6.1, 0.012, 0xdedede);
        B.paint.flat(r - 6.1, a, r - 5.95, b, 0.012, 0xdedede);
        B.paint.flat(r + 5.95, a, r + 6.1, b, 0.012, 0xdedede);
      }
    }
    // crosswalks + stop lines
    for (let i = 0; i <= W.GRID; i++) for (let j = 0; j <= W.GRID; j++) {
      const x = roadPos(i), z = roadPos(j), h = W.ROAD / 2;
      for (let k = -6; k <= 6; k += 1.2) {
        if (j > 0) B.paint.flat(x + k - 0.25, z - h - 3.0, x + k + 0.25, z - h - 0.4, 0.012, 0xe6e6e6);
        if (j < W.GRID) B.paint.flat(x + k - 0.25, z + h + 0.4, x + k + 0.25, z + h + 3.0, 0.012, 0xe6e6e6);
        if (i > 0) B.paint.flat(x - h - 3.0, z + k - 0.25, x - h - 0.4, z + k + 0.25, 0.012, 0xe6e6e6);
        if (i < W.GRID) B.paint.flat(x + h + 0.4, z + k - 0.25, x + h + 3.0, z + k + 0.25, 0.012, 0xe6e6e6);
      }
      if (j > 0) B.paint.flat(x, z - h - 3.6, x + h - 0.2, z - h - 3.2, 0.012, 0xe6e6e6);
      if (j < W.GRID) B.paint.flat(x - h + 0.2, z + h + 3.2, x, z + h + 3.6, 0.012, 0xe6e6e6);
      if (i > 0) B.paint.flat(x - h - 3.6, z - h + 0.2, x - h - 3.2, z, 0.012, 0xe6e6e6);
      if (i < W.GRID) B.paint.flat(x + h + 3.2, z, x + h + 3.6, z + h - 0.2, 0.012, 0xe6e6e6);
    }

    // ---------- blocks
    for (let bx = 0; bx < W.GRID; bx++) for (let bz = 0; bz < W.GRID; bz++) {
      const minX = roadPos(bx) + W.ROAD / 2, maxX = roadPos(bx + 1) - W.ROAD / 2;
      const minZ = roadPos(bz) + W.ROAD / 2, maxZ = roadPos(bz + 1) - W.ROAD / 2;
      const type = SPECIAL[bx + ',' + bz] || (rand() < 0.1 ? 'greens' : 'downtown');
      const blk = { bx, bz, minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, type };
      W.blocks.push(blk); W.blockMap[bx + ',' + bz] = blk;
      const sw = W.SIDEWALK, cx = blk.cx, cz = blk.cz;

      // sidewalk slab with granite curb
      B.walk.box(minX + 0.3, 0, minZ + 0.3, maxX - 0.3, 0.2, maxZ - 0.3, 0xffffff, 3);
      B.trim.box(minX, 0, minZ, maxX, 0.19, minZ + 0.3, 0x9a9893, 2, B.trim);
      B.trim.box(minX, 0, maxZ - 0.3, maxX, 0.19, maxZ, 0x9a9893, 2, B.trim);
      B.trim.box(minX, 0, minZ + 0.3, minX + 0.3, 0.19, maxZ - 0.3, 0x9a9893, 2, B.trim);
      B.trim.box(maxX - 0.3, 0, minZ + 0.3, maxX, 0.19, maxZ - 0.3, 0x9a9893, 2, B.trim);

      // lamps along the curb, arms over the road
      [[minX + 0.9, cz, -Math.PI / 2], [maxX - 0.9, cz, Math.PI / 2], [cx, minZ + 0.9, Math.PI], [cx, maxZ - 0.9, 0],
        [minX + 1.2, minZ + 1.2, -Math.PI * 0.75], [maxX - 1.2, maxZ - 1.2, Math.PI * 0.25]].forEach((l) => lamps.push(l));

      const ix0 = minX + sw + 1, ix1 = maxX - sw - 1, iz0 = minZ + sw + 1, iz1 = maxZ - sw - 1;

      if (type === 'downtown') {
        const central = Math.max(Math.abs(bx - 2.5), Math.abs(bz - 2.5)) < 1.5;
        const lots = [];
        const p = rand();
        const mx = PD.lerp(ix0, ix1, 0.35 + rand() * 0.3), mz = PD.lerp(iz0, iz1, 0.35 + rand() * 0.3), gap = 1.5;
        if (p < 0.4) lots.push([ix0, iz0, mx - gap, mz - gap], [mx + gap, iz0, ix1, mz - gap], [ix0, mz + gap, mx - gap, iz1], [mx + gap, mz + gap, ix1, iz1]);
        else if (p < 0.65) lots.push([ix0, iz0, mx - gap, iz1], [mx + gap, iz0, ix1, iz1]);
        else if (p < 0.85) lots.push([ix0, iz0, ix1, mz - gap], [ix0, mz + gap, mx - gap, iz1], [mx + gap, mz + gap, ix1, iz1]);
        else lots.push([ix0 + 3, iz0 + 3, ix1 - 3, iz1 - 3]);
        B.walk.flat(ix0 - 1, iz0 - 1, ix1 + 1, iz1 + 1, 0.205, 0xd8d4cc, 3);
        lots.forEach((l) => {
          const big = (l[2] - l[0]) * (l[3] - l[1]) > 500;
          const tall = central && big && rand() < 0.7;
          const h = tall ? 40 + Math.floor(rand() * 9) * 3.3 : 10.6 + Math.floor(rand() * (central ? 8 : 5)) * 3.3;
          const r = rand();
          const style = tall ? 'curtain' : r < 0.42 ? 'brick' : r < 0.75 ? 'plaster' : 'panels';
          building(l[0], l[1], l[2], l[3], h, style, { shops: true });
        });
        for (let s = minX + 9; s < maxX - 8; s += 12) {
          if (rand() < 0.65) trees.push([s, minZ + 2, 0.75 + rand() * 0.2]);
          if (rand() < 0.65) trees.push([s, maxZ - 2, 0.75 + rand() * 0.2]);
        }
      } else if (type === 'greens' || type === 'park') {
        B.grass.flat(minX + sw, minZ + sw, maxX - sw, maxZ - sw, 0.205, 0xffffff, 6);
        B.walk.flat(cx - 1.6, minZ + sw, cx + 1.6, maxZ - sw, 0.21, 0xe0dbd0, 3);
        B.walk.flat(minX + sw, cz - 1.6, maxX - sw, cz + 1.6, 0.21, 0xe0dbd0, 3);
        for (let s = ix0 + 2; s <= ix1 - 2; s += 7) {
          trees.push([s, iz0 + 1, 0.95 + rand() * 0.3]);
          if (type === 'greens' || Math.abs(s - cx) > 8) trees.push([s, iz1 - 1, 0.95 + rand() * 0.3]);
        }
        for (let s = iz0 + 8; s <= iz1 - 8; s += 7) { trees.push([ix0 + 1, s, 1 + rand() * 0.3]); trees.push([ix1 - 1, s, 1 + rand() * 0.3]); }
        if (type === 'greens') { trees.push([cx + 10, cz + 10, 1.2]); trees.push([cx - 10, cz - 9, 1.2]); }
      } else if (type === 'hq') {
        B.walk.flat(minX + sw, minZ + sw, maxX - sw, maxZ - sw, 0.205, 0xcfcac0, 3);
        building(ix0 + 2, iz0, ix1 - 2, iz0 + 18, 16.6, 'panels', { shops: false });
        B.trim.box(ix0 + 2, 0, iz0 + 18, ix1 - 2, 1.2, iz0 + 18.3, 0x1f3a68, 4, B.trim);
        B.trim.box(cx - 5, 3.4, iz0 + 18, cx + 5, 3.7, iz0 + 21, 0x2a2f36, 4, B.trim); // entrance canopy
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4), signMat('PRECINCT 12  ★  POLICE', { bg: '#1f3a68', size: 60 }));
        sign.position.set(cx, 14.2, iz0 + 18.05); scene.add(sign);
        for (let k = -3; k <= 3; k++) B.paint.flat(cx + k * 4 - 0.07, iz0 + 22, cx + k * 4 + 0.07, iz0 + 28, 0.215, 0xeeeeee);
        [[-10, 25], [-2, 25], [6, 25]].forEach(([x, z]) => {
          const c = M().car({ police: true });
          c.position.set(cx + x, 0.2, iz0 + z); c.rotation.y = Math.PI;
          scene.add(c);
          W.dynColliders.push(PD.makeBox(cx + x - 1.1, cx + x + 1.1, iz0 + z - 2.5, iz0 + z + 2.5, 1.8));
        });
        M().cyl(scene, 0.07, 11, 0xcfd2d4, ix1 - 4, 5.7, iz1 - 2, M().mat(0xcfd2d4, { metalness: 1, roughness: 0.3 }));
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshStandardMaterial({ color: 0x2255aa, side: THREE.DoubleSide, roughness: 0.9 }));
        flag.position.set(ix1 - 2.85, 10.4, iz1 - 2); scene.add(flag);
        W.flag = flag;
        trees.push([ix0 + 1, iz1 - 1, 1], [ix1 - 1, iz1 - 8, 1]);
      } else if (type === 'store') {
        B.walk.flat(minX + sw, minZ + sw, maxX - sw, maxZ - sw, 0.205, 0xd2ccc0, 3);
        building(cx - 18, minZ + 4, cx + 18, minZ + 14, 6, 'plaster', { shops: true, noUpper: true });
        I.awning.add(cx, 3.5, minZ + 15.5, 0, 36, 0.15, 3.0, 0x9c1f1f);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.0), signMat('QUIK-STOP MARKET', { bg: '#b3261e', size: 64 }));
        sign.position.set(cx, 4.9, minZ + 14.06); scene.add(sign);
        building(ix0, iz0, cx - 19, minZ + 16, 23.2, 'brick', { shops: false });
        building(cx + 19, iz0, ix1, minZ + 16, 19.9, 'plaster', { shops: false });
      } else if (type === 'apartments') {
        B.grass.flat(minX + sw, minZ + sw, maxX - sw, maxZ - sw, 0.205, 0xffffff, 6);
        building(ix0, iz0, ix1, minZ + 18, 17.6, 'brick', { shops: false });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), signMat('ELM ST. APARTMENTS', { bg: '#4a2e24', size: 56 }));
        sign.position.set(cx + 6, 3.9, minZ + 18.06); scene.add(sign);
        B.walk.flat(cx - 2, minZ + 18, cx + 2, maxZ - sw, 0.21, 0xe0dbd0, 3);
        trees.push([ix0 + 1, iz1 - 1, 1], [ix1 - 1, iz1 - 1, 1]);
      } else if (type === 'lot') {
        B.road.flat(minX + sw, minZ + sw, maxX - sw, maxZ - sw, 0.205, 0xdddddd, 7);
        for (let k = -5; k <= 5; k++) {
          B.paint.flat(cx + k * 4 - 0.07, iz0, cx + k * 4 + 0.07, iz0 + 6, 0.212, 0xeeeeee);
          B.paint.flat(cx + k * 4 - 0.07, cz - 4, cx + k * 4 + 0.07, cz + 2, 0.212, 0xeeeeee);
        }
        building(ix0, minZ + 1, ix1, minZ + 4, 9, 'plaster', { shops: true, noUpper: true });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), signMat("LUCANO'S  ·  VALET", { bg: '#22313f', size: 60 }));
        sign.position.set(cx, 6.4, minZ + 4.06); scene.add(sign);
      } else if (type === 'warehouse') {
        B.walk.flat(minX + sw, minZ + sw, maxX - sw, maxZ - sw, 0.205, 0xc4c0b8, 3);
        B.metal.box(ix0, 0, iz0, ix1, 11, minZ + 16, 0xffffff, 4, B.roof);
        B.trim.box(cx - 4, 0, minZ + 16, cx + 4, 6, minZ + 16.15, 0x4e5a5b, 4, null);
        B.trim.box(ix0, 0, minZ + 16, ix1, 0.9, minZ + 16.1, 0x6a6a6a, 4, null);
        addCol(ix0, iz0, ix1, minZ + 16, 11);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), signMat('DOCKSIDE STORAGE', { bg: '#2c3e50', size: 60 }));
        sign.position.set(cx, 8.2, minZ + 16.12); scene.add(sign);
        [[ix0 + 1.5, cz + 4], [ix1 - 1.5, cz + 4]].forEach(([x, z], i) => {
          const c = M().prop('container', { color: i ? 0x2e6da4 : 0x9a3428, dark: i ? 0x21557f : 0x7d2a21 }).obj;
          c.position.set(x, 0.2, z); scene.add(c);
          addCol(x - 1.3, z - 3.1, x + 1.3, z + 3.1, 2.8);
        });
      }
    }

    // ---------- city edge
    const edge = W.LIMIT + 1;
    B.trim.box(-edge - 1, 0, -edge - 1, edge + 1, 0.9, -edge, 0xb5b2aa, 3);
    B.trim.box(-edge - 1, 0, edge, edge + 1, 0.9, edge + 1, 0xb5b2aa, 3);
    B.trim.box(-edge - 1, 0, -edge, -edge, 0.9, edge, 0xb5b2aa, 3);
    B.trim.box(edge, 0, -edge, edge + 1, 0.9, edge, 0xb5b2aa, 3);
    addCol(-edge - 50, -edge - 50, edge + 50, -edge, 3);
    addCol(-edge - 50, edge, edge + 50, edge + 50, 3);
    addCol(-edge - 50, -edge, -edge, edge, 3);
    addCol(edge, -edge, edge + 50, edge, 3);
    for (let k = 0; k < 170; k++) {
      const a = rand() * Math.PI * 2, d = edge + 7 + rand() * 60;
      const x = Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * d, z = Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * d;
      trees.push([x, z, 1.2 + rand() * 0.8, true]);
    }

    // ---------- materials & batched meshes
    const mats = {
      plaster: texMat('plaster', {}, 0.6),
      brick: texMat('brick', {}, 1.4),
      panels: texMat('panels', {}, 0.8),
      curtain: texMat('curtain', { metalness: 0.75 }, 0.4),
      metal: texMat('metal', { metalness: 0.6, color: 0x9aa3a8 }, 1.2),
      roof: texMat('asphalt', { color: 0x8a8580 }, 0.8),
      trim: texMat('concrete', {}, 0.5),
      road: texMat('asphalt', {}, 1.0),
      walk: texMat('concrete', {}, 1.0),
      grass: texMat('grass', {}, 1.2),
      paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    };
    const shadowCasters = { plaster: 1, brick: 1, panels: 1, curtain: 1, metal: 1, trim: 1 };
    Object.keys(B).forEach((k) => { const m = B[k].mesh(mats[k], !!shadowCasters[k]); if (m) scene.add(m); });
    Object.keys(I).forEach((k) => I[k].build(scene, k === 'awning' || k === 'ac', true));

    // ---------- trees
    const crownG = crownGeometry();
    const trunkG = new THREE.CylinderGeometry(0.14, 0.24, 3.8, 8); trunkG.translate(0, 1.9, 0);
    const leaves = PD.Tex.get('leaves', 4);
    const crownMat = new THREE.MeshStandardMaterial({ map: leaves.map, normalMap: leaves.normalMap, roughness: 0.85 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3a2c, roughness: 0.95 });
    const T1 = new Inst(trunkG, trunkMat), T2 = new Inst(crownG, crownMat);
    trees.forEach((t) => {
      const s = t[2], ry = rand() * 6.28, sy = s * (0.85 + rand() * 0.35);
      T1.add(t[0], 0.2, t[1], ry, s, sy, s);
      const tint = new THREE.Color().setHSL(0.2 + rand() * 0.08, 0.4 + rand() * 0.2, 0.7 + rand() * 0.2);
      T2.add(t[0], 0.2, t[1], ry, s, sy, s, tint.getHex());
      if (!t[3]) W.colliders.push(PD.makeBox(t[0] - 0.35, t[0] + 0.35, t[1] - 0.35, t[1] + 0.35, 5));
    });
    T1.build(scene, true); T2.build(scene, true);

    // ---------- street lamps
    const LI = new Inst(lampGeometry(), new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.7, roughness: 0.4 }));
    lamps.forEach((l) => {
      LI.add(l[0], 0.2, l[1], l[2]);
      W.colliders.push(PD.makeBox(l[0] - 0.25, l[0] + 0.25, l[1] - 0.25, l[1] + 0.25, 7));
    });
    LI.build(scene, true);

    // ---------- traffic signals (interior intersections, one per approach)
    const SI = new Inst(signalGeometry(), new THREE.MeshStandardMaterial({ color: 0x2c3a2c, metalness: 0.5, roughness: 0.5 }));
    const lensG = new THREE.CircleGeometry(0.13, 16);
    const LE = new Inst(lensG, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    W.signals = [];
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 1; i < W.GRID; i++) for (let j = 1; j < W.GRID; j++) {
      DIRS.forEach((d) => {
        const rx = -d[1], rz = d[0], off = W.ROAD / 2 + 1.0;
        const px = roadPos(i) - d[0] * off + rx * off, pz = roadPos(j) - d[1] * off + rz * off;
        const ry = Math.atan2(-d[0], -d[1]);
        SI.add(px, 0.2, pz, ry);
        W.colliders.push(PD.makeBox(px - 0.2, px + 0.2, pz - 0.2, pz + 0.2, 6));
        const cos = Math.cos(ry), sin = Math.sin(ry);
        const lens = [0.36, 0, -0.36].map((dy) => {
          const lx = -4.5, lz = 0.17;
          return LE.add(px + lx * cos + lz * sin, 5.65 + dy, pz - lx * sin + lz * cos, ry, 1, 1, 1, 0x222222);
        });
        W.signals.push({ axisX: d[0] !== 0, lens });
      });
    }
    SI.build(scene, true);
    W.lensMesh = LE.build(scene, false, false);
    W.signalPhase = -1;

    // ---------- curbside parked cars (static, merged per material)
    const PCOL = [0x8c1c13, 0x1d3557, 0xdedede, 0x2b2d2f, 0x5c6b73, 0x3a5a40, 0xa8a8a8, 0x6d2e46, 0x0b0b0b];
    let parked = 0;
    for (let i = 0; i <= W.GRID && parked < 26; i++) for (let j = 0; j < W.GRID && parked < 26; j++) {
      if (rand() > 0.32) continue;
      const along = PD.lerp(roadPos(j) + 16, roadPos(j + 1) - 16, rand());
      const side = rand() < 0.5 ? 1 : -1, horiz = rand() < 0.5;
      const x = horiz ? along : roadPos(i) + side * 5.6, z = horiz ? roadPos(i) + side * 5.6 : along;
      const bx = Math.floor((x + W.HALF) / W.CELL), bz = Math.floor((z + W.HALF) / W.CELL);
      if (SPECIAL[bx + ',' + bz] || SPECIAL[(horiz ? bx : bx - 1) + ',' + (horiz ? bz - 1 : bz)]) continue;
      const c = M().car({ color: PCOL[Math.floor(rand() * PCOL.length)] });
      // right-hand traffic: park facing the lane direction
      const ry = horiz ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? Math.PI : 0);
      c.position.set(x, 0, z); c.rotation.y = ry;
      scene.add(c);
      if (horiz) W.colliders.push(PD.makeBox(x - 2.45, x + 2.45, z - 1.0, z + 1.0, 1.6));
      else W.colliders.push(PD.makeBox(x - 1.0, x + 1.0, z - 2.45, z + 2.45, 1.6));
      parked++;
    }
  }

  World.prototype.block = function (bx, bz) { return this.blockMap[bx + ',' + bz]; };

  // Signal state for traffic travelling along x (axisX) or z: 'g' | 'y' | 'r'
  World.prototype.signal = function (axisX) {
    const t = this.signalT % 30;
    if (axisX) return t < 12 ? 'g' : t < 15 ? 'y' : 'r';
    return t < 15 ? 'r' : t < 27 ? 'g' : t < 30 ? 'y' : 'r';
  };
  World.prototype.hasSignal = function (i, j) { return i > 0 && j > 0 && i < this.GRID && j < this.GRID; };

  World.prototype.update = function (dt) {
    this.signalT += dt;
    const phase = this.signal(true) + this.signal(false);
    if (phase !== this.signalPhase && this.lensMesh) {
      this.signalPhase = phase;
      const OFF = new THREE.Color(0x1a1a1a);
      const ON = { r: new THREE.Color(6, 0.25, 0.1), y: new THREE.Color(6, 3.2, 0.2), g: new THREE.Color(0.3, 6, 1.8) };
      this.signals.forEach((s) => {
        const st = this.signal(s.axisX);
        this.lensMesh.setColorAt(s.lens[0], st === 'r' ? ON.r : OFF);
        this.lensMesh.setColorAt(s.lens[1], st === 'y' ? ON.y : OFF);
        this.lensMesh.setColorAt(s.lens[2], st === 'g' ? ON.g : OFF);
      });
      this.lensMesh.instanceColor.needsUpdate = true;
    }
    if (this.flag) {
      const t = this.signalT;
      this.flag.rotation.y = Math.sin(t * 1.3) * 0.25;
    }
  };

  World.prototype.groundHeight = function (x, z) {
    const W = this;
    const mx = ((x + W.HALF) % W.CELL + W.CELL) % W.CELL, mz = ((z + W.HALF) % W.CELL + W.CELL) % W.CELL;
    const onRoadX = mx < W.ROAD / 2 || mx > W.CELL - W.ROAD / 2;
    const onRoadZ = mz < W.ROAD / 2 || mz > W.CELL - W.ROAD / 2;
    if (onRoadX || onRoadZ || Math.abs(x) > W.HALF || Math.abs(z) > W.HALF) return 0;
    return 0.2;
  };

  World.prototype.nearestIntersection = function (x, z) {
    const W = this;
    const i = PD.clamp(Math.round((x + W.HALF) / W.CELL), 0, W.GRID);
    const j = PD.clamp(Math.round((z + W.HALF) / W.CELL), 0, W.GRID);
    return { i, j, x: W.roadPos(i), z: W.roadPos(j) };
  };

  World.prototype.route = function (fx, fz, tx, tz) {
    const a = this.nearestIntersection(fx, fz), b = this.nearestIntersection(tx, tz);
    const pts = [[fx, fz], [a.x, a.z]];
    if (Math.abs(fz - a.z) < Math.abs(fx - a.x)) pts.push([b.x, a.z]); else pts.push([a.x, b.z]);
    pts.push([b.x, b.z], [tx, tz]);
    return pts;
  };

  PD.World = World;
})(window.PD);
