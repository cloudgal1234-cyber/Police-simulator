/*
 * City: a GRID x GRID block layout separated by roads. Buildings are merged into
 * one vertex-coloured mesh (one draw call) with a procedural window texture.
 * Special blocks host the police HQ and the crime scenes.
 */
(function (PD) {
  'use strict';
  const M = () => PD.Models;

  // Feature blocks [bx,bz] -> type. Everything else is generated downtown.
  const SPECIAL = {
    '2,2': 'hq', '1,1': 'store', '4,1': 'park', '1,4': 'apartments', '4,4': 'lot', '5,2': 'warehouse',
  };
  const PALETTE = [0xe8d5b7, 0xc9b79c, 0x9fb4c7, 0xd98e73, 0xb8b8b8, 0xe6c27a, 0x8fa89b, 0xc7a2a2, 0xb0c4de, 0xd4c4a8, 0x9e9ac8, 0x7fa7a3];

  function windowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = Math.random() < 0.15 ? '#c9b26a' : '#4a5a6e';
      g.fillRect(x * 32 + 8, y * 32 + 6, 16, 18);
      g.fillStyle = '#e0e0e0';
      g.fillRect(x * 32 + 6, y * 32 + 24, 20, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }

  // Builds big merged non-indexed geometry from boxes / flat quads.
  function GeoBuilder() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  GeoBuilder.prototype.quad = function (a, b, c, d, n, uvs, col) {
    const V = [a, b, c, a, c, d], U = [uvs[0], uvs[1], uvs[2], uvs[0], uvs[2], uvs[3]];
    for (let i = 0; i < 6; i++) {
      this.p.push(V[i][0], V[i][1], V[i][2]);
      this.n.push(n[0], n[1], n[2]);
      this.uv.push(U[i][0], U[i][1]);
      this.c.push(col.r, col.g, col.b);
    }
  };
  // Axis-aligned box. win=true maps the window texture onto the walls.
  GeoBuilder.prototype.box = function (x0, y0, z0, x1, y1, z1, color, win) {
    const col = new THREE.Color(color);
    const T = 12, F = [0.02, 0.02];
    const w = (u, v) => (win ? [u / T, v / T] : F);
    const dx = x1 - x0, dz = z1 - z0;
    // +x
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [w(0, y0), w(dz, y0), w(dz, y1), w(0, y1)], col);
    // -x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [w(0, y0), w(dz, y0), w(dz, y1), w(0, y1)], col);
    // +z
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [w(0, y0), w(dx, y0), w(dx, y1), w(0, y1)], col);
    // -z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [w(0, y0), w(dx, y0), w(dx, y1), w(0, y1)], col);
    // top
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [F, F, F, F], col);
  };
  GeoBuilder.prototype.flat = function (x0, z0, x1, z1, y, color) {
    const F = [0.02, 0.02];
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [F, F, F, F], new THREE.Color(color));
  };
  GeoBuilder.prototype.mesh = function (material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  };

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
    W.trees = [];
    W.parked = []; // parked cars at HQ

    const rand = PD.rng(20241);
    const roadPos = (i) => -W.HALF + i * W.CELL;
    W.roadPos = roadPos;

    const tex = windowTexture();
    const bMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
    const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const build = new GeoBuilder(); // buildings (textured)
    const ground = new GeoBuilder(); // sidewalks, lots, markings
    const treeSpots = [], lampSpots = [];

    const addCol = (x0, z0, x1, z1, h) => W.colliders.push(PD.makeBox(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), h));

    // ---------- base ground
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: 0x6f9a52 }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.05; grass.receiveShadow = true;
    scene.add(grass);
    const asphaltSize = W.HALF * 2 + W.ROAD;
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(asphaltSize, asphaltSize), new THREE.MeshLambertMaterial({ color: 0x3b3f46 }));
    asphalt.rotation.x = -Math.PI / 2; asphalt.receiveShadow = true;
    scene.add(asphalt);

    // ---------- lane markings & crosswalks
    for (let i = 0; i <= W.GRID; i++) {
      const r = roadPos(i);
      for (let j = 0; j < W.GRID; j++) {
        const a = roadPos(j) + W.ROAD / 2 + 3, b = roadPos(j + 1) - W.ROAD / 2 - 3;
        for (let s = a; s < b - 2; s += 6) {
          ground.flat(s, r - 0.15, s + 3, r + 0.15, 0.02, 0xf2c94c); // along x
          ground.flat(r - 0.15, s, r + 0.15, s + 3, 0.02, 0xf2c94c); // along z
        }
      }
    }
    for (let i = 0; i <= W.GRID; i++) for (let j = 0; j <= W.GRID; j++) {
      const x = roadPos(i), z = roadPos(j), h = W.ROAD / 2;
      for (let k = -5; k <= 5; k += 2) {
        if (j > 0) ground.flat(x + k * 0.6 - 0.3, z - h - 2.6, x + k * 0.6 + 0.3, z - h - 0.4, 0.02, 0xeeeeee);
        if (j < W.GRID) ground.flat(x + k * 0.6 - 0.3, z + h + 0.4, x + k * 0.6 + 0.3, z + h + 2.6, 0.02, 0xeeeeee);
        if (i > 0) ground.flat(x - h - 2.6, z + k * 0.6 - 0.3, x - h - 0.4, z + k * 0.6 + 0.3, 0.02, 0xeeeeee);
        if (i < W.GRID) ground.flat(x + h + 0.4, z + k * 0.6 - 0.3, x + h + 2.6, z + k * 0.6 + 0.3, 0.02, 0xeeeeee);
      }
    }

    // ---------- blocks
    for (let bx = 0; bx < W.GRID; bx++) for (let bz = 0; bz < W.GRID; bz++) {
      const minX = roadPos(bx) + W.ROAD / 2, maxX = roadPos(bx + 1) - W.ROAD / 2;
      const minZ = roadPos(bz) + W.ROAD / 2, maxZ = roadPos(bz + 1) - W.ROAD / 2;
      let type = SPECIAL[bx + ',' + bz] || (rand() < 0.1 ? 'greens' : 'downtown');
      const blk = { bx, bz, minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, type };
      W.blocks.push(blk); W.blockMap[bx + ',' + bz] = blk;

      // sidewalk slab (raised) + inner lot surface
      const sw = W.SIDEWALK;
      ground.box(minX, 0, minZ, maxX, 0.18, maxZ, 0xb9b6ae, false);
      const inner = { downtown: 0xa9a59c, greens: 0x77b255, park: 0x77b255, hq: 0x9a9a9a, store: 0xbdb4a0, apartments: 0x8cbf6a, lot: 0x4a4e55, warehouse: 0xa7a39a }[type];
      ground.flat(minX + sw, minZ + sw, maxX - sw, maxZ - sw, 0.2, inner);

      // corner lamps
      lampSpots.push([minX + 1, minZ + 1], [maxX - 1, maxZ - 1], [minX + 1, maxZ - 1], [maxX - 1, minZ + 1]);

      const ix0 = minX + sw + 1, ix1 = maxX - sw - 1, iz0 = minZ + sw + 1, iz1 = maxZ - sw - 1;
      const cx = blk.cx, cz = blk.cz;

      if (type === 'downtown') {
        const central = Math.max(Math.abs(bx - 2.5), Math.abs(bz - 2.5)) < 1.5;
        const maxH = central ? 62 : 34;
        const lots = [];
        const p = rand();
        const mx = PD.lerp(ix0, ix1, 0.35 + rand() * 0.3), mz = PD.lerp(iz0, iz1, 0.35 + rand() * 0.3), gap = 1.5;
        if (p < 0.4) {
          lots.push([ix0, iz0, mx - gap, mz - gap], [mx + gap, iz0, ix1, mz - gap], [ix0, mz + gap, mx - gap, iz1], [mx + gap, mz + gap, ix1, iz1]);
        } else if (p < 0.65) {
          lots.push([ix0, iz0, mx - gap, iz1], [mx + gap, iz0, ix1, iz1]);
        } else if (p < 0.85) {
          lots.push([ix0, iz0, ix1, mz - gap], [ix0, mz + gap, mx - gap, iz1], [mx + gap, mz + gap, ix1, iz1]);
        } else {
          lots.push([ix0 + 4, iz0 + 4, ix1 - 4, iz1 - 4]);
        }
        lots.forEach((l) => {
          const h = 8 + Math.floor(rand() * (maxH - 8) / 3) * 3;
          const col = PALETTE[Math.floor(rand() * PALETTE.length)];
          build.box(l[0], 0, l[1], l[2], h, l[3], col, true);
          // cornice + rooftop unit
          const cc = new THREE.Color(col).multiplyScalar(0.75).getHex();
          build.box(l[0] - 0.3, h, l[1] - 0.3, l[2] + 0.3, h + 0.6, l[3] + 0.3, cc, false);
          if (rand() < 0.7) {
            const ux = PD.lerp(l[0], l[2], 0.3 + rand() * 0.3), uz = PD.lerp(l[1], l[3], 0.3 + rand() * 0.3);
            build.box(ux, h + 0.6, uz, ux + 3, h + 2.4, uz + 2.5, 0x8c8c8c, false);
          }
          // awning at street level
          if (rand() < 0.5) {
            const ac = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12][Math.floor(rand() * 4)];
            build.box(l[0] + 1, 3.2, l[3], l[2] - 1, 3.5, l[3] + 1.4, ac, false);
          }
          addCol(l[0], l[1], l[2], l[3], h + 2.4);
        });
        // street trees on the sidewalk
        for (let s = minX + 9; s < maxX - 8; s += 13) {
          if (rand() < 0.6) treeSpots.push([s, minZ + 1.8, 0.8]);
          if (rand() < 0.6) treeSpots.push([s, maxZ - 1.8, 0.8]);
        }
      } else if (type === 'greens' || type === 'park') {
        // park: trees around the edge, path cross in the middle
        ground.flat(cx - 1.5, minZ + sw, cx + 1.5, maxZ - sw, 0.22, 0xd8cfb8);
        ground.flat(minX + sw, cz - 1.5, maxX - sw, cz + 1.5, 0.22, 0xd8cfb8);
        for (let s = ix0 + 2; s <= ix1 - 2; s += 7) {
          treeSpots.push([s, iz0 + 1, 1.1]);
          if (type === 'greens' || Math.abs(s - cx) > 8) treeSpots.push([s, iz1 - 1, 1.1]);
        }
        for (let s = iz0 + 8; s <= iz1 - 8; s += 7) { treeSpots.push([ix0 + 1, s, 1.1]); treeSpots.push([ix1 - 1, s, 1.1]); }
        if (type === 'greens') { treeSpots.push([cx + 10, cz + 10, 1.2]); treeSpots.push([cx - 10, cz - 9, 1.2]); }
      } else if (type === 'hq') {
        const h = 16;
        build.box(ix0 + 2, 0, iz0, ix1 - 2, h, iz0 + 18, 0xdfe6ee, true);
        build.box(ix0 + 1.7, h, iz0 - 0.3, ix1 - 1.7, h + 0.8, iz0 + 18.3, 0x1f3a68, false);
        build.box(ix0 + 2, 0, iz0 + 18, ix1 - 2, 1.2, iz0 + 18.2, 0x1f3a68, false);
        addCol(ix0 + 2, iz0, ix1 - 2, iz0 + 18, h + 1);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), new THREE.MeshBasicMaterial({ map: PD.textTexture('★ POLICE ★', { bg: '#1f3a68' }) }));
        sign.position.set(cx, 12.5, iz0 + 18.05); scene.add(sign);
        // parking lines + parked cruisers
        for (let k = -3; k <= 3; k++) ground.flat(cx + k * 4 - 0.1, iz0 + 22, cx + k * 4 + 0.1, iz0 + 28, 0.22, 0xffffff);
        [[-10, 25], [-2, 25], [6, 25]].forEach(([x, z]) => {
          const c = M().car({ police: true });
          c.position.set(cx + x, 0.2, iz0 + z); c.rotation.y = Math.PI;
          scene.add(c);
          W.dynColliders.push(PD.makeBox(cx + x - 1.1, cx + x + 1.1, iz0 + z - 2.4, iz0 + z + 2.4, 1.8));
        });
        // flagpole
        const pole = M().box(scene, 0.15, 10, 0.15, 0xcccccc, ix1 - 4, 5, iz1 - 2);
        M().box(scene, 2, 1.2, 0.05, 0x2255aa, ix1 - 3, 9.2, iz1 - 2);
        void pole;
        treeSpots.push([ix0 + 1, iz1 - 1, 1], [ix1 - 1, iz1 - 8, 1]);
      } else if (type === 'store') {
        build.box(cx - 18, 0, minZ + 4, cx + 18, 6, minZ + 14, 0xf5e6c8, false);
        build.box(cx - 18.3, 6, minZ + 3.7, cx + 18.3, 6.6, minZ + 14.3, 0xc0392b, false);
        build.box(cx - 18, 3.4, minZ + 14, cx + 18, 3.7, minZ + 17, 0xc0392b, false); // awning
        build.box(cx - 14, 0.2, minZ + 14, cx - 6, 3, minZ + 14.1, 0x5f8db3, false);  // display windows
        build.box(cx + 6, 0.2, minZ + 14, cx + 14, 3, minZ + 14.1, 0x5f8db3, false);
        addCol(cx - 18, minZ + 4, cx + 18, minZ + 14, 6.6);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: PD.textTexture('QUIK-STOP MARKET', { bg: '#c0392b', size: 64 }) }));
        sign.position.set(cx, 5, minZ + 14.05); scene.add(sign);
        // neighbouring tall building filling the back corners
        build.box(ix0, 0, iz0, cx - 19, 22, minZ + 16, 0xb0c4de, true); addCol(ix0, iz0, cx - 19, minZ + 16, 22);
        build.box(cx + 19, 0, iz0, ix1, 18, minZ + 16, 0xd4c4a8, true); addCol(cx + 19, iz0, ix1, minZ + 16, 18);
      } else if (type === 'apartments') {
        build.box(ix0, 0, iz0, ix1, 18, minZ + 18, 0xd98e73, true);
        build.box(ix0 - 0.3, 18, iz0 - 0.3, ix1 + 0.3, 18.8, minZ + 18.3, 0x8e5a48, false);
        addCol(ix0, iz0, ix1, minZ + 18, 19);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshBasicMaterial({ map: PD.textTexture('ELM ST. APARTMENTS', { bg: '#5a3a2e', size: 56 }) }));
        sign.position.set(cx + 6, 4.2, minZ + 18.05); scene.add(sign);
        ground.flat(cx - 2, minZ + 18, cx + 2, maxZ - sw, 0.22, 0xd8cfb8);
        treeSpots.push([ix0 + 1, iz1 - 1, 1], [ix1 - 1, iz1 - 1, 1]);
      } else if (type === 'lot') {
        for (let k = -5; k <= 5; k++) {
          ground.flat(cx + k * 4 - 0.1, iz0, cx + k * 4 + 0.1, iz0 + 6, 0.22, 0xffffff);
          ground.flat(cx + k * 4 - 0.1, cz - 4, cx + k * 4 + 0.1, cz + 2, 0.22, 0xffffff);
        }
        // restaurant across the back
        build.box(ix0, 0, minZ + 1, ix1, 9, minZ + 4, 0x9e9ac8, false);
        addCol(ix0, minZ + 1, ix1, minZ + 4, 9);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshBasicMaterial({ map: PD.textTexture("LUCANO'S VALET", { bg: '#2c3e50', size: 60 }) }));
        sign.position.set(cx, 6.5, minZ + 4.05); scene.add(sign);
      } else if (type === 'warehouse') {
        build.box(ix0, 0, iz0, ix1, 11, minZ + 16, 0x7f8c8d, false);
        for (let k = 0; k < 8; k++) build.box(ix0 + 1 + k * 5.6, 0.3, minZ + 16, ix0 + 3.5 + k * 5.6, 10.5, minZ + 16.15, 0x6c7a7b, false);
        build.box(cx - 4, 0, minZ + 16, cx + 4, 6, minZ + 16.2, 0x4e5a5b, false); // roller door
        addCol(ix0, iz0, ix1, minZ + 16, 11);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.8), new THREE.MeshBasicMaterial({ map: PD.textTexture('DOCKSIDE STORAGE', { bg: '#34495e', size: 60 }) }));
        sign.position.set(cx, 8.2, minZ + 16.2); scene.add(sign);
        // perimeter containers
        [[ix0 + 1.5, cz + 4], [ix1 - 1.5, cz + 4]].forEach(([x, z], i) => {
          const c = M().prop('container', { color: i ? 0x2e86c1 : 0xb03a2e, dark: i ? 0x21618c : 0x922b21 }).obj;
          c.position.set(x, 0.2, z); scene.add(c);
          addCol(x - 1.3, z - 3.1, x + 1.3, z + 3.1, 2.8);
        });
      }
    }

    // ---------- city edge: low barrier + forest
    const edge = W.LIMIT + 1;
    ground.box(-edge - 1, 0, -edge - 1, edge + 1, 0.8, -edge, 0x888888, false);
    ground.box(-edge - 1, 0, edge, edge + 1, 0.8, edge + 1, 0x888888, false);
    ground.box(-edge - 1, 0, -edge, -edge, 0.8, edge, 0x888888, false);
    ground.box(edge, 0, -edge, edge + 1, 0.8, edge, 0x888888, false);
    addCol(-edge - 50, -edge - 50, edge + 50, -edge, 3);
    addCol(-edge - 50, edge, edge + 50, edge + 50, 3);
    addCol(-edge - 50, -edge, -edge, edge, 3);
    addCol(edge, -edge, edge + 50, edge, 3);
    for (let k = 0; k < 220; k++) {
      const a = rand() * Math.PI * 2, d = edge + 6 + rand() * 70;
      const x = Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * d, z = Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * d;
      treeSpots.push([x, z, 1.4 + rand(), true]);
    }

    const bMesh = build.mesh(bMat); bMesh.castShadow = true; bMesh.receiveShadow = true; scene.add(bMesh);
    const gMesh = ground.mesh(flatMat); gMesh.receiveShadow = true; scene.add(gMesh);

    // ---------- instanced trees
    const trunkG = new THREE.CylinderGeometry(0.18, 0.26, 1.8, 6); trunkG.translate(0, 0.9, 0);
    const crownG = new THREE.ConeGeometry(1.5, 3.6, 7); crownG.translate(0, 3.4, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x6d4c33 }), treeSpots.length);
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0xffffff }), treeSpots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), cl = new THREE.Color();
    treeSpots.forEach((t, i) => {
      const s = t[2];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
      ps.set(t[0], 0.2, t[1]); sc.set(s, s * (0.85 + rand() * 0.4), s);
      m4.compose(ps, q, sc);
      trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
      cl.setHSL(0.25 + rand() * 0.1, 0.45 + rand() * 0.2, 0.32 + rand() * 0.12);
      crowns.setColorAt(i, cl);
      if (!t[3]) W.colliders.push(PD.makeBox(t[0] - 0.4 * s, t[0] + 0.4 * s, t[1] - 0.4 * s, t[1] + 0.4 * s, 5));
    });
    trunks.castShadow = crowns.castShadow = true;
    scene.add(trunks, crowns);

    // ---------- instanced street lamps
    const poleG = new THREE.CylinderGeometry(0.1, 0.12, 6, 6); poleG.translate(0, 3, 0);
    const headG = new THREE.BoxGeometry(0.5, 0.25, 0.9); headG.translate(0, 6, 0);
    const poles = new THREE.InstancedMesh(poleG, new THREE.MeshLambertMaterial({ color: 0x4a4a4a }), lampSpots.length);
    const heads = new THREE.InstancedMesh(headG, new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0x887744 }), lampSpots.length);
    lampSpots.forEach((l, i) => {
      m4.makeTranslation(l[0], 0.2, l[1]);
      poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
      W.colliders.push(PD.makeBox(l[0] - 0.2, l[0] + 0.2, l[1] - 0.2, l[1] + 0.2, 6));
    });
    poles.castShadow = true;
    scene.add(poles, heads);
  }

  World.prototype.block = function (bx, bz) { return this.blockMap[bx + ',' + bz]; };

  World.prototype.groundHeight = function (x, z) {
    const W = this;
    // roads are the lines where (coord + HALF) mod CELL is within ROAD/2 of 0
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

  // GPS route along the road grid: L-shaped path through intersections.
  World.prototype.route = function (fx, fz, tx, tz) {
    const a = this.nearestIntersection(fx, fz), b = this.nearestIntersection(tx, tz);
    const pts = [[fx, fz], [a.x, a.z]];
    // go along whichever axis the start is already on first
    if (Math.abs(fz - a.z) < Math.abs(fx - a.x)) pts.push([b.x, a.z]); else pts.push([a.x, b.z]);
    pts.push([b.x, b.z], [tx, tz]);
    return pts;
  };

  PD.World = World;
})(window.PD);
