/* On-foot officer: third-person movement with over-the-shoulder aiming. */
(function (PD) {
  'use strict';

  function Player(scene, world) {
    this.world = world;
    this.mesh = PD.Models.human({ shirt: 0x1f3a68, pants: 0x14213d, hat: 0x14213d, skin: 0xe0ac69, hair: 0x2b1b0e, badge: true, shoes: 0x111111 });
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.yaw = 0;          // body facing
    this.camYaw = 0;       // camera orbit
    this.camPitch = 0.25;
    this.health = 100;
    this.hurtT = 0;        // time since last damage
    this.armed = false;
    this.moving = false;
    this.speed = 0;
    this.circle = { x: 0, z: 0, r: 0.45, isPlayer: true, speed: 0 };
  }

  Player.prototype.place = function (x, z, yaw) {
    this.pos.set(x, this.world.groundHeight(x, z), z);
    this.yaw = yaw; this.camYaw = yaw;
    this.sync(0, 0, false);
  };

  // extraCircles: circles to collide with (car, NPCs)
  Player.prototype.update = function (dt, S, extraCircles, aiming) {
    this.camYaw -= S.lookX;
    this.camPitch = PD.clamp(this.camPitch + S.lookY, -0.45, 1.1);

    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
    let mx = fx * S.moveY + rx * S.moveX, mz = fz * S.moveY + rz * S.moveX;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const run = S.run && !aiming;
    const sp = aiming ? 2.6 : run ? 7.2 : 4.2;
    this.speed = PD.damp(this.speed, Math.min(1, len) * sp, 10, dt);
    this.moving = len > 0.1;
    if (this.moving) {
      const dirL = Math.hypot(mx, mz) || 1;
      this.pos.x += (mx / dirL) * this.speed * dt;
      this.pos.z += (mz / dirL) * this.speed * dt;
      if (!aiming) this.yaw = PD.dampAngle(this.yaw, Math.atan2(mx, mz), 12, dt);
    }
    if (aiming) this.yaw = PD.dampAngle(this.yaw, this.camYaw, 20, dt);

    const c = this.circle;
    c.x = this.pos.x; c.z = this.pos.z;
    for (let l = 0; l < this.world.lists.length; l++) PD.resolveCircle(c, c.r, this.world.lists[l]);
    if (extraCircles && extraCircles.length) PD.resolveCircleCircles(c, c.r, extraCircles);
    this.pos.x = c.x; this.pos.z = c.z;
    c.speed = this.speed;
    this.pos.y = PD.damp(this.pos.y, this.world.groundHeight(this.pos.x, this.pos.z), 15, dt);

    this.hurtT += dt;
    if (this.hurtT > 4 && this.health < 100) this.health = Math.min(100, this.health + 14 * dt);
    this.sync(dt, this.moving ? this.speed : 0, aiming);
  };

  Player.prototype.sync = function (dt, speed, aiming) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.mesh.userData.gun.visible = this.armed;
    PD.Models.animateHuman(this.mesh, dt, speed, { aim: aiming && this.armed });
  };

  Player.prototype.damage = function (n) {
    this.health = Math.max(0, this.health - n);
    this.hurtT = 0;
  };

  PD.Player = Player;
})(window.PD);
