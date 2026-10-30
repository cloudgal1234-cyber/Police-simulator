/* Low-poly procedural models: people, cars and props. All models face +Z. */
(function (PD) {
  'use strict';

  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const WHEEL = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  WHEEL.rotateZ(Math.PI / 2);
  const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const SPHERE = new THREE.SphereGeometry(0.5, 10, 8);
  const matCache = {};

  function mat(color, extra) {
    const key = color + (extra ? JSON.stringify(extra) : '');
    if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));
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

  function cyl(parent, r, h, color, x, y, z) {
    const m = new THREE.Mesh(CYL, mat(color));
    m.scale.set(r * 2, h, r * 2);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  // ----------------------------------------------------------------- people
  const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa0662f];
  const SHIRTS = [0xd94f4f, 0x4f7bd9, 0x5fb36a, 0xe0b040, 0x9b59b6, 0x34495e, 0xe67e22, 0x1abc9c, 0xecf0f1, 0x7f8c8d];
  const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1f2a36, 0x6d6d6d, 0x3b5998];
  const HAIR = [0x2b1b0e, 0x111111, 0x6b4423, 0xd9b26b, 0x8a8a8a, 0xa0522d];

  function randomLook(r) {
    r = r || Math.random;
    const pick = (a) => a[Math.floor(r() * a.length)];
    return { skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR) };
  }

  function human(look) {
    look = Object.assign(randomLook(), look || {});
    const g = new THREE.Group();
    const s = look.scale || 1;
    const legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(0.13, 0.9, 0); legR.position.set(-0.13, 0.9, 0);
    box(legL, 0.21, 0.9, 0.25, look.pants, 0, -0.45, 0);
    box(legR, 0.21, 0.9, 0.25, look.pants, 0, -0.45, 0);
    box(legL, 0.22, 0.12, 0.32, look.shoes || 0x222222, 0, -0.86, 0.04);
    box(legR, 0.22, 0.12, 0.32, look.shoes || 0x222222, 0, -0.86, 0.04);
    g.add(legL, legR);

    const torso = box(g, 0.56, 0.66, 0.32, look.shirt, 0, 1.24, 0);
    if (look.vest) box(g, 0.58, 0.5, 0.34, look.vest, 0, 1.3, 0);
    if (look.scarf) box(g, 0.4, 0.12, 0.36, look.scarf, 0, 1.6, 0.02);
    if (look.badge) box(g, 0.08, 0.08, 0.02, 0xf1c40f, 0.14, 1.42, 0.17);

    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(0.37, 1.52, 0); armR.position.set(-0.37, 1.52, 0);
    box(armL, 0.16, 0.6, 0.18, look.sleeve || look.shirt, 0, -0.3, 0);
    box(armR, 0.16, 0.6, 0.18, look.sleeve || look.shirt, 0, -0.3, 0);
    box(armL, 0.14, 0.14, 0.14, look.skin, 0, -0.66, 0);
    box(armR, 0.14, 0.14, 0.14, look.skin, 0, -0.66, 0);
    g.add(armL, armR);

    const head = box(g, 0.32, 0.34, 0.32, look.skin, 0, 1.76, 0);
    box(g, 0.34, 0.1, 0.34, look.hair, 0, 1.95, -0.01);
    if (look.hat) {
      box(g, 0.36, 0.12, 0.36, look.hat, 0, 2.0, 0);
      box(g, 0.34, 0.03, 0.16, look.hat, 0, 1.95, 0.22);
    }
    if (look.hood) box(g, 0.38, 0.38, 0.3, look.hood, 0, 1.8, -0.06);

    // Gun (hidden until drawn), attached to right hand
    const gun = box(armR, 0.08, 0.12, 0.3, 0x1a1a1a, 0, -0.7, 0.12);
    gun.visible = false;

    g.scale.setScalar(s);
    g.userData = { legL, legR, armL, armR, torso, head, gun, phase: Math.random() * 6, baseScale: s };
    return g;
  }

  // amount 0..1 walk intensity
  function animateHuman(g, dt, speed, opts) {
    const u = g.userData;
    opts = opts || {};
    if (opts.surrender) {
      u.legL.rotation.x = u.legR.rotation.x = 0;
      u.armL.rotation.x = u.armR.rotation.x = -Math.PI * 0.95;
      return;
    }
    u.phase += dt * speed * 2.4;
    const amt = Math.min(1, speed / 3);
    const sw = Math.sin(u.phase) * 0.7 * amt;
    u.legL.rotation.x = sw;
    u.legR.rotation.x = -sw;
    u.armL.rotation.x = -sw * 0.8;
    u.armR.rotation.x = opts.aim ? -Math.PI / 2 : sw * 0.8;
    if (opts.aim) u.armL.rotation.x = -Math.PI / 2.3;
    if (opts.talk) u.armL.rotation.x = -0.4 + Math.sin(u.phase * 0.6) * 0.15;
  }

  // ----------------------------------------------------------------- cars
  function car(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const color = opts.color || 0x3366aa;
    const police = !!opts.police;
    const van = !!opts.van;
    const glass = mat(0x223344, { emissive: 0x0a1018 });

    if (police) {
      box(body, 2.0, 0.62, 4.6, 0x15181f, 0, 0.62, 0);          // black lower body
      box(body, 2.03, 0.38, 2.0, 0xf4f4f4, 0, 0.74, -0.05);     // white doors
      box(body, 1.98, 0.08, 1.2, 0xf4f4f4, 0, 0.97, 1.6);       // white hood stripe
    } else {
      box(body, 2.0, van ? 1.1 : 0.62, 4.6, color, 0, van ? 0.85 : 0.62, 0);
    }
    if (van) {
      box(body, 1.95, 1.2, 3.2, color, 0, 1.95, -0.6);
      box(body, 1.8, 0.55, 0.1, 0, 0, 1.95, 1.0, glass);
    } else {
      box(body, 1.74, 0.58, 2.3, police ? 0x15181f : color, 0, 1.22, -0.25);
      box(body, 1.6, 0.48, 0.08, 0, 0, 1.2, 0.92, glass);    // windscreen
      box(body, 1.6, 0.44, 0.08, 0, 0, 1.2, -1.42, glass);   // rear window
      box(body, 1.77, 0.4, 1.9, 0, 0, 1.22, -0.25, glass);   // side windows
      box(body, 1.75, 0.07, 2.2, police ? 0xf4f4f4 : color, 0, 1.53, -0.25);
    }
    // bumpers and lights
    box(body, 2.04, 0.22, 0.2, 0x222222, 0, 0.42, 2.32);
    box(body, 2.04, 0.22, 0.2, 0x222222, 0, 0.42, -2.32);
    const head = mat(0xfff6d5, { emissive: 0xfff2b0, emissiveIntensity: 0.6 });
    const tail = police ? new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x660000 }) : mat(0xaa1111, { emissive: 0x660000 });
    box(body, 0.4, 0.15, 0.06, 0, 0.7, 0.72, 2.31, head);
    box(body, 0.4, 0.15, 0.06, 0, -0.7, 0.72, 2.31, head);
    const tailL = box(body, 0.4, 0.15, 0.06, 0, 0.7, 0.72, -2.31, tail);
    const tailR = box(body, 0.4, 0.15, 0.06, 0, -0.7, 0.72, -2.31, tail);

    // wheels (front ones in steering pivots)
    const wheelMat = mat(0x1b1b1b);
    const wheels = [], fronts = [];
    [[0.95, 1.45], [-0.95, 1.45], [0.95, -1.45], [-0.95, -1.45]].forEach(([x, z], i) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.42, z);
      const w = new THREE.Mesh(WHEEL, wheelMat);
      w.castShadow = true;
      pivot.add(w);
      const hub = box(pivot, 0.34, 0.3, 0.3, 0xbbbbbb, x > 0 ? 0.02 : -0.02, 0, 0);
      hub.castShadow = false;
      g.add(pivot);
      wheels.push(w);
      if (i < 2) fronts.push(pivot);
    });

    let lightRed = null, lightBlue = null;
    if (police) {
      box(body, 1.3, 0.12, 0.34, 0x222222, 0, 1.62, -0.3);
      lightRed = new THREE.MeshLambertMaterial({ color: 0x661111, emissive: 0x000000 });
      lightBlue = new THREE.MeshLambertMaterial({ color: 0x112266, emissive: 0x000000 });
      box(body, 0.55, 0.16, 0.3, 0, 0.33, 1.72, -0.3, lightRed);
      box(body, 0.55, 0.16, 0.3, 0, -0.33, 1.72, -0.3, lightBlue);
      box(body, 0.06, 0.18, 0.6, 0xf1c40f, 1.03, 0.78, -0.05);  // badge stripe
      box(body, 0.06, 0.18, 0.6, 0xf1c40f, -1.03, 0.78, -0.05);
    }
    if (opts.taxi) box(body, 0.6, 0.2, 0.3, 0xffffff, 0, 1.66, -0.3);

    g.userData = { body, wheels, fronts, lightRed, lightBlue, tail: [tailL, tailR] };
    return g;
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

  PD.Models = { mat, box, cyl, human, animateHuman, car, prop, randomLook, BOX, SPHERE };
})(window.PD);
