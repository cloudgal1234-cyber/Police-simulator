/* Ambient life: AI traffic following road lanes, and pedestrians on sidewalks. */
(function (PD) {
  'use strict';

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const CAR_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f, 0xecf0f1, 0x34495e, 0x8e44ad, 0xd35400, 0x7f8c8d, 0x16a085];

  function TrafficCar(world, scene, rand) {
    this.world = world;
    const taxi = rand() < 0.15, van = !taxi && rand() < 0.15;
    this.mesh = PD.Models.car({ color: taxi ? 0xf1c40f : CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)], taxi, van });
    scene.add(this.mesh);
    this.rand = rand;
    this.maxSpeed = 8 + rand() * 5;
    this.speed = 0;
    this.circle = { x: 0, z: 0, r: 2.1 };
    this.honkCd = 0;
    this.spawn();
  }

  TrafficCar.prototype.spawn = function () {
    const W = this.world, r = this.rand;
    let i, j, d;
    for (;;) {
      i = Math.floor(r() * (W.GRID + 1)); j = Math.floor(r() * (W.GRID + 1));
      d = DIRS[Math.floor(r() * 4)];
      if (this.valid(i + d[0], j + d[1])) break;
    }
    this.i = i + d[0]; this.j = j + d[1]; this.dir = d; // heading toward intersection (i,j)
    const t = 0.2 + r() * 0.5;
    const ax = W.roadPos(i), az = W.roadPos(j), bx = W.roadPos(this.i), bz = W.roadPos(this.j);
    const rx = -d[1], rz = d[0];
    this.x = PD.lerp(ax, bx, t) + rx * W.LANE;
    this.z = PD.lerp(az, bz, t) + rz * W.LANE;
    this.heading = Math.atan2(d[0], d[1]);
    this.waypoints = [];
    this.planApproach();
  };

  TrafficCar.prototype.valid = function (i, j) { return i >= 0 && j >= 0 && i <= this.world.GRID && j <= this.world.GRID; };

  TrafficCar.prototype.lanePoint = function (i, j, d, along) {
    const W = this.world;
    return [W.roadPos(i) + d[0] * along + -d[1] * W.LANE, W.roadPos(j) + d[1] * along + d[0] * W.LANE];
  };

  TrafficCar.prototype.planApproach = function () {
    this.waypoints.push({ p: this.lanePoint(this.i, this.j, this.dir, -9), turn: true });
  };

  TrafficCar.prototype.chooseTurn = function () {
    const opts = DIRS.filter((d) => !(d[0] === -this.dir[0] && d[1] === -this.dir[1]) && this.valid(this.i + d[0], this.j + d[1]));
    const nd = opts.length ? opts[Math.floor(this.rand() * opts.length)] : [-this.dir[0], -this.dir[1]];
    this.waypoints.push({ p: this.lanePoint(this.i, this.j, nd, 8) });
    this.dir = nd;
    this.i += nd[0]; this.j += nd[1];
    this.planApproach();
  };

  TrafficCar.prototype.update = function (dt, obstacles) {
    const wp = this.waypoints[0];
    const dx = wp.p[0] - this.x, dz = wp.p[1] - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.5) {
      this.waypoints.shift();
      if (wp.turn) this.chooseTurn();
      return this.update(dt, obstacles);
    }
    const target = Math.atan2(dx, dz);
    this.heading = PD.dampAngle(this.heading, target, 3.2, dt);

    // look ahead for obstacles
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let want = this.maxSpeed;
    if (Math.abs(PD.wrapAngle(target - this.heading)) > 0.5) want *= 0.5; // slow in turns
    for (let k = 0; k < obstacles.length; k++) {
      const o = obstacles[k];
      if (o === this.circle) continue;
      const ox = o.x - this.x, oz = o.z - this.z;
      const ahead = ox * fx + oz * fz;
      if (ahead <= 0 || ahead > 13) continue;
      const lat = Math.abs(ox * -fz + oz * fx);
      if (lat < 2.6 + (o.r || 1) * 0.5) {
        want = Math.min(want, ahead < 6.5 ? 0 : this.maxSpeed * (ahead - 6.5) / 6.5);
        if (o.isPlayer && ahead < 7 && this.honkCd <= 0 && o.speed !== undefined && Math.abs(o.speed) < 1) {
          this.honkCd = 6 + this.rand() * 6;
          this.honk = true;
        }
      }
    }
    this.honkCd -= dt;
    this.speed = PD.damp(this.speed, want, want < this.speed ? 6 : 1.5, dt);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
    this.circle.x = this.x; this.circle.z = this.z;

    const m = this.mesh;
    m.position.set(this.x, 0, this.z);
    m.rotation.y = this.heading;
    m.userData.wheels.forEach((w) => { w.rotation.x += (this.speed / 0.42) * dt; });
  };

  // ------------------------------------------------------------ pedestrians
  function Pedestrian(world, scene, block, rand) {
    this.world = world;
    this.block = block;
    this.mesh = PD.Models.human(PD.Models.randomLook(rand));
    scene.add(this.mesh);
    this.inset = 2;
    const w = block.maxX - block.minX - this.inset * 2, d = block.maxZ - block.minZ - this.inset * 2;
    this.w = w; this.d = d; this.L = 2 * (w + d);
    this.s = rand() * this.L;
    this.speed = 1.1 + rand() * 0.6;
    this.dirSign = rand() < 0.5 ? 1 : -1;
    this.dodge = 0; this.dodgeX = 0; this.dodgeZ = 0;
    this.x = 0; this.z = 0; this.heading = 0;
    this.circle = { x: 0, z: 0, r: 0.5, ped: this };
    this.update(0);
  }

  Pedestrian.prototype.pathPos = function (s) {
    const b = this.block, i = this.inset, w = this.w, d = this.d;
    s = ((s % this.L) + this.L) % this.L;
    if (s < w) return [b.minX + i + s, b.minZ + i];
    s -= w; if (s < d) return [b.maxX - i, b.minZ + i + s];
    s -= d; if (s < w) return [b.maxX - i - s, b.maxZ - i];
    s -= w; return [b.minX + i, b.maxZ - i - s];
  };

  // car: {pos, speed} of the player cruiser (or null). Returns true if struck.
  Pedestrian.prototype.update = function (dt, car) {
    let struck = false;
    if (car && Math.abs(car.speed) > 3) {
      const dx = this.x - car.pos.x, dz = this.z - car.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 30 && this.dodge <= 0) {
        // jump out of the way, perpendicular to the car's motion
        const f = car.forward();
        const side = dx * -f.z + dz * f.x > 0 ? 1 : -1;
        this.dodgeX = -f.z * side * 6; this.dodgeZ = f.x * side * 6;
        this.dodge = 0.6;
        if (d2 < 6) struck = true;
      }
    }
    if (this.dodge > 0) {
      this.dodge -= dt;
      this.x += this.dodgeX * dt; this.z += this.dodgeZ * dt;
      if (this.dodge <= 0) {
        // snap back to path parameter nearest current position
        this.s = this.nearestS();
      }
      this.mesh.position.set(this.x, this.world.groundHeight(this.x, this.z), this.z);
      PD.Models.animateHuman(this.mesh, dt, 6);
      return struck;
    }
    this.s += this.speed * this.dirSign * dt;
    const p = this.pathPos(this.s), n = this.pathPos(this.s + this.dirSign * 0.5);
    this.x = p[0]; this.z = p[1];
    this.heading = PD.dampAngle(this.heading, Math.atan2(n[0] - p[0], n[1] - p[1]), 8, dt || 1);
    this.circle.x = this.x; this.circle.z = this.z;
    this.mesh.position.set(this.x, 0.2, this.z);
    this.mesh.rotation.y = this.heading;
    PD.Models.animateHuman(this.mesh, dt, this.speed);
    return struck;
  };

  Pedestrian.prototype.nearestS = function () {
    let best = 0, bd = Infinity;
    for (let s = 0; s < this.L; s += 1) {
      const p = this.pathPos(s), d = PD.dist2(p[0], p[1], this.x, this.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };

  function Traffic(world, scene) {
    const rand = PD.rng(777);
    this.cars = [];
    for (let k = 0; k < 16; k++) this.cars.push(new TrafficCar(world, scene, rand));
    this.peds = [];
    const blocks = world.blocks.filter((b) => b.type === 'downtown' || b.type === 'hq');
    for (let k = 0; k < 30; k++) this.peds.push(new Pedestrian(world, scene, blocks[k % blocks.length], rand));
    this.obstacles = [];
  }

  // player: {circles, isPlayer...}; returns {honk, pedStruck}
  Traffic.prototype.update = function (dt, playerObstacles, car) {
    const obs = this.obstacles;
    obs.length = 0;
    for (let k = 0; k < this.cars.length; k++) obs.push(this.cars[k].circle);
    for (let k = 0; k < playerObstacles.length; k++) obs.push(playerObstacles[k]);
    let honk = false, pedStruck = false;
    for (let k = 0; k < this.cars.length; k++) {
      const c = this.cars[k];
      c.update(dt, obs);
      if (c.honk) { c.honk = false; honk = c; }
    }
    for (let k = 0; k < this.peds.length; k++) if (this.peds[k].update(dt, car)) pedStruck = true;
    return { honk, pedStruck };
  };

  Traffic.prototype.carCircles = function () { return this.cars.map((c) => c.circle); };

  PD.Traffic = Traffic;
})(window.PD);
