/* DOM HUD: objective tracker, minimap, speedometer, dialogue, notebook, menus. */
(function (PD) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let G = null;

  // ------------------------------------------------------------ controls guide
  const CONTROLS = [
    ['Driving', [
      ['Accelerate', 'W / ↑', 'RT · Throttle pedal'],
      ['Brake / Reverse', 'S / ↓', 'LT · Brake pedal'],
      ['Steer', 'A D / ← →', 'Left stick · Steering wheel'],
      ['Handbrake (drift)', 'Space', 'B'],
      ['Siren & lights', 'H', 'X'],
      ['Enter / exit cruiser', 'F', 'Y'],
      ['Horn', 'G', '—'],
      ['Camera view', 'C', 'LB'],
    ]],
    ['On foot', [
      ['Move', 'W A S D', 'Left stick (wheel: pedals walk)'],
      ['Look around', 'Mouse (click to lock) / ← →', 'Right stick (wheel: turn wheel)'],
      ['Run', 'Shift', 'L3'],
      ['Inspect / Talk', 'E', 'A'],
      ['Aim (standoffs only)', 'Right mouse', 'LT'],
      ['Fire (standoffs only)', 'Left mouse', 'RT (wheel: RB)'],
      ['Reload', 'R', 'X'],
    ]],
    ['General', [
      ['Dialogue choice', '1-9 · ↑↓ + Enter · click', 'D-pad + A, B = back'],
      ['Notebook (evidence)', 'Tab / J', 'RB'],
      ['City map', 'M', 'View / Back'],
      ['Pause & settings', 'Esc / P', 'Menu / Start'],
    ]],
  ];

  function controlsHTML() {
    return CONTROLS.map(([title, rows]) =>
      '<div class="ctl-group"><h3>' + title + '</h3><table><tr><th>Action</th><th>Keyboard / Mouse</th><th>Controller / Wheel</th></tr>' +
      rows.map((r) => '<tr><td>' + r[0] + '</td><td><kbd>' + r[1] + '</kbd></td><td><kbd>' + r[2] + '</kbd></td></tr>').join('') +
      '</table></div>').join('');
  }

  // ------------------------------------------------------------ toasts
  function toast(text, kind, secs) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), (secs || 3) * 1000);
    setTimeout(() => el.remove(), (secs || 3) * 1000 + 600);
  }

  function radio(from, text) {
    const el = $('radio');
    el.innerHTML = '<div class="radio-from">📻 ' + from + '</div><div>' + text + '</div>';
    el.classList.remove('hidden');
    clearTimeout(radio._t);
    radio._t = setTimeout(() => el.classList.add('hidden'), 9000);
  }

  function setObjective(title, sub) {
    $('obj-title').textContent = title;
    $('obj-sub').textContent = sub || '';
    const box = $('objective');
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  }

  // ------------------------------------------------------------ dialogue
  const dlg = { open: false, opts: [], sel: 0 };
  function dialogue(name, role, text, opts) {
    dlg.open = true; dlg.opts = opts; dlg.sel = 0;
    $('dl-name').textContent = name;
    $('dl-role').textContent = role;
    $('dl-text').textContent = text;
    const box = $('dl-options');
    box.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'dl-opt ' + (o.cls || '');
      b.innerHTML = '<span class="num">' + (i + 1) + '</span>' + escapeHTML(o.label);
      b.onclick = () => choose(i);
      b.onmouseenter = () => { dlg.sel = i; renderSel(); };
      box.appendChild(b);
    });
    renderSel();
    $('dialogue').classList.remove('hidden');
    G.setUiMode('dialogue');
  }
  function renderSel() {
    Array.from($('dl-options').children).forEach((b, i) => b.classList.toggle('sel', i === dlg.sel));
  }
  function choose(i) {
    const o = dlg.opts[i];
    if (!o) return;
    PD.Audio.click();
    o.onSelect();
  }
  function closeDialogue() {
    dlg.open = false;
    $('dialogue').classList.add('hidden');
    if (G.uiMode === 'dialogue') G.setUiMode('play');
  }
  function dialogueInput(S) {
    if (S.choice >= 0 && S.choice < dlg.opts.length) return choose(S.choice);
    if (S.up) { dlg.sel = (dlg.sel + dlg.opts.length - 1) % dlg.opts.length; renderSel(); PD.Audio.click(); }
    if (S.down) { dlg.sel = (dlg.sel + 1) % dlg.opts.length; renderSel(); PD.Audio.click(); }
    if (S.confirm) return choose(dlg.sel);
    if (S.back) {
      const bye = dlg.opts.findIndex((o) => o.cls === 'bye');
      if (bye >= 0) choose(bye);
    }
  }

  // ------------------------------------------------------------ inspect popup
  function inspect(title, text) {
    $('ins-title').textContent = title;
    $('ins-text').textContent = text;
    $('inspect').classList.remove('hidden');
    G.setUiMode('inspect');
  }
  function closeInspect() {
    $('inspect').classList.add('hidden');
    G.setUiMode('play');
  }

  // ------------------------------------------------------------ notebook
  function openNotebook() {
    const cm = G.cases, c = cm.c;
    let html = '<h2>📒 Case Notebook</h2>';
    if (!c || cm.state === 'patrol' || cm.state === 'respond') {
      html += '<p class="muted">' + (c && cm.state === 'respond' ? 'Responding to: <b>' + c.title + '</b><br>' + c.dispatch : 'No active investigation. Patrol the city and wait for dispatch.') + '</p>';
    } else {
      html += '<div class="nb-case"><b>' + c.title + '</b><br><span class="muted">' + c.location + '</span></div>';
      html += '<p>' + c.brief + '</p><p class="muted">Evidence: ' + cm.found.length + ' collected — ' + c.minEvidence + ' needed to make an accusation.</p>';
      html += '<div class="nb-list">';
      if (!cm.found.length) html += '<p class="muted">Nothing yet. Look for ◆ yellow markers and talk to witnesses (◆ blue).</p>';
      cm.found.forEach((id) => {
        const e = c.evidence[id];
        html += '<div class="nb-item ' + (e.kind === 'statement' ? 'stmt' : 'phys') + '"><div class="nb-kind">' +
          (e.kind === 'statement' ? '🗣 Statement' : '🔍 Physical evidence') + '</div><b>' + e.name + '</b><div>' + e.text + '</div></div>';
      });
      html += '</div><h3>Persons of interest</h3><div class="nb-people">';
      c.npcs.forEach((n) => { html += '<span class="tag">' + n.name + ' — ' + n.role + '</span>'; });
      html += '</div>';
    }
    html += '<p class="hint">[Tab] / [RB] / [Esc] to close</p>';
    $('notebook').innerHTML = html;
    $('notebook').classList.remove('hidden');
    G.setUiMode('notebook');
  }
  function closeNotebook() { $('notebook').classList.add('hidden'); G.setUiMode('play'); }

  // ------------------------------------------------------------ map drawing
  const BLOCK_COL = {
    downtown: '#8f8b84', greens: '#6aa84f', park: '#6aa84f', hq: '#5b7db8', store: '#d6a35c',
    apartments: '#c27b62', lot: '#55595f', warehouse: '#7d8a8b',
  };

  function drawMap(ctx, size, cx, cz, rot, scale, full) {
    const W = G.world;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#4d6b3c'; ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cz);
    const lim = W.HALF + W.ROAD / 2;
    ctx.fillStyle = '#2b2e33'; ctx.fillRect(-lim, -lim, lim * 2, lim * 2);
    W.blocks.forEach((b) => {
      ctx.fillStyle = BLOCK_COL[b.type] || '#888';
      ctx.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    });
    if (full) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (10 / scale * 1.4) + 'px Arial'; ctx.textAlign = 'center';
      const lbl = { hq: 'POLICE HQ', store: 'QUIK-STOP', park: 'GREENWAY PARK', apartments: 'ELM ST APTS', lot: "LUCANO'S", warehouse: 'DOCKSIDE' };
      W.blocks.forEach((b) => { if (lbl[b.type]) ctx.fillText(lbl[b.type], b.cx, b.cz); });
    }
    // traffic
    ctx.fillStyle = '#e6e6e6';
    G.traffic.cars.forEach((c) => { ctx.beginPath(); ctx.arc(c.x, c.z, 1.8, 0, 7); ctx.fill(); });

    // route + target
    const tgt = G.cases.target();
    const me = G.mode === 'drive' ? G.car.pos : G.player.pos;
    if (tgt) {
      const pts = W.route(me.x, me.z, tgt.x, tgt.z);
      ctx.strokeStyle = '#4fc3ff'; ctx.lineWidth = 3.2 / scale * (full ? 1.2 : 1.6); ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
    // car icon (when on foot)
    if (G.mode === 'foot') {
      ctx.fillStyle = '#ffffff';
      ctx.save(); ctx.translate(G.car.pos.x, G.car.pos.z); ctx.rotate(-G.car.heading);
      ctx.fillRect(-1.6, -2.6, 3.2, 5.2); ctx.restore();
    }
    // player arrow
    const h = G.mode === 'drive' ? G.car.heading : G.player.yaw;
    ctx.save(); ctx.translate(me.x, me.z); ctx.rotate(-h);
    const s = (full ? 7 : 5.5) / scale;
    ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1 / scale;
    ctx.beginPath(); ctx.moveTo(0, s * 1.4); ctx.lineTo(s, -s); ctx.lineTo(0, -s * 0.4); ctx.lineTo(-s, -s); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();

    // target marker (clamped to edge)
    if (tgt) {
      const dx = tgt.x - cx, dz = tgt.z - cz;
      let px = (dx * Math.cos(rot) - dz * Math.sin(rot)) * scale, py = (dx * Math.sin(rot) + dz * Math.cos(rot)) * scale;
      const r = size / 2 - 10, l = Math.hypot(px, py);
      if (l > r) { px *= r / l; py *= r / l; }
      ctx.fillStyle = '#4fc3ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(size / 2 + px, size / 2 + py, full ? 9 : 7, 0, 7); ctx.fill(); ctx.stroke();
    }
    // north indicator
    if (!full) {
      const nx = Math.sin(rot) * (size / 2 - 12), ny = -Math.cos(rot) * (size / 2 - 12);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('N', size / 2 + nx, size / 2 + ny);
    }
  }

  function toggleMap(show) {
    $('bigmap').classList.toggle('hidden', !show);
    G.setUiMode(show ? 'map' : 'play');
  }

  // ------------------------------------------------------------ HUD update
  let lastHud = 0;
  function hud(dt) {
    const mm = $('minimap'), ctx = mm.getContext('2d');
    const driving = G.mode === 'drive';
    const me = driving ? G.car.pos : G.player.pos;
    const view = driving ? G.camYaw : G.player.camYaw;
    const zoom = driving ? 0.75 + 0.6 / (1 + Math.abs(G.car.speed) / 10) : 2.2;
    drawMap(ctx, mm.width, me.x, me.z, view + Math.PI, zoom * (mm.width / 220), false);
    if (G.uiMode === 'map') {
      const bm = $('bigmap-canvas');
      drawMap(bm.getContext('2d'), bm.width, 0, 0, 0, bm.width / ((G.world.HALF + 20) * 2), true);
    }

    lastHud += dt;
    if (lastHud < 0.05) return;
    lastHud = 0;

    // speedometer
    $('speedo').classList.toggle('hidden', !driving);
    if (driving) {
      const kmh = Math.abs(G.car.speed) * 3.6;
      $('speed-val').textContent = Math.round(kmh);
      $('gear').textContent = G.car.speed < -0.5 ? 'R' : kmh < 1 ? 'N' : 'D';
      $('speed-bar').style.width = Math.min(100, kmh / 1.4) + '%';
      $('siren-ind').classList.toggle('on', G.car.siren);
    }

    // compass toward target
    const tgt = G.cases.target();
    const cp = $('compass');
    if (tgt) {
      const dx = tgt.x - me.x, dz = tgt.z - me.z;
      const rel = PD.wrapAngle(Math.atan2(dx, dz) - view);
      $('compass-arrow').style.transform = 'rotate(' + (-rel * 180 / Math.PI) + 'deg)';
      $('compass-dist').textContent = Math.round(Math.hypot(dx, dz)) + ' m · ' + tgt.label;
      cp.classList.remove('hidden');
    } else cp.classList.add('hidden');

    $('score').textContent = G.score;
    $('cases').textContent = G.solved;
    $('rank').textContent = rank(G.score);

    // combat HUD
    const armed = G.player.armed && G.mode === 'foot';
    $('crosshair').classList.toggle('hidden', !armed);
    $('crosshair').classList.toggle('aim', armed && G.aiming);
    $('ammo').classList.toggle('hidden', !armed);
    if (armed) $('ammo').textContent = G.combat.reloadT > 0 ? 'RELOADING…' : '🔫 ' + G.combat.ammo + ' / ' + G.combat.mag + '   Suspects: ' + G.combat.alive();
    const showHp = G.mode === 'foot' && (G.player.armed || G.player.health < 100);
    $('health').classList.toggle('hidden', !showHp);
    $('health-fill').style.width = G.player.health + '%';
    $('health-fill').style.background = G.player.health > 50 ? '#4caf50' : G.player.health > 25 ? '#ffb300' : '#e53935';
    $('damage').style.opacity = Math.max(0, (100 - G.player.health) / 160 + damageFlashT);

    // controller indicator
    const pad = PD.Input.pad;
    const pi = $('pad-ind');
    if (pad.connected) {
      pi.textContent = (pad.isWheel ? '🛞 Wheel' : '🎮 Controller') + (pad.needsCal ? ' — pedals need calibration (Esc → Calibrate)' : '');
      pi.classList.toggle('warn', pad.needsCal);
      pi.classList.remove('hidden');
    } else pi.classList.add('hidden');

    $('lock-hint').classList.toggle('hidden', !(G.mode === 'foot' && !document.pointerLockElement && G.uiMode === 'play' && !pad.connected));
  }

  function rank(s) {
    return s < 1000 ? 'Rookie Officer' : s < 2500 ? 'Patrol Officer' : s < 4000 ? 'Detective' : 'Senior Detective';
  }

  function prompt(text) {
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); return; }
    if (p.textContent !== text) p.innerHTML = text;
    p.classList.remove('hidden');
  }

  let damageFlashT = 0;
  function damageFlash() {
    damageFlashT = 0.5;
    const tick = () => { damageFlashT = Math.max(0, damageFlashT - 0.05); if (damageFlashT > 0) setTimeout(tick, 30); };
    tick();
  }
  function hitmarker() {
    const h = $('hitmarker');
    h.classList.remove('show'); void h.offsetWidth; h.classList.add('show');
  }

  // ------------------------------------------------------------ summary
  function summary(info, onClose) {
    let html = '<h1>' + (info.last ? '🏆 Shift complete!' : '✅ Case closed') + '</h1><h2>' + info.title + '</h2><p>' + info.text + '</p><table class="sum">';
    info.rows.forEach((r) => { html += '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; });
    html += '<tr class="total"><td>Total score</td><td>' + G.score + '</td></tr><tr><td>Rank</td><td>' + rank(G.score) + '</td></tr></table>';
    if (info.last) html += '<p>You\'ve closed every case on today\'s roster — dispatch will keep sending calls if you continue patrolling.</p>';
    html += '<button class="btn primary" id="sum-ok">Continue patrol</button><p class="hint">[Enter] / [A]</p>';
    $('summary-body').innerHTML = html;
    $('summary').classList.remove('hidden');
    G.setUiMode('summary');
    summary._close = () => { $('summary').classList.add('hidden'); G.setUiMode('play'); onClose && onClose(); };
    $('sum-ok').onclick = summary._close;
  }

  // ------------------------------------------------------------ settings + calibration
  function padStatusHTML() {
    const pad = PD.Input.pad;
    if (!pad.connected) return '<span class="muted">No controller detected. Plug in your Xbox controller / wheel and <b>press any button or turn the wheel</b> (browsers only reveal gamepads after input).</span>';
    const cal = PD.Input.getCal();
    return '<b>' + (pad.isWheel ? '🛞 Steering wheel' : '🎮 Gamepad') + '</b> detected:<br><span class="muted small">' + escapeHTML(pad.id) + '</span><br>' +
      'Mapping: ' + (pad.standard ? 'standard (XInput)' : 'non-standard') + ' · Pedals: ' +
      (cal && cal.throttle ? '<span class="ok">calibrated</span>' : pad.standard ? 'RT / LT triggers' : '<span class="warn">not calibrated — please calibrate</span>');
  }

  function bindSettings(root) {
    const s = PD.Input.settings;
    const sens = root.querySelector('.set-wheel');
    const mouse = root.querySelector('.set-mouse');
    const inv = root.querySelector('.set-invert');
    const type = root.querySelector('.set-type');
    sens.value = s.wheelSens; mouse.value = s.mouseSens; inv.checked = s.invertY; type.value = s.wheelIsWheel;
    const upd = () => {
      s.wheelSens = parseFloat(sens.value); s.mouseSens = parseFloat(mouse.value); s.invertY = inv.checked; s.wheelIsWheel = type.value;
      root.querySelector('.wheel-val').textContent = s.wheelSens.toFixed(1) + '×';
      root.querySelector('.mouse-val').textContent = s.mouseSens.toFixed(1) + '×';
      PD.Input.saveSettings();
    };
    [sens, mouse, inv, type].forEach((el) => { el.oninput = upd; el.onchange = upd; });
    upd();
    root.querySelector('.btn-cal').onclick = () => calib.open();
  }

  // Calibration wizard: records steering axis and pedal channels from live data.
  const calib = {
    step: 0, base: null, result: {}, isOpen: false,
    steps: [
      { title: 'Step 1 — Wake up & centre', text: 'First press each pedal fully once and turn the wheel a little (some wheels report 0 until moved). Then CENTRE the wheel, RELEASE all pedals, and click Next.' },
      { title: 'Step 2 — Steering', text: 'Turn the wheel RIGHT to where you want full steering lock (about a quarter turn feels good) and HOLD it. Click Next.' },
      { title: 'Step 3 — Throttle', text: 'Centre the wheel. Press the THROTTLE (gas) pedal all the way down and HOLD it. Click Next.' },
      { title: 'Step 4 — Brake', text: 'Release the throttle. Press the BRAKE pedal all the way down and HOLD it. Click Next.' },
    ],
    open() {
      if (!PD.Input.pad.connected) { toast('Connect a wheel / controller and press a button first.', 'bad'); return; }
      this.step = 0; this.base = null; this.result = {}; this.isOpen = true;
      $('calib').classList.remove('hidden');
      this.render();
    },
    close() { this.isOpen = false; $('calib').classList.add('hidden'); },
    render() {
      const st = this.steps[this.step];
      $('cal-title').textContent = st.title;
      $('cal-text').textContent = st.text;
      $('cal-msg').textContent = '';
    },
    live() {
      if (!this.isOpen) return;
      const snap = PD.Input.snapshot();
      if (!snap) { $('cal-live').innerHTML = '<span class="warn">Device disconnected</span>'; return; }
      let html = '<div class="cal-cols"><div><b>Axes</b>';
      snap.axes.forEach((v, i) => { html += bar('A' + i, v, -1, 1); });
      html += '</div><div><b>Analog buttons</b>';
      snap.buttons.forEach((v, i) => { if (i < 12) html += bar('B' + i, v, 0, 1); });
      html += '</div></div>';
      $('cal-live').innerHTML = html;
    },
    biggest(snap, exclude, minDelta) {
      let best = null, bd = minDelta || 0.3;
      snap.axes.forEach((v, i) => {
        if (exclude && exclude.type === 'axis' && exclude.index === i) return;
        const d = Math.abs(v - this.base.axes[i]);
        if (d > bd) { bd = d; best = { type: 'axis', index: i, rest: this.base.axes[i], full: v }; }
      });
      snap.buttons.forEach((v, i) => {
        const d = Math.abs(v - this.base.buttons[i]);
        if (d > bd) { bd = d; best = { type: 'button', index: i, rest: this.base.buttons[i], full: v }; }
      });
      return best;
    },
    next() {
      const snap = PD.Input.snapshot();
      if (!snap) return;
      const msg = $('cal-msg');
      if (this.step === 0) {
        this.base = snap;
      } else if (this.step === 1) {
        const ch = this.biggest(snap, null, 0.05);
        if (!ch || ch.type !== 'axis') { msg.textContent = 'No steering movement detected — turn the wheel further and try again.'; return; }
        this.result.steer = { index: ch.index, center: ch.rest, right: ch.full };
      } else if (this.step === 2) {
        const ch = this.biggest(snap, { type: 'axis', index: this.result.steer.index });
        if (!ch) { msg.textContent = 'No throttle movement detected — press the pedal fully and try again.'; return; }
        this.result.throttle = ch;
      } else if (this.step === 3) {
        const ch = this.biggest(snap, { type: 'axis', index: this.result.steer.index });
        if (!ch) { msg.textContent = 'No brake movement detected — press the pedal fully and try again.'; return; }
        const t = this.result.throttle;
        if (ch.type === t.type && ch.index === t.index && Math.sign(ch.full - ch.rest) === Math.sign(t.full - t.rest)) {
          msg.textContent = 'That looks like the throttle again — release the throttle and press only the brake.'; return;
        }
        this.result.brake = ch;
        PD.Input.setCal(this.result);
        toast('Wheel calibrated and saved for this device.', 'good');
        this.close();
        refreshPadStatus();
        return;
      }
      this.step++;
      this.render();
    },
  };

  function bar(label, v, mn, mx) {
    const pct = ((v - mn) / (mx - mn)) * 100;
    return '<div class="cal-bar"><span>' + label + '</span><div><i style="width:' + PD.clamp(pct, 0, 100) + '%"></i></div><em>' + v.toFixed(2) + '</em></div>';
  }

  function refreshPadStatus() {
    document.querySelectorAll('.pad-status').forEach((el) => { el.innerHTML = padStatusHTML(); });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function init(game) {
    G = game;
    document.querySelectorAll('.controls-guide').forEach((el) => { el.innerHTML = controlsHTML(); });
    document.querySelectorAll('.settings').forEach(bindSettings);
    $('cal-next').onclick = () => calib.next();
    $('cal-cancel').onclick = () => calib.close();
    $('cal-reset').onclick = () => { PD.Input.setCal(null); toast('Calibration cleared — using defaults.', 'info'); calib.close(); refreshPadStatus(); };
    $('ins-close').onclick = () => closeInspect();
    setInterval(() => { refreshPadStatus(); calib.live(); }, 250);
    window.addEventListener('gamepadconnected', (e) => { toast('Controller connected: ' + e.gamepad.id.slice(0, 40), 'good'); refreshPadStatus(); });
    window.addEventListener('gamepaddisconnected', () => { toast('Controller disconnected', 'bad'); refreshPadStatus(); });
  }

  PD.UI = {
    init, toast, radio, setObjective, dialogue, closeDialogue, dialogueInput,
    inspect, closeInspect, openNotebook, closeNotebook, toggleMap, hud, prompt,
    damageFlash, hitmarker, summary, calib, refreshPadStatus,
    summaryClose: () => summary._close && summary._close(),
  };
})(window.PD);
