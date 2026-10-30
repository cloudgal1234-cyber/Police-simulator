/*
 * Police cruiser with arcade "bicycle model" handling:
 * engine force, braking, drag, lateral tyre grip (drift with handbrake),
 * speed-sensitive steering, two-circle collision against the city.
 */
(function (PD) {
  'use strict';

  const ENGINE = 15, MAX_SPEED = 38, REVERSE_MAX = 11, BRAKE = 30, WHEELBASE = 2.9;

  function PoliceCar(scene, world) {
    this.world = world;
    this.mesh = PD.Models.car({ police: true });
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2(); // x,z (y component = z)
    this.heading = 0;
    this.steer = 0;
    this.speed = 0; // signed forward speed m/s
    this.siren = false;
    this.lightT = 0;
    this.roll = 0; this.pitch = 0;
    this.crashCd = 0;
    this.occupied = true;
    this._n = {};
    this.circles = [{ x: 0, z: 0, r: 1.25 }, { x: 0, z: 0, r: 1.25 }];

    this.light = new THREE.PointLight(0xff0000, 0, 22, 2);
    this.light.position.set(0, 2.2, 0);
    this.mesh.add(this.light);
  }

  PoliceCar.prototype.place = function (x, z, heading) {
    this.pos.set(x, 0, z); this.heading = heading; this.vel.set(0, 0); this.speed = 0;
    this.sync();
  };

  PoliceCar.prototype.forward = function () { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; };

  PoliceCar.prototype.updateCircles = function () {
    const f = this.forward();
    this.circles[0].x = this.pos.x + f.x * 1.25; this.circles[0].z = this.pos.z + f.z * 1.25;
    this.circles[1].x = this.pos.x - f.x * 1.25; this.circles[1].z = this.pos.z - f.z * 1.25;
    return this.circles;
  };

  /**
   * ctl: {steer, throttle, brake, handbrake}; obstacles: array of circles (traffic).
   * Returns impact strength (0 if none) for camera shake / sound.
   */
  PoliceCar.prototype.update = function (dt, ctl, obstacles) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -Math.cos(this.heading), rz = Math.sin(this.heading);
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vR = this.vel.x * rx + this.vel.y * rz;

    // --- longitudinal
    const thr = ctl.throttle, brk = ctl.brake;
    if (thr > 0 && vF > -0.5) {
      vF += thr * ENGINE * (1 - Math.max(0, vF) / MAX_SPEED) * dt;
    }
    if (brk > 0) {
      if (vF > 0.5) vF -= brk * BRAKE * dt;
      else if (thr === 0) vF = Math.max(-REVERSE_MAX, vF - brk * 7 * dt); // reverse
    }
    if (thr > 0 && vF < -0.5) vF += thr * BRAKE * dt; // throttle brakes when reversing
    // rolling resistance + aero drag
    const drag = 0.35 + Math.abs(vF) * 0.012;
    vF -= vF * drag * dt * (thr > 0 || brk > 0 ? 0.3 : 1);
    if (thr === 0 && brk === 0 && Math.abs(vF) < 0.3) vF = 0;
    if (ctl.handbrake) vF -= vF * 1.6 * dt;

    // --- steering (less lock at speed, smoothed for keyboard)
    const maxLock = 0.62 / (1 + Math.abs(vF) / 16);
    this.steer = PD.damp(this.steer, ctl.steer * maxLock, ctl.steerRate || 10, dt);
    const yawRate = (vF / WHEELBASE) * Math.tan(this.steer) * (ctl.handbrake ? 1.35 : 1);
    this.heading -= yawRate * dt;

    // --- lateral grip (low grip under handbrake => drift)
    const grip = ctl.handbrake ? 1.6 : 9;
    vR *= Math.exp(-grip * dt);

    // rebuild world velocity on new heading
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -Math.cos(this.heading), nrz = Math.sin(this.heading);
    this.vel.x = nfx * vF + nrx * vR;
    this.vel.y = nfz * vF + nrz * vR;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // --- collisions: two circles vs boxes and obstacle circles
    let impact = 0;
    const circles = this.updateCircles();
    for (let k = 0; k < 2; k++) {
      const c = circles[k];
      const before = { x: c.x, z: c.z };
      let n = null;
      for (let l = 0; l < this.world.lists.length; l++) {
        const nn = PD.resolveCircle(c, c.r, this.world.lists[l], this._n);
        if (nn) n = { x: nn.x, z: nn.z };
      }
      if (obstacles && obstacles.length) {
        const nn = PD.resolveCircleCircles(c, c.r, obstacles, {});
        if (nn) n = nn;
      }
      if (n) {
        this.pos.x += c.x - before.x; this.pos.z += c.z - before.z;
        const vn = this.vel.x * n.x + this.vel.y * n.z;
        if (vn < 0) {
          this.vel.x -= n.x * vn * 1.25; this.vel.y -= n.z * vn * 1.25;
          this.vel.multiplyScalar(0.82);
          impact = Math.max(impact, -vn);
        }
        this.updateCircles();
      }
    }
    this._braking = brk > 0 && vF > 0.5;
    this.speed = this.vel.x * nfx + this.vel.y * nfz;

    // body roll / pitch for feel
    this.roll = PD.damp(this.roll, PD.clamp(-yawRate * vF * 0.004, -0.08, 0.08), 6, dt);
    this.pitch = PD.damp(this.pitch, PD.clamp((brk - thr) * 0.03 * Math.min(1, Math.abs(vF) / 6), -0.04, 0.05), 6, dt);

    // ground height (sidewalk curbs)
    this.pos.y = PD.damp(this.pos.y, this.world.groundHeight(this.pos.x, this.pos.z), 12, dt);

    this.crashCd -= dt;
    this.sync(dt);
    return impact > 3 && this.crashCd <= 0 ? (this.crashCd = 0.4, impact) : 0;
  };

  // Car parked / idle (no driver): just bleed velocity.
  PoliceCar.prototype.idle = function (dt) {
    return this.update(dt, { steer: 0, throttle: 0, brake: 0, handbrake: true }, null);
  };

  PoliceCar.prototype.sync = function (dt) {
    dt = dt || 0;
    const m = this.mesh, u = m.userData;
    m.position.copy(this.pos);
    m.rotation.set(0, this.heading, 0);
    u.body.rotation.z = this.roll;
    u.body.rotation.x = this.pitch;
    u.fronts.forEach((f) => { f.rotation.y = this.steer; });
    u.wheels.forEach((w) => { w.rotation.x += (this.speed / 0.42) * dt; });

    // light bar
    this.lightT += dt;
    if (this.siren) {
      // double-flash pattern: red twice, then blue twice
      const k = Math.floor(this.lightT * 10) % 8;
      const red = k === 0 || k === 2, blue = k === 4 || k === 6;
      u.lightRed.emissiveIntensity = red ? 9 : 0.05;
      u.lightBlue.emissiveIntensity = blue ? 12 : 0.05;
      this.light.color.setHex(red ? 0xff2020 : 0x2050ff);
      this.light.intensity = red || blue ? 40 : 0;
    } else {
      u.lightRed.emissiveIntensity = 0;
      u.lightBlue.emissiveIntensity = 0;
      this.light.intensity = 0;
    }
    const braking = this._braking;
    u.tail.forEach((t) => { t.material.emissiveIntensity = braking ? 3 : 0.5; });
  };

  PD.PoliceCar = PoliceCar;
})(window.PD);
