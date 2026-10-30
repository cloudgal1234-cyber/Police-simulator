/*
 * Runs the core loop: patrol -> dispatch -> respond -> investigate ->
 * (accuse | standoff) -> wrap-up -> patrol...
 */
(function (PD) {
  'use strict';

  const ringGeo = new THREE.RingGeometry(0.45, 0.62, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const gemGeo = new THREE.OctahedronGeometry(0.2);

  function marker(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    const gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color }));
    gem.position.y = 1.0;
    g.add(ring, gem);
    g.userData = { ring, gem };
    return g;
  }

  function CaseManager(G) {
    this.G = G;
    this.next = 0;
    this.state = 'patrol';
    this.timer = 7;
    this.c = null;
    this.group = null;
    this.clues = []; this.npcs = []; this.covers = [];
    this.found = []; this.foundSet = new Set();
    this.colliders = [];
    this.time = 0;
    this.talking = null;
    this.stats = null;

    const bg = new THREE.CylinderGeometry(2.2, 2.2, 140, 16, 1, true);
    bg.translate(0, 70, 0);
    this.beacon = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    this.beacon.visible = false;
    G.scene.add(this.beacon);
  }

  CaseManager.prototype.anchor = function () {
    const b = this.G.world.block(this.c.block[0], this.c.block[1]);
    return { x: b.cx, z: b.cz };
  };

  CaseManager.prototype.start = function () {
    const G = this.G;
    this.cleanup();
    this.c = PD.CASES[this.next % PD.CASES.length];
    this.next++;
    this.found = []; this.foundSet = new Set();
    this.time = 0;
    this.stats = { responseBonus: 0, wrong: 0, evidence: 0 };
    this.spawn();
    this.state = 'respond';
    const a = this.anchor();
    this.beacon.position.set(a.x, 0, a.z + 22);
    this.beacon.visible = true;
    PD.Audio.radio();
    PD.UI.radio('DISPATCH', this.c.dispatch);
    PD.UI.setObjective('Respond: ' + this.c.title, this.c.location + ' — follow the GPS route. Siren [H] for a faster-response bonus.');
  };

  CaseManager.prototype.spawn = function () {
    const G = this.G, c = this.c, a = this.anchor();
    const M = PD.Models;
    this.group = new THREE.Group();
    G.scene.add(this.group);
    this.clues = []; this.npcs = []; this.covers = []; this.colliders = [];

    const addProp = (p) => {
      const r = M.prop(p.type, p.o);
      const x = a.x + p.x, z = a.z + p.z, ry = p.ry || 0;
      r.obj.position.set(x, 0.2, z);
      r.obj.rotation.y = ry;
      this.group.add(r.obj);
      if (r.col) {
        const swap = Math.abs(Math.sin(ry)) > 0.7;
        const w = swap ? r.col.d : r.col.w, d = swap ? r.col.w : r.col.d;
        const oz = (r.col.oz || 0) * Math.cos(ry);
        const box = PD.makeBox(x - w / 2, x + w / 2, z + oz - d / 2, z + oz + d / 2, r.col.h + 0.2);
        this.colliders.push(box);
        G.world.dynColliders.push(box);
        if (p.cover) this.covers.push({ x, z: z + oz, hw: w / 2, hd: d / 2 });
      }
      return r.obj;
    };

    c.props.forEach(addProp);
    c.clues.forEach((cl) => {
      if (cl.prop) addProp({ type: cl.prop, x: cl.x, z: cl.z, ry: cl.ry });
      const mk = marker(0xffd54a);
      const x = a.x + cl.x, z = a.z + cl.z, y = 0.22 + (cl.y || 0);
      mk.position.set(x, y, z);
      this.group.add(mk);
      this.clues.push({ ev: cl.ev, x, z, y, marker: mk, done: false });
    });
    c.npcs.forEach((n) => {
      const mesh = M.human(n.look);
      const x = a.x + n.x, z = a.z + n.z;
      mesh.position.set(x, 0.2, z);
      mesh.rotation.y = n.ry || 0;
      this.group.add(mesh);
      const mk = marker(0x4fc3ff);
      mk.userData.ring.visible = false;
      mk.position.set(0, 1.4, 0);
      mesh.add(mk);
      this.npcs.push({ def: n, mesh, x, z, heading: n.ry || 0, asked: new Set(), circle: { x, z, r: 0.45 }, marker: mk, hostile: false, gone: false, flee: null });
    });
  };

  CaseManager.prototype.cleanup = function () {
    if (!this.group) return;
    this.G.scene.remove(this.group);
    const dyn = this.G.world.dynColliders;
    this.colliders.forEach((b) => { const i = dyn.indexOf(b); if (i >= 0) dyn.splice(i, 1); });
    this.group = null; this.clues = []; this.npcs = []; this.colliders = []; this.covers = [];
    this.beacon.visible = false;
  };

  CaseManager.prototype.has = function (req) {
    if (!req) return true;
    if (Array.isArray(req)) return req.every((r) => this.foundSet.has(r));
    return this.foundSet.has(req);
  };

  CaseManager.prototype.addEvidence = function (id) {
    if (this.foundSet.has(id)) return false;
    this.foundSet.add(id); this.found.push(id);
    this.G.addScore(50);
    this.refreshObjective();
    return true;
  };

  CaseManager.prototype.canAccuse = function () { return this.found.length >= this.c.minEvidence; };

  CaseManager.prototype.refreshObjective = function () {
    if (this.state !== 'investigate') return;
    const n = this.found.length, need = this.c.minEvidence;
    if (n < need) {
      PD.UI.setObjective(this.c.brief, 'Evidence ' + n + '/' + need + ' — inspect ◆ yellow clues and question ◆ blue witnesses. Notebook [Tab]');
    } else {
      PD.UI.setObjective('Enough evidence — make an accusation', 'Talk to your prime suspect and choose "Accuse". Wrong accusations cost points. (' + n + ' items)');
    }
  };

  // Circles used by the player for collision against NPCs.
  CaseManager.prototype.npcCircles = function () {
    return this.npcs.filter((n) => !n.gone && !n.hostile).map((n) => n.circle);
  };

  CaseManager.prototype.nearestInteractable = function () {
    if (this.state !== 'investigate') return null;
    const p = this.G.player.pos;
    let best = null, bd = Infinity;
    this.clues.forEach((cl) => {
      if (cl.done) return;
      const d = Math.hypot(cl.x - p.x, cl.z - p.z);
      if (d < 2.3 && d < bd) { bd = d; best = { kind: 'clue', obj: cl, label: 'Inspect evidence' }; }
    });
    this.npcs.forEach((n) => {
      if (n.gone || n.hostile) return;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < 2.8 && d < bd) { bd = d; best = { kind: 'npc', obj: n, label: 'Talk to ' + n.def.name + ' (' + n.def.role + ')' }; }
    });
    return best;
  };

  CaseManager.prototype.interact = function (it) {
    if (it.kind === 'clue') {
      const cl = it.obj, ev = this.c.evidence[cl.ev];
      cl.done = true;
      cl.marker.userData.gem.visible = false;
      cl.marker.userData.ring.material = cl.marker.userData.ring.material.clone();
      cl.marker.userData.ring.material.color.setHex(0x777777);
      cl.marker.userData.ring.material.opacity = 0.4;
      this.addEvidence(cl.ev);
      PD.Audio.clue();
      PD.UI.inspect(ev.name, ev.text);
    } else if (it.kind === 'npc') {
      this.talking = it.obj;
      PD.Audio.blip();
      this.npcMenu(it.obj, it.obj.def.intro);
    }
  };

  CaseManager.prototype.visibleTopics = function (n) {
    return n.def.topics.filter((t) => this.has(t.req));
  };

  CaseManager.prototype.npcMenu = function (n, text) {
    const d = n.def, opts = [];
    this.visibleTopics(n).forEach((t) => {
      const asked = n.asked.has(t.q);
      opts.push({
        label: (asked ? '✓ ' : t.req ? '★ ' : '') + t.q,
        cls: asked ? 'asked' : t.req ? 'lead' : '',
        onSelect: () => {
          n.asked.add(t.q);
          let reply = t.a;
          if (t.gives && this.addEvidence(t.gives)) {
            reply += '\n\n📒 Notebook: ' + this.c.evidence[t.gives].name;
            PD.Audio.clue();
          } else PD.Audio.blip();
          this.npcMenu(n, reply);
        },
      });
    });
    if (this.canAccuse()) {
      opts.push({ label: '⚖ Accuse ' + d.name, cls: 'accuse', onSelect: () => this.confirmAccuse(n) });
    }
    opts.push({ label: 'Goodbye', cls: 'bye', onSelect: () => this.endTalk() });
    PD.UI.dialogue(d.name, d.role, text, opts);
  };

  CaseManager.prototype.confirmAccuse = function (n) {
    PD.UI.dialogue(n.def.name, n.def.role,
      'Accuse ' + n.def.name + '? You have ' + this.found.length + ' pieces of evidence. A wrong accusation costs 150 points.',
      [
        { label: 'Yes — you\'re under arrest.', cls: 'accuse', onSelect: () => this.accuse(n) },
        { label: 'Not yet.', cls: 'bye', onSelect: () => this.npcMenu(n, 'Is there something else, officer?') },
      ]);
  };

  CaseManager.prototype.accuse = function (n) {
    const G = this.G;
    if (n.def.id !== this.c.culprit) {
      this.stats.wrong++;
      G.addScore(-150);
      PD.Audio.bad();
      PD.UI.toast('Wrong accusation! The evidence doesn\'t hold up (−150).', 'bad');
      this.npcMenu(n, n.def.wrong || 'You\'ve got nothing on me, officer.');
      return;
    }
    if (this.c.armed) {
      this.endTalk();
      this.startStandoff(n);
    } else {
      PD.Audio.good();
      PD.UI.dialogue(n.def.name, 'ARRESTED', this.c.arrestText, [
        { label: 'Cuff the suspect — case closed', cls: 'accuse', onSelect: () => { this.endTalk(); this.resolve(); } },
      ]);
      n.arrested = true;
    }
  };

  CaseManager.prototype.endTalk = function () {
    this.talking = null;
    PD.UI.closeDialogue();
  };

  CaseManager.prototype.startStandoff = function (culprit) {
    const G = this.G, a = this.anchor();
    this.state = 'standoff';
    culprit.hostile = true;
    const list = [{ mesh: culprit.mesh, x: culprit.x, z: culprit.z, name: culprit.def.name }];
    (this.c.accomplices || []).forEach((ac) => {
      const mesh = PD.Models.human(ac.look);
      const x = a.x + ac.x, z = a.z + ac.z;
      mesh.position.set(x, 0.2, z);
      this.group.add(mesh);
      list.push({ mesh, x, z, name: ac.name });
    });
    // bystanders flee away from the culprit
    this.npcs.forEach((n) => {
      if (n === culprit) return;
      let dx = n.x - culprit.x, dz = n.z - culprit.z;
      const l = Math.hypot(dx, dz) || 1;
      n.flee = { x: n.x + (dx / l) * 30, z: n.z + (dz / l) * 30 + 10, t: 3.5 };
      n.marker.visible = false;
    });
    G.player.armed = true;
    PD.Audio.gunshot(true);
    PD.UI.toast(this.c.standoffText, 'bad', 5);
    PD.UI.setObjective('Neutralise the armed suspects', 'Use cover! Aim [Right Mouse / LT], fire [Left Mouse / RT], reload [R / X].');
    G.combat.start(list, this.covers, () => {
      G.player.armed = false;
      PD.UI.toast('Area secure. All suspects in custody.', 'good', 4);
      this.resolve();
    });
  };

  CaseManager.prototype.resolve = function () {
    const G = this.G, c = this.c;
    this.state = 'wrapup';
    const evBonus = this.found.length * 25;
    const timeBonus = Math.max(0, Math.round(300 - this.time));
    const total = 500 + evBonus + timeBonus;
    G.addScore(total);
    G.solved++;
    this.beacon.visible = false;
    PD.Audio.good();
    G.showSummary({
      title: c.title,
      text: c.arrestText,
      rows: [
        ['Case solved', '+500'],
        ['Evidence collected', this.found.length + ' / ' + Object.keys(c.evidence).length + '  (+' + evBonus + ')'],
        ['Investigation speed', '+' + timeBonus],
        ['Code 3 response bonus', this.stats.responseBonus ? '+' + this.stats.responseBonus : '—'],
        ['Wrong accusations', this.stats.wrong ? this.stats.wrong + ' (−' + this.stats.wrong * 150 + ')' : 'None'],
      ],
      last: this.next % PD.CASES.length === 0,
    });
    PD.UI.setObjective('Case closed — return to your cruiser', 'Get back in the car [F] to resume patrol.');
  };

  CaseManager.prototype.target = function () {
    const G = this.G;
    if (!this.c) return null;
    const a = this.anchor();
    if (this.state === 'respond') return { x: a.x, z: a.z + 28, label: this.c.location };
    if (this.state === 'wrapup' && G.mode === 'foot') return { x: G.car.pos.x, z: G.car.pos.z, label: 'Your cruiser' };
    if ((this.state === 'investigate' || this.state === 'standoff')) {
      const ref = G.mode === 'drive' ? G.car.pos : G.player.pos;
      if (Math.hypot(ref.x - a.x, ref.z - a.z) > 38) return { x: a.x, z: a.z + 20, label: 'Crime scene' };
    }
    return null;
  };

  CaseManager.prototype.update = function (dt) {
    const G = this.G;
    const ref = G.mode === 'drive' ? G.car.pos : G.player.pos;
    switch (this.state) {
      case 'patrol':
        this.timer -= dt;
        if (this.group && this.c) {
          const a = this.anchor();
          if (Math.hypot(ref.x - a.x, ref.z - a.z) > 110) this.cleanup();
        }
        if (this.timer <= 0) this.start();
        break;
      case 'respond': {
        this.time += dt;
        const a = this.anchor();
        if (Math.hypot(ref.x - a.x, ref.z - (a.z + 26)) < 20) {
          this.state = 'investigate';
          this.beacon.visible = false;
          if (G.car.siren && this.time < 75) {
            this.stats.responseBonus = 150;
            G.addScore(150);
            PD.UI.toast('Code 3 response: +150', 'good');
          }
          this.time = 0;
          PD.UI.toast('Arrived on scene. Exit the vehicle [F / Y] to investigate.', 'info', 4);
          this.refreshObjective();
        }
        break;
      }
      case 'investigate':
      case 'standoff':
        this.time += dt;
        break;
      case 'wrapup':
        if (G.mode === 'drive') {
          this.state = 'patrol';
          this.timer = 12;
          PD.UI.setObjective('Patrol the city', 'Drive around and wait for the next dispatch call...');
        }
        break;
    }
    this.animate(dt);
  };

  CaseManager.prototype.animate = function (dt) {
    const G = this.G, p = G.player.pos;
    const t = performance.now() / 1000;
    this.clues.forEach((cl) => {
      if (cl.done) return;
      const u = cl.marker.userData;
      u.gem.position.y = 1.0 + Math.sin(t * 3 + cl.x) * 0.12;
      u.gem.rotation.y += dt * 2;
      const s = 1 + Math.sin(t * 4) * 0.1;
      u.ring.scale.set(s, 1, s);
    });
    this.npcs.forEach((n) => {
      if (n.gone || n.hostile) return;
      const m = n.mesh;
      if (n.flee) {
        const dx = n.flee.x - n.x, dz = n.flee.z - n.z, d = Math.hypot(dx, dz);
        n.flee.t -= dt;
        if (n.flee.t <= 0 || d < 0.5) { n.gone = true; m.visible = false; return; }
        n.x += (dx / d) * 6 * dt; n.z += (dz / d) * 6 * dt;
        n.heading = Math.atan2(dx, dz);
        m.position.set(n.x, G.world.groundHeight(n.x, n.z), n.z);
        m.rotation.y = n.heading;
        PD.Models.animateHuman(m, dt, 6);
        return;
      }
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      if (G.mode === 'foot' && d < 7) n.heading = PD.dampAngle(n.heading, Math.atan2(p.x - n.x, p.z - n.z), 4, dt);
      m.rotation.y = n.heading;
      PD.Models.animateHuman(m, dt, 0, { talk: this.talking === n });
      const pending = this.visibleTopics(n).some((tp) => !n.asked.has(tp.q));
      n.marker.visible = this.state === 'investigate' && (pending || this.canAccuse());
      n.marker.userData.gem.material.color.setHex(pending ? 0x4fc3ff : 0xff7043);
      n.marker.userData.gem.rotation.y += dt * 2;
      n.marker.position.y = 1.4 + Math.sin(t * 3 + n.x) * 0.08;
      if (n.arrested) PD.Models.animateHuman(m, dt, 0, { surrender: true });
    });
  };

  PD.CaseManager = CaseManager;
})(window.PD);
