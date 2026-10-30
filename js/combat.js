/*
 * Controlled tactical encounters. Only active during a case standoff:
 * the player's sidearm is holstered at all other times.
 * Suspects use simple cover AI (run to cover -> hide -> peek & shoot) and
 * surrender (non-lethal "incapacitated") when their health runs out.
 */
(function (PD) {
  'use strict';

  const tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3();

  function Combat(G) {
    this.G = G;
    this.enemies = [];
    this.covers = [];
    this.active = false;
    this.mag = 12; this.ammo = 12; this.reloadT = 0; this.fireCd = 0;
    this.onDone = null;

    // tracer + muzzle-flash pools
    this.tracers = [];
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
      l.frustumCulled = false;
      G.scene.add(l);
      this.tracers.push({ line: l, life: 0 });
    }
    this.flashes = [];
    const fg = new THREE.OctahedronGeometry(0.18);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true }));
      m.visible = false; G.scene.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }
  }

  Combat.prototype.tracer = function (a, b, color) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const p = t.line.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    t.line.material.color.setHex(color || 0xffe08a);
    t.line.material.opacity = 0.9; t.life = 0.07;
    const f = this.flashes.find((x) => x.life <= 0) || this.flashes[0];
    f.mesh.position.copy(a); f.mesh.visible = true; f.life = 0.05;
  };

  // list: [{mesh, x, z, name}]
  Combat.prototype.start = function (list, covers, onDone) {
    this.active = true;
    this.covers = covers;
    this.onDone = onDone;
    this.ammo = this.mag; this.reloadT = 0;
    this.enemies = list.map((e, i) => ({
      mesh: e.mesh, name: e.name, sx: e.x, sz: e.z, x: e.x, z: e.z,
      hp: 4, state: 'run', t: 0, spot: null, cover: null, shootCd: 1 + i * 0.4,
      crouch: 0, flinch: 0, heading: e.mesh.rotation.y, down: false, circle: { x: e.x, z: e.z, r: 0.45 },
    }));
    this.enemies.forEach((e) => { e.mesh.userData.gun.visible = true; this.pickCover(e); });
  };

  Combat.prototype.reset = function () {
    this.ammo = this.mag; this.reloadT = 0;
    this.enemies.forEach((e) => {
      e.x = e.sx; e.z = e.sz; e.hp = 4; e.state = 'run'; e.down = false; e.crouch = 0; e.shootCd = 1.5;
      e.mesh.userData.gun.visible = true;
      e.cover = null;
      this.pickCover(e);
    });
  };

  Combat.prototype.stop = function () {
    this.active = false;
    this.enemies = [];
  };

  Combat.prototype.alive = function () { return this.enemies.filter((e) => !e.down).length; };

  Combat.prototype.pickCover = function (e) {
    const p = this.G.player.pos;
    let best = null, bd = Infinity;
    this.covers.forEach((c) => {
      if (this.enemies.some((o) => o !== e && o.cover === c && !o.down)) return;
      const d = Math.hypot(c.x - e.x, c.z - e.z) + Math.max(0, 8 - Math.hypot(c.x - p.x, c.z - p.z)) * 3;
      if (d < bd) { bd = d; best = c; }
    });
    e.cover = best;
    e.spot = best ? this.coverSpot(best) : { x: e.x + (Math.random() - 0.5) * 6, z: e.z + (Math.random() - 0.5) * 6 };
  };

  // Spot on the far side of a cover object relative to the player.
  Combat.prototype.coverSpot = function (c) {
    const p = this.G.player.pos;
    let dx = c.x - p.x, dz = c.z - p.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const r = Math.max(c.hw, c.hd) + 0.8;
    return { x: c.x + dx * r, z: c.z + dz * r };
  };

  Combat.prototype.playerShoot = function (aiming) {
    const G = this.G, cam = G.camera;
    cam.getWorldDirection(tmpD);
    const spread = (aiming ? 0.006 : 0.03) + (G.player.moving ? 0.015 : 0);
    tmpD.x += (Math.random() - 0.5) * spread; tmpD.y += (Math.random() - 0.5) * spread; tmpD.z += (Math.random() - 0.5) * spread;
    tmpD.normalize();
    // start the ray level with the player to ignore objects behind the officer
    const skip = Math.max(0, cam.position.distanceTo(G.player.pos) - 1.2);
    const o = cam.position.clone().addScaledVector(tmpD, skip);
    let best = PD.raycastBoxes(o.x, o.y, o.z, tmpD.x, tmpD.y, tmpD.z, 150, G.world.lists), hit = null, head = false;
    this.enemies.forEach((e) => {
      if (e.down) return;
      const by = 0.2 + (e.crouch > 0.5 ? 0.75 : 1.2), hy = 0.2 + (e.crouch > 0.5 ? 1.12 : 1.75);
      const tb = PD.raySphere(o.x, o.y, o.z, tmpD.x, tmpD.y, tmpD.z, e.x, by, e.z, 0.42);
      const th = PD.raySphere(o.x, o.y, o.z, tmpD.x, tmpD.y, tmpD.z, e.x, hy, e.z, 0.22);
      if (th < best) { best = th; hit = e; head = true; }
      if (tb < best) { best = tb; hit = e; head = false; }
    });
    const end = o.clone().addScaledVector(tmpD, best);
    G.player.mesh.userData.gun.getWorldPosition(tmpV);
    this.tracer(tmpV.clone(), end);
    PD.Audio.gunshot(false);
    G.shake = Math.max(G.shake, 0.15);
    if (hit) {
      hit.hp -= head ? 2 : 1;
      hit.flinch = 0.35;
      PD.UI.hitmarker();
      if (hit.hp <= 0 && !hit.down) {
        hit.down = true;
        hit.state = 'down';
        hit.mesh.userData.gun.visible = false;
        PD.UI.toast(hit.name + ' is down — suspect in custody.', 'good');
        PD.Audio.good();
        G.addScore(100);
      } else if (hit.state === 'hide' || hit.state === 'peek') {
        hit.state = 'hide'; hit.t = 0.6;
      }
    }
  };

  Combat.prototype.enemyShoot = function (e) {
    const G = this.G, p = G.player;
    const ox = e.x, oy = 1.65, oz = e.z;
    let dx = p.pos.x - ox, dy = p.pos.y + 1.2 - oy, dz = p.pos.z - oz;
    const dist = Math.hypot(dx, dy, dz);
    dx /= dist; dy /= dist; dz /= dist;
    const wall = PD.raycastBoxes(ox, oy, oz, dx, dy, dz, dist, G.world.lists);
    const los = wall >= dist - 0.4;
    let chance = PD.clamp(0.42 - dist * 0.01, 0.12, 0.42) * (p.moving ? 0.6 : 1);
    if (G.mode === 'drive') chance *= 0.3;
    e.mesh.userData.gun.getWorldPosition(tmpV);
    const a = tmpV.clone();
    let b;
    if (los && Math.random() < chance) {
      b = new THREE.Vector3(p.pos.x, p.pos.y + 1.2, p.pos.z);
      if (G.mode === 'foot') {
        p.damage(8 + Math.random() * 5);
        PD.UI.damageFlash();
        PD.Audio.hurt();
      }
    } else {
      const t = los ? dist + 4 : wall;
      b = new THREE.Vector3(ox + dx * t + (Math.random() - 0.5) * 1.5, oy + dy * t + (Math.random() - 0.3), oz + dz * t + (Math.random() - 0.5) * 1.5);
    }
    this.tracer(a, b, 0xff9a6b);
    PD.Audio.gunshot(true);
  };

  Combat.prototype.update = function (dt, S, canShoot, aiming) {
    // fx
    this.tracers.forEach((t) => { if (t.life > 0) { t.life -= dt; t.line.material.opacity = t.life > 0 ? 0.9 : 0; } });
    this.flashes.forEach((f) => { if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.mesh.visible = false; } });
    if (!this.active) return;
    const G = this.G, p = G.player;

    // --- player weapon
    this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = this.mag;
    }
    if (canShoot) {
      if (S.reload && this.ammo < this.mag && this.reloadT <= 0) { this.reloadT = 1.4; PD.Audio.click(); }
      const wantFire = S.firePressed || (S.fire && this.fireCd < -0.15);
      if (wantFire && this.fireCd <= 0 && this.reloadT <= 0) {
        if (this.ammo > 0) {
          this.ammo--; this.fireCd = 0.22;
          this.playerShoot(aiming);
          if (this.ammo === 0) this.reloadT = 1.4;
        } else PD.Audio.click();
      }
    }

    // --- suspects
    let aliveCount = 0;
    this.enemies.forEach((e) => {
      const m = e.mesh;
      if (e.down) {
        e.crouch = PD.damp(e.crouch, 1, 5, dt);
        m.scale.y = (m.userData.baseScale || 1) * (1 - e.crouch * 0.25);
        PD.Models.animateHuman(m, dt, 0, { surrender: true });
        return;
      }
      aliveCount++;
      e.flinch -= dt;
      const toPx = p.pos.x - e.x, toPz = p.pos.z - e.z;
      const facePlayer = Math.atan2(toPx, toPz);
      let speed = 0, wantCrouch = 0;
      switch (e.state) {
        case 'run': {
          const dx = e.spot.x - e.x, dz = e.spot.z - e.z, d = Math.hypot(dx, dz);
          if (d < 0.5) { e.state = 'hide'; e.t = 0.8 + Math.random(); break; }
          speed = 4.6;
          e.x += (dx / d) * speed * dt; e.z += (dz / d) * speed * dt;
          e.heading = PD.dampAngle(e.heading, Math.atan2(dx, dz), 10, dt);
          break;
        }
        case 'hide':
          wantCrouch = e.cover ? 1 : 0;
          e.heading = PD.dampAngle(e.heading, facePlayer, 6, dt);
          e.t -= dt;
          if (e.t <= 0) {
            if (e.cover) {
              const s = this.coverSpot(e.cover);
              // player flanked us: relocate
              if (Math.hypot(s.x - e.x, s.z - e.z) > 2.2) { e.spot = s; e.state = 'run'; break; }
            }
            e.state = 'peek'; e.t = 1.3 + Math.random() * 1.3; e.shootCd = 0.35 + Math.random() * 0.3;
          }
          break;
        case 'peek':
          e.heading = PD.dampAngle(e.heading, facePlayer, 10, dt);
          if (e.flinch <= 0) {
            e.shootCd -= dt;
            if (e.shootCd <= 0) { this.enemyShoot(e); e.shootCd = 0.6 + Math.random() * 0.6; }
          }
          e.t -= dt;
          if (e.t <= 0) { e.state = 'hide'; e.t = 1.2 + Math.random() * 1.6; }
          break;
      }
      e.circle.x = e.x; e.circle.z = e.z;
      for (let l = 0; l < G.world.lists.length; l++) PD.resolveCircle(e.circle, 0.45, G.world.lists[l]);
      e.x = e.circle.x; e.z = e.circle.z;
      e.crouch = PD.damp(e.crouch, wantCrouch, 10, dt);
      m.position.set(e.x, G.world.groundHeight(e.x, e.z) - e.crouch * 0.05, e.z);
      m.scale.y = (m.userData.baseScale || 1) * (1 - e.crouch * 0.38);
      m.rotation.y = e.heading;
      PD.Models.animateHuman(m, dt, speed, { aim: e.state === 'peek' });
    });

    if (aliveCount === 0 && this.enemies.length) {
      this.active = false;
      if (this.onDone) this.onDone();
    }
  };

  Combat.prototype.circles = function () { return this.enemies.map((e) => e.circle); };

  PD.Combat = Combat;
})(window.PD);
