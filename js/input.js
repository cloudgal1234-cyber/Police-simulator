/*
 * Unified input: keyboard + mouse + Gamepad API (Xbox controllers and
 * Xbox-compatible steering wheels such as Logitech G920/G923, Thrustmaster TMX/T248...).
 *
 * Every frame Input.update() fills Input.state with high-level actions that the
 * game reads, so game code never cares which device produced them.
 *
 * Wheels:
 *  - Steering is axis 0 by default.
 *  - With "standard" mapping (XInput on Windows) pedals are the analog
 *    triggers: RT (button 7) = throttle, LT (button 6) = brake.
 *  - Other wheels expose pedals on arbitrary axes, so the game offers a
 *    calibration wizard (welcome / pause screen) which records which axis each
 *    pedal uses and its rest / pressed values. Saved per device in localStorage.
 */
(function (PD) {
  'use strict';

  const keys = Object.create(null);
  const pressed = Object.create(null);
  let mdx = 0, mdy = 0, mouseL = false, mouseR = false, mouseLPressed = false;
  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

  function isTyping(e) {
    const t = e.target && e.target.tagName;
    return t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA';
  }

  window.addEventListener('keydown', (e) => {
    if (isTyping(e) && e.code !== 'Escape') return;
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    // Enter/Space are handled by the game; stop them also "clicking" a focused button.
    if (PREVENT.has(e.code) || (e.code === 'Enter' && e.target && e.target.tagName === 'BUTTON')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseL = mouseR = false; });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { mdx += e.movementX; mdy += e.movementY; }
  });
  window.addEventListener('mousedown', (e) => {
    if (e.target && e.target.id !== 'game') return; // ignore clicks on UI
    if (e.button === 0) { mouseL = true; mouseLPressed = true; }
    if (e.button === 2) mouseR = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseL = false;
    if (e.button === 2) mouseR = false;
  });
  window.addEventListener('contextmenu', (e) => { if (e.target && e.target.id === 'game') e.preventDefault(); });

  // ---------------------------------------------------------------- gamepad
  const WHEEL_RE = /wheel|racing|g29|g920|g923|driving force|thrustmaster|t150|t300|tmx|t248|t128|t80|fanatec|ferrari|steering/i;

  const pad = {
    connected: false, index: -1, id: '', isWheel: false, standard: false,
    axes: [], buttons: [], prevButtons: [], needsCal: false,
  };
  let cal = null;

  const settings = { wheelSens: 1.0, mouseSens: 1.0, invertY: false, wheelIsWheel: 'auto' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('pd_settings') || '{}')); } catch (e) { /* ignore */ }
  function saveSettings() {
    try { localStorage.setItem('pd_settings', JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  function loadCal(id) {
    try { return (JSON.parse(localStorage.getItem('pd_cal') || '{}'))[id] || null; } catch (e) { return null; }
  }
  function saveCal(id, c) {
    try {
      const all = JSON.parse(localStorage.getItem('pd_cal') || '{}');
      if (c) all[id] = c; else delete all[id];
      localStorage.setItem('pd_cal', JSON.stringify(all));
    } catch (e) { /* ignore */ }
  }

  function getPad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (!g || !g.connected) continue;
      if (!gp) gp = g;
      else if (WHEEL_RE.test(g.id) && !WHEEL_RE.test(gp.id)) gp = g; // prefer a wheel
    }
    return gp;
  }

  function pollPad() {
    const gp = getPad();
    if (!gp) {
      pad.connected = false; pad.axes = []; pad.buttons = [];
      return null;
    }
    if (gp.id !== pad.id || gp.index !== pad.index || !pad.connected) {
      pad.id = gp.id; pad.index = gp.index;
      pad.standard = gp.mapping === 'standard';
      cal = loadCal(gp.id);
      pad.prevButtons = [];
    }
    pad.isWheel = settings.wheelIsWheel === 'yes' ? true
      : settings.wheelIsWheel === 'no' ? false : WHEEL_RE.test(gp.id);
    pad.connected = true;
    pad.axes = Array.from(gp.axes);
    pad.buttons = gp.buttons.map((b) => (typeof b === 'object' ? b.value : b));
    // Non-standard wheels need calibration before pedals are trusted.
    pad.needsCal = !pad.standard && !(cal && cal.throttle);
    return gp;
  }

  function readChannel(ch) {
    if (!ch) return 0;
    const v = ch.type === 'button' ? (pad.buttons[ch.index] || 0) : (pad.axes[ch.index] || 0);
    const span = ch.full - ch.rest;
    if (Math.abs(span) < 1e-3) return 0;
    return PD.clamp((v - ch.rest) / span, 0, 1);
  }

  function deadzone(v, dz) {
    const a = Math.abs(v);
    if (a < dz) return 0;
    return Math.sign(v) * (a - dz) / (1 - dz);
  }

  const state = {
    steer: 0, throttle: 0, brake: 0, handbrake: false,
    moveX: 0, moveY: 0, turn: 0, lookX: 0, lookY: 0, run: false,
    fire: false, firePressed: false, aim: false, reload: false,
    interact: false, vehicle: false, siren: false, map: false, pause: false,
    notebook: false, camera: false, back: false, up: false, down: false,
    confirm: false, choice: -1, horn: false, usingPad: false,
  };

  let navHeld = 0; // analog-stick menu navigation repeat timer

  function update(dt) {
    const gp = pollPad();
    const b = pad.buttons, pb = pad.prevButtons;
    const btn = (i) => (gp ? (b[i] || 0) > 0.5 : false);
    const btnP = (i) => (gp ? (b[i] || 0) > 0.5 && !((pb[i] || 0) > 0.5) : false);
    const K = (c) => !!keys[c];
    const P = (c) => !!pressed[c];

    // ---------- keyboard
    const kRight = (K('KeyD') || K('ArrowRight') ? 1 : 0) - (K('KeyA') || K('ArrowLeft') ? 1 : 0);
    const kFwd = (K('KeyW') || K('ArrowUp') ? 1 : 0) - (K('KeyS') || K('ArrowDown') ? 1 : 0);

    // ---------- gamepad
    let gSteer = 0, gThr = 0, gBrk = 0, lx = 0, ly = 0, rx = 0, ry = 0;
    if (gp) {
      const ax = pad.axes;
      if (cal && cal.steer) {
        const span = cal.steer.right - cal.steer.center;
        gSteer = Math.abs(span) > 1e-3 ? ((ax[cal.steer.index] || 0) - cal.steer.center) / span : 0;
      } else {
        gSteer = ax[0] || 0;
      }
      if (pad.isWheel) {
        gSteer = PD.clamp(deadzone(gSteer, 0.015) * settings.wheelSens, -1, 1);
      } else {
        gSteer = deadzone(gSteer, 0.15);
        gSteer = Math.sign(gSteer) * Math.pow(Math.abs(gSteer), 1.4);
      }
      if (cal && cal.throttle) {
        gThr = readChannel(cal.throttle);
        gBrk = readChannel(cal.brake);
      } else if (pad.standard) {
        gThr = b[7] || 0;
        gBrk = b[6] || 0;
      }
      if (gThr < 0.04) gThr = 0;
      if (gBrk < 0.04) gBrk = 0;
      if (!pad.isWheel) {
        lx = deadzone(ax[0] || 0, 0.18); ly = deadzone(ax[1] || 0, 0.18);
        rx = deadzone(ax[2] || 0, 0.15); ry = deadzone(ax[3] || 0, 0.15);
      }
    }

    state.usingPad = !!gp && (Math.abs(gSteer) > 0.05 || gThr > 0 || gBrk > 0 || Math.abs(lx) > 0 || b.some((v) => v > 0.5));

    // ---------- driving
    state.steer = kRight !== 0 ? kRight : gSteer;
    state.throttle = Math.max(kFwd > 0 ? 1 : 0, gThr);
    state.brake = Math.max(kFwd < 0 ? 1 : 0, gBrk);
    state.handbrake = K('Space') || btn(1);
    state.horn = K('KeyG');

    // ---------- on foot
    const kStrafe = (K('KeyD') ? 1 : 0) - (K('KeyA') ? 1 : 0);
    state.moveX = kStrafe !== 0 ? kStrafe : lx;
    state.moveY = kFwd !== 0 ? kFwd : -ly;
    state.turn = 0;
    if (pad.isWheel && gp) {
      // On foot with only a wheel: wheel turns, pedals walk.
      state.turn = gSteer;
      if (kFwd === 0) state.moveY = gThr - gBrk;
    }
    const kTurn = (K('ArrowRight') ? 1 : 0) - (K('ArrowLeft') ? 1 : 0);
    if (kTurn) state.turn = kTurn;
    const ms = 0.0022 * settings.mouseSens;
    state.lookX = mdx * ms + rx * 2.6 * dt + state.turn * 2.2 * dt;
    state.lookY = (mdy * ms + ry * 1.8 * dt) * (settings.invertY ? -1 : 1);
    state.run = K('ShiftLeft') || K('ShiftRight') || btn(10);

    const padFire = gp && !pad.isWheel ? (b[7] || 0) > 0.35 : false;
    const padFireP = gp && !pad.isWheel ? (b[7] || 0) > 0.35 && !((pb[7] || 0) > 0.35) : false;
    state.fire = mouseL || padFire;
    state.firePressed = mouseLPressed || padFireP || (gp && pad.isWheel && btnP(5));
    state.aim = mouseR || (gp && !pad.isWheel ? (b[6] || 0) > 0.35 : false);
    state.reload = P('KeyR') || btnP(2);

    // ---------- actions (edge triggered)
    state.interact = P('KeyE') || btnP(0);
    state.vehicle = P('KeyF') || btnP(3);
    state.siren = P('KeyH') || btnP(2);
    state.map = P('KeyM') || btnP(8);
    state.pause = P('Escape') || P('KeyP') || btnP(9);
    state.notebook = P('Tab') || P('KeyJ') || (btnP(5) && !pad.isWheel);
    state.camera = P('KeyC') || btnP(4);
    state.back = P('Escape') || P('Backspace') || btnP(1);
    state.confirm = P('Enter') || P('Space') || P('KeyE') || btnP(0);

    // Menu navigation (keys, d-pad, stick with repeat)
    let navUp = P('ArrowUp') || P('KeyW') || btnP(12);
    let navDown = P('ArrowDown') || P('KeyS') || btnP(13);
    const stickY = gp ? (pad.axes[1] || 0) : 0;
    if (!pad.isWheel && Math.abs(stickY) > 0.6) {
      if (navHeld <= 0) { if (stickY < 0) navUp = true; else navDown = true; navHeld = 0.28; }
      navHeld -= dt;
    } else navHeld = 0;
    state.up = navUp; state.down = navDown;

    state.choice = -1;
    for (let i = 1; i <= 9; i++) if (P('Digit' + i) || P('Numpad' + i)) state.choice = i - 1;

    // ---------- reset per-frame accumulators
    for (const k in pressed) delete pressed[k];
    mdx = 0; mdy = 0; mouseLPressed = false;
    pad.prevButtons = b.slice();
  }

  // Raw snapshot for the calibration wizard.
  function snapshot() {
    const gp = getPad();
    if (!gp) return null;
    return {
      axes: Array.from(gp.axes),
      buttons: gp.buttons.map((x) => (typeof x === 'object' ? x.value : x)),
    };
  }

  PD.Input = {
    state, pad, settings, saveSettings, update, snapshot,
    getCal: () => cal,
    setCal: (c) => { cal = c; if (pad.id) saveCal(pad.id, c); },
    clearKeys: () => { for (const k in keys) keys[k] = false; },
    keyDown: (code) => !!keys[code],
  };
})(window.PD);
