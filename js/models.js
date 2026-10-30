/* Procedural models: people, cars and props (PBR materials). All models face +Z. */
(function (PD) {
  'use strict';

  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  const SPHERE = new THREE.SphereGeometry(0.5, 24, 16);
  const RBox = THREE.addons.RoundedBoxGeometry;
  const matCache = {};

  function mat(color, extra) {
    const key = color + (extra ? JSON.stringify(extra) : '');
    if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, extra || {}));
    return matCache[key];
  }

  function box(parent, w, h, d, color, x, y, z, material) {
    const m = new THREE.Mesh(BOX, material || mat(color));
    m.scale.set(w, h, d);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  // Rounded box (bevelled edges catch light like real objects).
  const rbCache = {};
  function rbox(parent, w, h, d, r, material, x, y, z) {
    const k = [w, h, d, r].join(',');
    if (!rbCache[k]) rbCache[k] = new RBox(w, h, d, 3, r);
    const m = new THREE.Mesh(rbCache[k], material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  function cyl(parent, r, h, color, x, y, z, material) {
    const m = new THREE.Mesh(CYL, material || mat(color));
    m.scale.set(r * 2, h, r * 2);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  function mesh(parent, geo, material, x, y, z) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  // ----------------------------------------------------------------- people
  const SKINS = [0xd9b49c, 0xc99b80, 0xa87d62, 0x7d5641, 0xe3c4b0, 0x5e4130];
  const SHIRTS = [0x8e2b2b, 0x3a5a8c, 0x3e6b47, 0xb8913a, 0x5d3f73, 0x2e3a48, 0xb5652a, 0x2f7d74, 0xdedad2, 0x6c7378];
  const PANTS = [0x2a3442, 0x303b4a, 0x4a3a2e, 0x1d242e, 0x575757, 0x34507a];
  const HAIR = [0x2a1a10, 0x121212, 0x5a3a20, 0xb8955a, 0x8a8a8a, 0x7a3f1e];

  const G_LIMB = new THREE.CapsuleGeometry(1, 1, 6, 12);
  const G_HAIR = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);

  function randomLook(r) {
    r = r || Math.random;
    const pick = (a) => a[Math.floor(r() * a.length)];
    return { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR) };
  }

  const cloth = (c) => mat(c, { roughness: 0.92 });
  const skinMat = (c) => mat(c, { roughness: 0.6 });

  // Capsule of radius r whose straight section is `len` long (caps are stretched slightly).
  function limb(parent, r, len, material, x, y, z, sx, sz) {
    const m = mesh(parent, G_LIMB, material, x, y, z);
    m.scale.set(r * (sx || 1), (len + 2 * r) / 3, r * (sz || 1));
    return m;
  }

  function human(look) {
    look = Object.assign(randomLook(), look || {});
    const g = new THREE.Group();
    const s = look.scale || 1;
    const shirt = cloth(look.shirt), pants = cloth(look.pants), skin = skinMat(look.skin);
    const sleeve = cloth(look.sleeve || look.shirt), shoe = mat(look.shoes || 0x1a1a1a, { roughness: 0.5 });

    // legs (pivot at hip)
    const legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(0.105, 0.93, 0); legR.position.set(-0.105, 0.93, 0);
    [legL, legR].forEach((leg) => {
      limb(leg, 0.1, 0.36, pants, 0, -0.24, 0, 1.05, 1.1);
      limb(leg, 0.075, 0.38, pants, 0, -0.64, 0);
      rbox(leg, 0.12, 0.09, 0.28, 0.035, shoe, 0, -0.875, 0.045);
    });
    g.add(legL, legR);

    rbox(g, 0.38, 0.24, 0.25, 0.09, pants, 0, 0.97, 0);                   // pelvis
    const torso = limb(g, 0.19, 0.3, shirt, 0, 1.3, 0, 1.25, 0.78);
    limb(g, 0.1, 0.4, shirt, 0, 1.46, 0, 1, 0.9).rotation.z = Math.PI / 2; // shoulders
    if (look.vest) limb(g, 0.2, 0.26, cloth(look.vest), 0, 1.3, 0, 1.27, 0.82);
    if (look.belt !== false) {
      const belt = mesh(g, CYL, mat(0x151515, { roughness: 0.4 }), 0, 1.07, 0);
      belt.scale.set(0.4, 0.06, 0.27);
    }
    if (look.badge) {
      rbox(g, 0.05, 0.06, 0.02, 0.01, mat(0xd4af37, { metalness: 1, roughness: 0.3 }), 0.09, 1.4, 0.135);
      rbox(g, 0.1, 0.16, 0.08, 0.02, mat(0x151515, { roughness: 0.4 }), -0.22, 1.02, 0.02); // holster
      rbox(g, 0.12, 0.03, 0.02, 0.01, mat(0xd4af37, { metalness: 1, roughness: 0.3 }), -0.09, 1.4, 0.136); // name tag
    }
    if (look.scarf) { const sc = mesh(g, CYL, cloth(look.scarf), 0, 1.53, 0.01); sc.scale.set(0.24, 0.08, 0.2); }

    // arms
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(0.27, 1.47, 0); armR.position.set(-0.27, 1.47, 0);
    [armL, armR].forEach((arm) => {
      limb(arm, 0.07, 0.24, sleeve, 0, -0.17, 0);
      limb(arm, 0.058, 0.24, look.shortSleeve ? skin : sleeve, 0, -0.44, 0);
      mesh(arm, SPHERE, skin, 0, -0.62, 0.01).scale.set(0.1, 0.12, 0.08);
    });
    g.add(armL, armR);

    // neck & head
    mesh(g, CYL, skin, 0, 1.585, 0).scale.set(0.11, 0.12, 0.11);
    const head = mesh(g, SPHERE, skin, 0, 1.72, 0.005);
    head.scale.set(0.215, 0.255, 0.235);
    mesh(g, SPHERE, skin, 0, 1.705, 0.12).scale.set(0.035, 0.05, 0.04);           // nose
    const eye = mat(0x1a1410, { roughness: 0.2 });
    mesh(g, SPHERE, eye, 0.042, 1.74, 0.105).scale.setScalar(0.022);
    mesh(g, SPHERE, eye, -0.042, 1.74, 0.105).scale.setScalar(0.022);
    mesh(g, SPHERE, skin, 0.11, 1.72, 0).scale.set(0.03, 0.06, 0.04);             // ears
    mesh(g, SPHERE, skin, -0.11, 1.72, 0).scale.set(0.03, 0.06, 0.04);
    const hair = mesh(g, G_HAIR, mat(look.hair, { roughness: 0.85 }), 0, 1.745, -0.01);
    hair.scale.set(0.118, 0.13, 0.128);
    if (look.hat) {
      const hm = mat(look.hat, { roughness: 0.6 });
      mesh(g, CYL, hm, 0, 1.84, 0).scale.set(0.25, 0.08, 0.26);
      mesh(g, CYL, hm, 0, 1.885, 0.01).scale.set(0.28, 0.03, 0.29);
      const brim = mesh(g, CYL, mat(0x0a0a0a, { roughness: 0.3 }), 0, 1.81, 0.1);
      brim.scale.set(0.2, 0.015, 0.14);
      if (look.badge) rbox(g, 0.04, 0.04, 0.01, 0.005, mat(0xd4af37, { metalness: 1, roughness: 0.3 }), 0, 1.85, 0.13);
    }
    if (look.hood) { const hd = mesh(g, SPHERE, cloth(look.hood), 0, 1.69, -0.06); hd.scale.set(0.28, 0.32, 0.3); }

    // sidearm (hidden until drawn)
    const gun = new THREE.Group();
    const gm = mat(0x111111, { roughness: 0.35, metalness: 0.6 });
    rbox(gun, 0.035, 0.05, 0.2, 0.01, gm, 0, 0, 0.06);
    rbox(gun, 0.032, 0.11, 0.05, 0.01, gm, 0, -0.06, -0.01);
    gun.position.set(0, -0.67, 0.05);
    armR.add(gun);
    gun.visible = false;

    g.scale.setScalar(s);
    g.userData = { legL, legR, armL, armR, torso, head, gun, phase: Math.random() * 6, baseScale: s };
    return g;
  }

  function animateHuman(g, dt, speed, opts) {
    const u = g.userData;
    opts = opts || {};
    if (opts.surrender) {
      u.legL.rotation.x = u.legR.rotation.x = 0;
      u.armL.rotation.x = u.armR.rotation.x = -Math.PI * 0.95;
      return;
    }
    u.phase += dt * Math.max(speed, 0.0001) * 2.2;
    const amt = Math.min(1, speed / 3);
    const sw = Math.sin(u.phase) * 0.6 * amt;
    u.legL.rotation.x = sw;
    u.legR.rotation.x = -sw;
    u.armL.rotation.x = -sw * 0.7;
    u.armR.rotation.x = opts.aim ? -Math.PI / 2 : sw * 0.7;
    u.armL.rotation.z = 0.06; u.armR.rotation.z = -0.06;
    if (opts.aim) u.armL.rotation.x = -Math.PI / 2.3;
    // idle breathing / gesturing
    const t = performance.now() / 1000 + u.phase;
    u.torso.scale.x = 0.19 * 1.25 * (1 + Math.sin(t * 1.6) * 0.012);
    if (opts.talk) u.armL.rotation.x = -0.5 + Math.sin(t * 2.2) * 0.2;
  }

  // ----------------------------------------------------------------- cars
  // Side profile of a full-size sedan (x = length axis, y = height).
  function bodyShape() {
    const s = new THREE.Shape();
    s.moveTo(-2.36, 0.3);
    s.lineTo(-1.95, 0.3);
    s.absarc(-1.45, 0.3, 0.5, Math.PI, 0, true);
    s.lineTo(0.95, 0.3);
    s.absarc(1.45, 0.3, 0.5, Math.PI, 0, true);
    s.lineTo(2.36, 0.3);
    s.quadraticCurveTo(2.47, 0.31, 2.47, 0.48);
    s.lineTo(2.43, 0.76);
    s.quadraticCurveTo(2.38, 0.86, 2.12, 0.9);
    s.lineTo(0.95, 0.99);
    s.lineTo(-1.62, 1.02);
    s.lineTo(-2.28, 0.99);
    s.quadraticCurveTo(-2.46, 0.95, -2.46, 0.74);
    s.lineTo(-2.45, 0.46);
    s.quadraticCurveTo(-2.45, 0.3, -2.36, 0.3);
    return s;
  }
  function cabinShape() {
    const s = new THREE.Shape();
    s.moveTo(1.0, 0.96);
    s.quadraticCurveTo(0.45, 1.25, 0.12, 1.43);
    s.quadraticCurveTo(-0.45, 1.5, -0.95, 1.44);
    s.quadraticCurveTo(-1.4, 1.22, -1.72, 0.99);
    s.lineTo(1.0, 0.96);
    return s;
  }
  function extrude(shape, width, bevel) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18,
    });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }
  let BODY_G = null, CABIN_G = null, TIRE_G = null, RIM_G = null;
  function carGeos() {
    if (BODY_G) return;
    BODY_G = extrude(bodyShape(), 1.9, 0.07);
    CABIN_G = extrude(cabinShape(), 1.62, 0.06);
    const pts = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI; pts.push(new THREE.Vector2(0.3 + Math.cos(a) * 0.12, Math.sin(a) * 0.125)); }
    TIRE_G = new THREE.LatheGeometry(pts, 28); TIRE_G.rotateZ(Math.PI / 2);
    RIM_G = new THREE.CylinderGeometry(0.27, 0.27, 0.2, 24); RIM_G.rotateZ(Math.PI / 2);
  }

  function paint(color, metallic) {
    return new THREE.MeshPhysicalMaterial({ color, metalness: metallic ? 0.55 : 0.1, roughness: metallic ? 0.32 : 0.4, clearcoat: 1, clearcoatRoughness: 0.06 });
  }
  const GLASS = () => mat(0x0c1116, { metalness: 0.9, roughness: 0.06 });
  const CHROME = () => mat(0xdddddd, { metalness: 1, roughness: 0.15 });
  const PLASTIC = () => mat(0x161718, { roughness: 0.55 });
  const RUBBER = () => mat(0x1b1b1b, { roughness: 0.92 });

  function liveryTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#0a2a5c'; g.fillRect(0, 196, 1024, 22);
    g.fillStyle = '#c9a227'; g.fillRect(0, 220, 1024, 6);
    g.fillStyle = '#0a1a33';
    g.font = 'bold 118px Arial Black, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('POLICE', 600, 112);
    // badge star
    g.save(); g.translate(150, 112); g.fillStyle = '#c9a227';
    g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 30 : 70, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.fillStyle = '#0a2a5c'; g.font = 'bold 26px Arial'; g.fillText('12', 0, 6); g.restore();
    g.fillStyle = '#0a1a33'; g.font = 'bold 34px Arial'; g.fillText('DIAL 911', 900, 40);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }
  let LIVERY = null;

  function car(opts) {
    opts = opts || {};
    carGeos();
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const police = !!opts.police, van = !!opts.van;
    const bodyMat = paint(police ? 0x0b0c0e : (opts.color || 0x3366aa), !police);
    const glass = GLASS();

    if (van) {
      rbox(body, 2.0, 1.15, 4.7, 0.12, bodyMat, 0, 0.88, 0);
      rbox(body, 1.96, 1.2, 3.4, 0.18, bodyMat, 0, 2.0, -0.6);
      rbox(body, 1.86, 0.6, 0.12, 0.04, glass, 0, 1.9, 1.06);
      rbox(body, 2.0, 0.5, 1.2, 0.04, glass, 0, 1.9, 0.3);
      [-1.45, 1.45].forEach((z) => box(body, 1.75, 0.55, 1.15, 0x0a0a0a, 0, 0.55, z)); // wheel wells
    } else {
      mesh(body, BODY_G, bodyMat);
      mesh(body, CABIN_G, glass);
      // roof panel + pillars
      const roofMat = police ? paint(0xf2f2f0, false) : bodyMat;
      rbox(body, 1.6, 0.06, 1.12, 0.03, roofMat, 0, 1.465, -0.42);
      rbox(body, 1.64, 0.4, 0.09, 0.03, PLASTIC(), 0, 1.2, -0.28);        // B-pillars
      [-1.45, 1.45].forEach((z) => box(body, 1.72, 0.5, 1.12, 0x0a0a0a, 0, 0.56, z)); // wheel wells
      if (police) {
        if (!LIVERY) LIVERY = liveryTexture();
        const lm = new THREE.MeshPhysicalMaterial({ map: LIVERY, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06, polygonOffset: true, polygonOffsetFactor: -2 });
        const geo = new THREE.PlaneGeometry(2.25, 0.56);
        const r = new THREE.Mesh(geo, lm); r.position.set(-0.962, 0.69, -0.15); r.rotation.y = -Math.PI / 2; body.add(r);
        const l = new THREE.Mesh(geo, lm); l.position.set(0.962, 0.69, -0.15); l.rotation.y = Math.PI / 2; body.add(l);
        // push bar
        const pb = PLASTIC();
        box(body, 1.2, 0.08, 0.08, 0, 0, 0.75, 2.55, pb);
        box(body, 1.2, 0.08, 0.08, 0, 0, 0.45, 2.55, pb);
        box(body, 0.08, 0.42, 0.08, 0, 0.5, 0.6, 2.53, pb);
        box(body, 0.08, 0.42, 0.08, 0, -0.5, 0.6, 2.53, pb);
        // antenna + spotlight
        cyl(body, 0.008, 0.6, 0x111111, -0.5, 1.75, -0.9);
        cyl(body, 0.06, 0.12, 0, 0.92, 1.2, 0.85, CHROME());
      }
    }

    // bumpers, grille, mirrors, plates
    const pl = PLASTIC();
    rbox(body, 1.96, 0.24, 0.22, 0.08, pl, 0, 0.42, 2.38);
    rbox(body, 1.96, 0.24, 0.22, 0.08, pl, 0, 0.42, -2.38);
    if (!van) box(body, 0.9, 0.16, 0.05, 0, 0, 0.66, 2.45, mat(0x0a0a0a, { roughness: 0.3, metalness: 0.5 }));
    rbox(body, 0.18, 0.12, 0.12, 0.03, police ? pl : bodyMat, 0.98, 1.08, 0.82);
    rbox(body, 0.18, 0.12, 0.12, 0.03, police ? pl : bodyMat, -0.98, 1.08, 0.82);
    const plate = mat(0xf0f0f0, { roughness: 0.5 });
    box(body, 0.52, 0.12, 0.02, 0, 0, 0.45, 2.5, plate);
    box(body, 0.52, 0.12, 0.02, 0, 0, 0.62, -2.47, plate);

    const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.6, roughness: 0.1 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.5, roughness: 0.2 });
    const hz = van ? 2.4 : 2.47;
    rbox(body, 0.42, 0.13, 0.06, 0.02, head, 0.66, van ? 0.95 : 0.78, hz);
    rbox(body, 0.42, 0.13, 0.06, 0.02, head, -0.66, van ? 0.95 : 0.78, hz);
    const tailL = rbox(body, 0.44, 0.14, 0.06, 0.02, tail, 0.68, van ? 1.0 : 0.8, -2.5);
    const tailR = rbox(body, 0.44, 0.14, 0.06, 0.02, tail, -0.68, van ? 1.0 : 0.8, -2.5);

    // wheels
    const wheels = [], fronts = [];
    const rubber = RUBBER(), rim = mat(police ? 0x2a2a2a : 0xb8b8b8, { metalness: 1, roughness: 0.28 });
    [[0.86, 1.45], [-0.86, 1.45], [0.86, -1.45], [-0.86, -1.45]].forEach(([x, z], i) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.42, z);
      const w = new THREE.Group();
      mesh(w, TIRE_G, rubber);
      const r = mesh(w, RIM_G, rim);
      r.position.x = x > 0 ? 0.01 : -0.01;
      for (let k = 0; k < 5; k++) {
        const sp = box(w, 0.04, 0.42, 0.06, 0, x > 0 ? 0.1 : -0.1, 0, 0, rim);
        sp.rotation.x = (k / 5) * Math.PI;
      }
      pivot.add(w);
      g.add(pivot);
      wheels.push(w);
      if (i < 2) fronts.push(pivot);
    });

    let lightRed = null, lightBlue = null;
    if (police) {
      rbox(body, 1.36, 0.1, 0.34, 0.04, PLASTIC(), 0, 1.53, -0.3);
      lightRed = new THREE.MeshStandardMaterial({ color: 0x400808, emissive: 0xff1a1a, emissiveIntensity: 0, roughness: 0.15 });
      lightBlue = new THREE.MeshStandardMaterial({ color: 0x08103a, emissive: 0x1a40ff, emissiveIntensity: 0, roughness: 0.15 });
      rbox(body, 0.6, 0.14, 0.3, 0.05, lightRed, 0.33, 1.63, -0.3);
      rbox(body, 0.6, 0.14, 0.3, 0.05, lightBlue, -0.33, 1.63, -0.3);
      // grille strobes
      rbox(body, 0.12, 0.06, 0.03, 0.01, lightRed, 0.25, 0.66, 2.47);
      rbox(body, 0.12, 0.06, 0.03, 0.01, lightBlue, -0.25, 0.66, 2.47);
    }
    if (opts.taxi) {
      rbox(body, 0.7, 0.22, 0.28, 0.05, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe8a0, emissiveIntensity: 0.6 }), 0, 1.6, -0.4);
    }

    g.userData = { body, wheels, fronts, lightRed, lightBlue, tail: [tailL, tailR] };
    bake(body);
    wheels.forEach(bake);
    return g;
  }

  /*
   * Merge every mesh below `root` into one mesh per material (fewer draw calls).
   * Materials are shared, so emissive changes (lights) keep working.
   */
  function bake(root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map(), victims = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.clearGroups();
      if (!groups.has(o.material)) groups.set(o.material, []);
      groups.get(o.material).push(g);
      victims.push(o);
    });
    victims.forEach((o) => o.parent.remove(o));
    groups.forEach((list, material) => {
      const m = new THREE.Mesh(THREE.addons.mergeGeometries(list, false), material);
      m.castShadow = true; m.receiveShadow = true;
      root.add(m);
    });
    return root;
  }

  // ----------------------------------------------------------------- props
  // Each returns { obj, col } where col = collider half-size {w,d,h} or null.
  function prop(type, o) {
    o = o || {};
    const g = new THREE.Group();
    let col = null;
    switch (type) {
      case 'crate':
        box(g, 1.6, 1.4, 1.6, 0xb5803f, 0, 0.7, 0);
        box(g, 1.64, 0.14, 1.64, 0x8a5a2b, 0, 1.1, 0);
        box(g, 1.64, 0.14, 1.64, 0x8a5a2b, 0, 0.3, 0);
        col = { w: 1.6, d: 1.6, h: 1.4 }; break;
      case 'crates':
        box(g, 1.6, 1.4, 1.6, 0xb5803f, -0.85, 0.7, 0);
        box(g, 1.6, 1.4, 1.6, 0xa87436, 0.85, 0.7, 0);
        box(g, 1.5, 1.2, 1.5, 0xc08a48, 0, 2.0, 0);
        col = { w: 3.3, d: 1.6, h: 2.6 }; break;
      case 'barrel':
        cyl(g, 0.45, 1.1, 0x2e6da4, 0, 0.55, 0);
        col = { w: 0.9, d: 0.9, h: 1.1 }; break;
      case 'bench':
        box(g, 2.2, 0.1, 0.6, 0x8b5a2b, 0, 0.5, 0);
        box(g, 2.2, 0.5, 0.1, 0x8b5a2b, 0, 0.8, -0.28);
        box(g, 0.1, 0.5, 0.5, 0x333333, -0.95, 0.25, 0);
        box(g, 0.1, 0.5, 0.5, 0x333333, 0.95, 0.25, 0);
        col = { w: 2.2, d: 0.7, h: 1 }; break;
      case 'counter':
        box(g, o.w || 6, 1.1, 1.2, 0xd9d2c5, 0, 0.55, 0);
        box(g, (o.w || 6) + 0.1, 0.08, 1.3, 0x7a4f2b, 0, 1.12, 0);
        col = { w: o.w || 6, d: 1.2, h: 1.2 }; break;
      case 'register':
        box(g, 0.6, 0.3, 0.5, 0x333333, 0, 1.3, 0);
        box(g, 0.5, 0.12, 0.45, 0x777777, 0, 1.2, 0.3);   // drawer pulled out
        box(g, 0.3, 0.25, 0.05, 0x55ff99, 0, 1.55, -0.1, mat(0x113322, { emissive: 0x22aa55 }));
        break;
      case 'door':
        box(g, 0.15, 2.4, 0.15, 0x555555, -0.7, 1.2, 0);
        box(g, 0.15, 2.4, 0.15, 0x555555, 0.7, 1.2, 0);
        box(g, 1.55, 0.15, 0.15, 0x555555, 0, 2.4, 0);
        box(g, 1.25, 2.2, 0.05, 0, 0, 1.1, 0, mat(0x88aacc, { transparent: true, opacity: 0.45 }));
        break;
      case 'scarf':
        box(g, 0.25, 0.04, 0.12, 0xc0392b, 0, 1.1, 0.05); break;
      case 'paper':
        box(g, 0.25, 0.02, 0.35, 0xf5f5dc, 0, 0.03, 0); break;
      case 'flyer':
        box(g, 0.35, 0.02, 0.45, 0x7ed957, 0, 0.03, 0); break;
      case 'footprints':
        for (let i = 0; i < 6; i++) box(g, 0.14, 0.02, 0.3, 0x3b2a1a, (i % 2 ? 0.18 : -0.18), 0.02, i * 0.7 - 1.7);
        break;
      case 'drips':
        for (let i = 0; i < 7; i++) box(g, 0.12, 0.02, 0.12, 0x39ff14, Math.sin(i) * 0.4, 0.02, i * 0.8 - 2.4);
        break;
      case 'spraycan':
        cyl(g, 0.07, 0.25, 0x39ff14, 0, 0.12, 0).rotation.z = Math.PI / 2.4; break;
      case 'busstop':
        box(g, 4.5, 0.1, 1.6, 0x34495e, 0, 2.6, 0);
        box(g, 4.5, 2.5, 0.08, 0, 0, 1.3, -0.75, mat(0x99bbdd, { transparent: true, opacity: 0.5 }));
        box(g, 0.1, 2.6, 0.1, 0x444444, -2.2, 1.3, -0.75);
        box(g, 0.1, 2.6, 0.1, 0x444444, 2.2, 1.3, -0.75);
        box(g, 3.5, 0.1, 0.5, 0x8b5a2b, 0, 0.5, -0.4);
        box(g, 0.6, 1.6, 0.1, 0xf1c40f, 2.6, 1.6, 0.3);
        col = { w: 4.5, d: 0.3, h: 2.6, oz: -0.75 }; break;
      case 'dumpster':
        box(g, 3, 1.5, 1.6, 0x2e7d32, 0, 0.75, 0);
        box(g, 3.1, 0.12, 1.7, 0x1b5e20, 0, 1.56, 0);
        col = { w: 3, d: 1.6, h: 1.6 }; break;
      case 'statue': {
        box(g, 3, 1.2, 3, 0xbdb6a6, 0, 0.6, 0);
        box(g, 2.2, 0.4, 2.2, 0xa59e8e, 0, 1.4, 0);
        const st = human({ skin: 0x7f8c7a, shirt: 0x7f8c7a, pants: 0x7f8c7a, hair: 0x7f8c7a, shoes: 0x7f8c7a, scale: 1.5 });
        st.position.y = 1.6; g.add(st);
        st.userData.armR.rotation.x = -2.4;
        // the graffiti tag
        box(g, 2.0, 0.5, 0.05, 0x39ff14, 0, 0.7, 1.52, mat(0x39ff14, { emissive: 0x115511 }));
        col = { w: 3, d: 3, h: 4 }; break;
      }
      case 'easel':
        box(g, 0.08, 1.7, 0.08, 0x8b5a2b, -0.4, 0.85, 0).rotation.z = 0.15;
        box(g, 0.08, 1.7, 0.08, 0x8b5a2b, 0.4, 0.85, 0).rotation.z = -0.15;
        box(g, 1.0, 0.8, 0.05, 0xffffff, 0, 1.3, 0.05);
        box(g, 0.6, 0.4, 0.06, 0x2255cc, 0, 1.3, 0.06);
        break;
      case 'skateboard':
        box(g, 0.25, 0.05, 0.8, 0x39aa44, 0, 0.12, 0);
        break;
      case 'window':
        box(g, 2.2, 0.15, 0.3, 0xffffff, 0, 1.0, 0);
        box(g, 2.2, 0.15, 0.3, 0xffffff, 0, 2.4, 0);
        box(g, 0.15, 1.5, 0.3, 0xffffff, -1.05, 1.7, 0);
        box(g, 0.15, 1.5, 0.3, 0xffffff, 1.05, 1.7, 0);
        box(g, 1.0, 1.3, 0.04, 0, -0.4, 1.7, 0.2, mat(0x88aacc, { transparent: true, opacity: 0.5 })).rotation.y = 0.7;
        break;
      case 'glass':
        for (let i = 0; i < 9; i++) {
          const m = box(g, 0.15 + Math.random() * 0.1, 0.02, 0.1, 0, (Math.random() - 0.5) * 1.6, 0.03, (Math.random() - 0.5) * 1.2,
            mat(0xcfe8ff, { emissive: 0x334455 }));
          m.rotation.y = Math.random() * 3;
        }
        break;
      case 'keys':
        box(g, 0.08, 0.02, 0.08, 0xd4af37, 0, 0.02, 0);
        box(g, 0.04, 0.02, 0.2, 0xcccccc, 0.06, 0.02, 0.05);
        box(g, 0.04, 0.02, 0.2, 0xcccccc, -0.05, 0.02, 0.06);
        break;
      case 'shed':
        box(g, 4, 3, 3, 0x8d6e63, 0, 1.5, 0);
        box(g, 4.4, 0.2, 3.4, 0x5d4037, 0, 3.1, 0);
        box(g, 1.1, 2.1, 0.05, 0x4e342e, 0, 1.05, 1.52);
        col = { w: 4, d: 3, h: 3 }; break;
      case 'mailbox':
        box(g, 2.4, 1.6, 0.5, 0x7f8c8d, 0, 1.1, 0);
        for (let i = 0; i < 4; i++) box(g, 0.45, 0.3, 0.04, 0x95a5a6, -0.85 + i * 0.57, 1.4, 0.27);
        col = { w: 2.4, d: 0.5, h: 1.9 }; break;
      case 'flowerbed':
        box(g, 5, 0.5, 1.4, 0x8d6e63, 0, 0.25, 0);
        for (let i = 0; i < 6; i++) box(g, 0.4, 0.4, 0.4, [0xe74c3c, 0xf1c40f, 0x9b59b6][i % 3], -2 + i * 0.8, 0.65, 0);
        col = { w: 5, d: 1.4, h: 0.8 }; break;
      case 'bike':
        cyl(g, 0.38, 0.06, 0x111111, 0, 0.38, 0.55).rotation.z = Math.PI / 2;
        cyl(g, 0.38, 0.06, 0x111111, 0.15, 0.2, -0.5).rotation.z = Math.PI / 2.6;
        box(g, 0.06, 0.06, 1.0, 0xd35400, 0.05, 0.45, 0);
        box(g, 0.06, 0.5, 0.06, 0xd35400, 0, 0.6, -0.2).rotation.x = 0.4;
        g.rotation.z = Math.PI / 2.2;
        break;
      case 'chips':
        for (let i = 0; i < 6; i++) box(g, 0.08, 0.02, 0.08, 0x1f6fd1, (Math.random() - 0.5) * 0.8, 0.02, (Math.random() - 0.5) * 0.8);
        break;
      case 'booth':
        box(g, 2, 2.6, 2, 0xc0392b, 0, 1.3, 0);
        box(g, 2.2, 0.2, 2.2, 0x922b21, 0, 2.7, 0);
        box(g, 1.4, 0.8, 0.05, 0, 0, 1.6, 1.01, mat(0x99bbdd, { transparent: true, opacity: 0.6 }));
        box(g, 0.6, 0.06, 0.4, 0xffffff, 0.3, 1.15, 1.15); // ledger
        col = { w: 2, d: 2, h: 2.6 }; break;
      case 'parkedcar': {
        const c = car({ color: o.color || 0x1f6fd1 });
        g.add(c);
        if (o.damaged) {
          box(g, 0.5, 0.2, 0.1, 0x111111, 0.7, 0.72, 2.33);
          box(g, 0.8, 0.3, 0.2, 0x0f3f7a, 0.6, 0.55, 2.2).rotation.y = 0.3;
        }
        col = { w: 2.1, d: 4.7, h: 1.7 }; break;
      }
      case 'van': {
        const c = car({ color: o.color || 0xeeeeee, van: true });
        g.add(c);
        col = { w: 2.1, d: 4.7, h: 2.6 }; break;
      }
      case 'container':
        box(g, 2.6, 2.6, 6.2, o.color || 0xb03a2e, 0, 1.3, 0);
        for (let i = 0; i < 6; i++) box(g, 2.64, 2.4, 0.08, 0x00000, 0, 1.3, -2.8 + i * 1.12, mat(o.dark || 0x922b21));
        col = { w: 2.6, d: 6.2, h: 2.6 }; break;
      case 'forklift':
        box(g, 1.4, 1.0, 2.2, 0xf1c40f, 0, 0.8, 0);
        box(g, 1.2, 1.2, 0.08, 0x333333, 0, 1.9, -0.3);
        box(g, 0.08, 2.4, 0.08, 0x333333, 0.5, 1.5, 1.2);
        box(g, 0.08, 2.4, 0.08, 0x333333, -0.5, 1.5, 1.2);
        box(g, 0.12, 0.06, 1.2, 0x555555, 0.35, 0.2, 1.8);
        box(g, 0.12, 0.06, 1.2, 0x555555, -0.35, 0.2, 1.8);
        col = { w: 1.4, d: 2.6, h: 2.4 }; break;
      case 'casings':
        for (let i = 0; i < 3; i++) box(g, 0.05, 0.05, 0.12, 0xd4af37, i * 0.25 - 0.25, 0.03, Math.sin(i * 2) * 0.2,
          mat(0xd4af37, { emissive: 0x443300 }));
        break;
      case 'opencrate':
        box(g, 1.6, 0.9, 1.6, 0xb5803f, 0, 0.45, 0);
        for (let i = 0; i < 4; i++) box(g, 0.3, 0.05, 0.55, 0x222222, -0.5 + i * 0.33, 0.93, 0);
        box(g, 1.6, 0.08, 1.6, 0x8a5a2b, 1.0, 0.1, 0.4).rotation.y = 0.4;
        col = { w: 1.6, d: 1.6, h: 1.0 }; break;
      case 'padlock':
        box(g, 0.14, 0.18, 0.08, 0x999999, 0, 0.05, 0);
        box(g, 0.1, 0.1, 0.03, 0x666666, 0.12, 0.03, 0.05);
        break;
      case 'phone':
        box(g, 0.1, 0.02, 0.18, 0x111111, 0, 0.02, 0);
        box(g, 0.08, 0.005, 0.14, 0, 0, 0.032, 0, mat(0x2266aa, { emissive: 0x2266aa }));
        break;
      case 'cone': {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 8), mat(0xff6f00));
        c.position.y = 0.35; c.castShadow = true; g.add(c);
        break;
      }
      case 'tapepost':
        box(g, 0.08, 1.0, 0.08, 0x333333, 0, 0.5, 0);
        break;
      default:
        box(g, 0.5, 0.5, 0.5, 0xff00ff, 0, 0.25, 0);
    }
    return { obj: g, col };
  }

  PD.Models = { mat, box, rbox, cyl, mesh, paint, bake, human, animateHuman, car, prop, randomLook, BOX, SPHERE };
})(window.PD);
