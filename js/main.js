/* Bootstrap, game loop, mode switching (drive <-> on foot) and cameras. */
(function (PD) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const IDLE = {
    steer: 0, throttle: 0, brake: 0, handbrake: false, moveX: 0, moveY: 0, turn: 0, lookX: 0, lookY: 0,
    run: false, fire: false, firePressed: false, aim: false, reload: false,
  };

  const G = PD.Game = {
    mode: 'drive', uiMode: 'welcome', score: 0, solved: 0, shake: 0,
    camYaw: 0, camMode: 0, aiming: false, downT: 0, pedCd: 0, hornCd: 0,
    setUiMode(m) {
      this.uiMode = m;
      if (m !== 'play' && document.pointerLockElement) document.exitPointerLock();
    },
    addScore(n) { this.score = Math.max(0, this.score + n); },
    showSummary(info) { PD.UI.summary(info); },
  };

  let renderer, scene, camera, last = performance.now();

  function init() {
    const canvas = $('game');
    const gfx = PD.Graphics.init(canvas);
    renderer = gfx.renderer; scene = gfx.scene; camera = gfx.camera;

    G.scene = scene; G.camera = camera; G.renderer = renderer;
    G.world = new PD.World(scene);
    G.car = new PD.PoliceCar(scene, G.world);
    G.player = new PD.Player(scene, G.world);
    G.traffic = new PD.Traffic(G.world, scene);
    G.combat = new PD.Combat(G);
    G.cases = new PD.CaseManager(G);
    PD.UI.init(G);

    // spawn in front of police HQ, eastbound lane
    const hq = G.world.block(2, 2);
    G.car.place(hq.cx, hq.maxZ + G.world.ROAD / 2 + G.world.LANE, Math.PI / 2);
    G.car.circles.forEach((c) => { c.isPlayer = true; });
    G.camYaw = G.car.heading;

    $('btn-start').onclick = startGame;
    $('btn-resume').onclick = resume;
    canvas.addEventListener('click', () => {
      if (G.mode === 'foot' && G.uiMode === 'play' && !document.pointerLockElement && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    requestAnimationFrame(frame);
  }

  function startGame() {
    PD.Audio.init();
    $('welcome').classList.add('hidden');
    $('hud').classList.remove('hidden');
    G.setUiMode('play');
    PD.UI.setObjective('Patrol the city', 'Get a feel for your cruiser. Dispatch will call shortly...');
    PD.UI.toast('Shift started. Good luck, officer!', 'good');
  }

  function pause() {
    G.setUiMode('pause');
    $('pause').classList.remove('hidden');
    PD.Audio.setEngine(false, 0, 0);
  }
  function resume() {
    $('pause').classList.add('hidden');
    PD.UI.calib.close();
    G.setUiMode('play');
  }

  // ------------------------------------------------------------ menus
  function handleMenus(S) {
    if (PD.UI.calib.isOpen) {
      if (S.back) PD.UI.calib.close();
      else if (S.confirm) PD.UI.calib.next();
      return;
    }
    switch (G.uiMode) {
      case 'welcome': if (S.confirm) startGame(); break;
      case 'pause': if (S.pause || S.back) resume(); break;
      case 'summary': if (S.confirm) PD.UI.summaryClose(); break;
      case 'dialogue': PD.UI.dialogueInput(S); break;
      case 'inspect': if (S.confirm || S.back || S.interact) PD.UI.closeInspect(); break;
      case 'notebook': if (S.notebook || S.back) PD.UI.closeNotebook(); break;
      case 'map': if (S.map || S.back) PD.UI.toggleMap(false); break;
      case 'play':
        if (S.pause) pause();
        else if (S.notebook) PD.UI.openNotebook();
        else if (S.map) PD.UI.toggleMap(true);
        break;
    }
  }

  // ------------------------------------------------------------ mode switching
  function exitCar() {
    const car = G.car, h = car.heading;
    // driver's door is on the left: left = (cos h, -sin h)
    G.player.place(car.pos.x + Math.cos(h) * 2.1, car.pos.z - Math.sin(h) * 2.1, h);
    G.player.mesh.visible = true;
    G.mode = 'foot';
    PD.Audio.setEngine(false, 0, 0);
  }

  function enterCar() {
    if (G.cases.state === 'standoff') { PD.UI.toast('You can\'t leave during an active standoff!', 'bad'); return; }
    G.mode = 'drive';
    G.player.mesh.visible = false;
    G.camYaw = G.car.heading;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function playerDown() {
    G.downT = 3;
    $('down-msg').classList.remove('hidden');
    PD.Audio.bad();
  }

  function respawnAfterDown() {
    $('down-msg').classList.add('hidden');
    const a = G.cases.anchor();
    G.player.place(a.x, a.z + 23, Math.PI);
    G.player.health = 100;
    G.combat.reset();
    G.addScore(-100);
    PD.UI.toast('Backup patched you up. Try a different approach — use cover! (−100)', 'bad', 5);
  }

  // ------------------------------------------------------------ simulation
  const obstacles = [];
  function simulate(dt, S, active) {
    const C = active && G.downT <= 0 ? S : IDLE;
    const car = G.car, player = G.player;
    let promptText = '';

    if (G.downT > 0) {
      G.downT -= dt;
      if (G.downT <= 0) respawnAfterDown();
    }

    if (G.mode === 'drive') {
      if (active) {
        if (S.siren) { car.siren = !car.siren; PD.Audio.setSiren(car.siren); PD.Audio.click(); }
        if (S.camera) G.camMode = (G.camMode + 1) % 2;
        if (S.horn && G.hornCd <= 0) { PD.Audio.horn(); G.hornCd = 0.4; }
        if (S.vehicle) {
          if (Math.abs(car.speed) < 3) exitCar();
          else PD.UI.toast('Slow down to exit the vehicle.', 'info', 1.5);
        }
      }
      obstacles.length = 0;
      G.traffic.cars.forEach((c) => obstacles.push(c.circle));
      G.cases.npcCircles().forEach((c) => obstacles.push(c));
      G.combat.circles().forEach((c) => obstacles.push(c));
      const keyboardSteer = PD.Input.keyDown('KeyA') || PD.Input.keyDown('KeyD') || PD.Input.keyDown('ArrowLeft') || PD.Input.keyDown('ArrowRight');
      const ctl = {
        steer: C.steer, throttle: C.throttle, brake: C.brake, handbrake: C.handbrake,
        steerRate: PD.Input.pad.connected && !keyboardSteer ? 22 : 7,
      };
      if (G.mode === 'drive') {
        const impact = car.update(dt, ctl, obstacles);
        if (impact) { PD.Audio.thud(impact / 15); G.shake = Math.min(0.6, impact * 0.04); }
        car.circles.forEach((c) => { c.speed = car.speed; });
        PD.Audio.setEngine(true, Math.abs(car.speed) / 38, ctl.throttle);
        if (G.cases.state === 'investigate' && Math.abs(car.speed) < 3) promptText = '<kbd>F</kbd> / <kbd>Y</kbd> Exit vehicle';
      }
    } else {
      car.idle(dt);
      G.aiming = active && player.armed && C.aim;
      obstacles.length = 0;
      car.updateCircles().forEach((c) => obstacles.push(c));
      G.cases.npcCircles().forEach((c) => obstacles.push(c));
      G.combat.enemies.forEach((e) => { if (!e.down) obstacles.push(e.circle); });
      player.update(dt, C, obstacles, G.aiming);

      const it = G.cases.nearestInteractable();
      const nearCar = Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z) < 3.6;
      if (active && G.downT <= 0) {
        if (it) {
          promptText = '<kbd>E</kbd> / <kbd>A</kbd> ' + it.label;
          if (S.interact) { G.cases.interact(it); }
        } else if (nearCar) {
          promptText = '<kbd>F</kbd> / <kbd>Y</kbd> Enter cruiser';
        }
        if (S.vehicle && nearCar) enterCar();
      }
    }

    // ambient traffic & pedestrians
    G.hornCd -= dt; G.pedCd -= dt;
    const pObs = G.mode === 'drive' ? car.circles : [player.circle];
    const res = G.traffic.update(dt, pObs, G.mode === 'drive' ? car : null);
    if (res.honk && Math.hypot(res.honk.x - car.pos.x, res.honk.z - car.pos.z) < 40) PD.Audio.horn();
    if (res.pedStruck && G.pedCd <= 0) {
      G.pedCd = 3; G.addScore(-50);
      PD.UI.toast('Watch out for pedestrians! (−50)', 'bad');
    }

    G.world.update(dt);
    G.cases.update(dt);
    G.combat.update(dt, C, active && G.mode === 'foot' && player.armed && G.downT <= 0, G.aiming);
    if (G.mode === 'foot' && player.health <= 0 && G.downT <= 0) playerDown();

    PD.UI.prompt(G.uiMode === 'play' ? promptText : '');
  }

  // ------------------------------------------------------------ camera
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), head = new THREE.Vector3();
  function updateCamera(dt) {
    const car = G.car, p = G.player;
    let fov = 65;
    if (G.mode === 'drive') {
      G.camYaw = PD.dampAngle(G.camYaw, car.heading, 3.5, dt);
      const fx = Math.sin(G.camYaw), fz = Math.cos(G.camYaw);
      if (G.camMode === 0) {
        const dist = 7.2 + Math.min(3, Math.abs(car.speed) * 0.08);
        camPos.set(car.pos.x - fx * dist, car.pos.y + 2.55, car.pos.z - fz * dist);
        look.set(car.pos.x + fx * 4, car.pos.y + 1.3, car.pos.z + fz * 4);
      } else {
        const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
        camPos.set(car.pos.x + hx * 0.2, car.pos.y + 1.45, car.pos.z + hz * 0.2);
        look.set(camPos.x + hx * 10, camPos.y - 0.4, camPos.z + hz * 10);
      }
      fov = 62 + Math.min(14, Math.abs(car.speed) * 0.35);
      camera.position.copy(camPos);
    } else {
      head.set(p.pos.x, p.pos.y + (G.aiming ? 1.75 : 1.62), p.pos.z);
      const aim = G.aiming;
      const dist = aim ? 2.4 : 3.6, shoulder = aim ? 0.85 : 0.4;
      const cp = Math.cos(p.camPitch), sp = Math.sin(p.camPitch);
      const fx = Math.sin(p.camYaw) * cp, fy = -sp, fz = Math.cos(p.camYaw) * cp;
      const rx = -Math.cos(p.camYaw), rz = Math.sin(p.camYaw);
      camPos.set(head.x - fx * dist + rx * shoulder, head.y - fy * dist, head.z - fz * dist + rz * shoulder);
      // keep the camera out of walls
      let dx = camPos.x - head.x, dy = camPos.y - head.y, dz = camPos.z - head.z;
      const len = Math.hypot(dx, dy, dz);
      dx /= len; dy /= len; dz /= len;
      const t = PD.raycastBoxes(head.x, head.y, head.z, dx, dy, dz, len, G.world.lists);
      if (t < len) camPos.set(head.x + dx * Math.max(0.3, t - 0.25), head.y + dy * Math.max(0.3, t - 0.25), head.z + dz * Math.max(0.3, t - 0.25));
      camPos.y = Math.max(0.4, camPos.y);
      look.set(camPos.x + fx * 20, camPos.y + fy * 20, camPos.z + fz * 20);
      camera.position.lerp(camPos, 1 - Math.exp(-25 * dt));
      fov = aim ? 48 : 65;
    }
    if (G.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * G.shake;
      camera.position.y += (Math.random() - 0.5) * G.shake;
      G.shake = Math.max(0, G.shake - dt * 1.5);
    }
    camera.lookAt(look);
    camera.fov = PD.damp(camera.fov, fov, 8, dt);
    camera.updateProjectionMatrix();

    // shadows follow the action
    PD.Graphics.follow(G.mode === 'drive' ? car.pos : p.pos);
  }

  // ------------------------------------------------------------ loop
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) dt = 0.001;

    PD.Input.update(dt);
    const S = PD.Input.state;
    const startMode = G.uiMode;
    handleMenus(S);
    const frozen = G.uiMode === 'welcome' || G.uiMode === 'pause' || G.uiMode === 'summary' || PD.UI.calib.isOpen;
    if (!frozen) simulate(dt, S, startMode === 'play' && G.uiMode === 'play');
    else if (G.uiMode !== 'welcome') PD.Audio.setEngine(false, 0, 0);
    updateCamera(frozen && G.uiMode === 'welcome' ? 0 : dt);
    if (G.uiMode === 'welcome') orbitWelcome(now);
    if (G.uiMode !== 'welcome') PD.UI.hud(dt);
    PD.Graphics.render(dt);
  }

  // slow orbit around the cruiser behind the welcome screen
  function orbitWelcome(now) {
    const t = now / 6000, c = G.car.pos;
    camera.position.set(c.x + Math.cos(t) * 14, 6, c.z + Math.sin(t) * 14);
    camera.lookAt(c.x, 1, c.z);
  }

  window.addEventListener('load', init);
})(window.PD);
