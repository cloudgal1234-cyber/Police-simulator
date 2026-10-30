/* Tiny procedural audio (WebAudio) — no sound files needed. */
(function (PD) {
  'use strict';

  let ctx = null, master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let noiseBuf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Engine: two detuned saws through a low-pass filter
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
    engineOsc = [ctx.createOscillator(), ctx.createOscillator()];
    engineOsc[0].type = 'sawtooth'; engineOsc[1].type = 'square';
    engineOsc.forEach((o) => { o.frequency.value = 40; o.connect(engineFilter); o.start(); });
    engineFilter.connect(engineGain); engineGain.connect(master);

    // Siren: oscillator whose pitch is swept by a slow LFO ("wail")
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 900;
    sirenLfo = ctx.createOscillator(); sirenLfo.frequency.value = 0.35;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 380;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); sirenLfo.start();

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function setEngine(on, speed01, throttle) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = 38 + speed01 * 95 + throttle * 18;
    engineOsc[0].frequency.setTargetAtTime(f, t, 0.08);
    engineOsc[1].frequency.setTargetAtTime(f * 0.501, t, 0.08);
    engineFilter.frequency.setTargetAtTime(300 + throttle * 900 + speed01 * 600, t, 0.1);
    engineGain.gain.setTargetAtTime(on ? 0.05 + throttle * 0.05 : 0, t, 0.15);
  }

  function setSiren(on) {
    if (!ctx) return;
    sirenGain.gain.setTargetAtTime(on ? 0.06 : 0, ctx.currentTime, 0.05);
  }

  function noise(dur, vol, freq, type) {
    if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 2000;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, vol, type, delay) {
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + (delay || 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  PD.Audio = {
    init, setEngine, setSiren,
    gunshot: (far) => noise(far ? 0.35 : 0.25, far ? 0.25 : 0.6, far ? 1200 : 3500),
    thud: (v) => noise(0.2, Math.min(0.6, v), 300),
    radio: () => { noise(0.18, 0.15, 3000, 'bandpass'); tone(1400, 0.08, 0.08, 'square', 0.2); tone(1400, 0.08, 0.08, 'square', 0.32); },
    blip: () => tone(880, 0.07, 0.06, 'square'),
    good: () => { tone(660, 0.12, 0.08); tone(880, 0.12, 0.08, 'sine', 0.1); tone(1320, 0.2, 0.08, 'sine', 0.2); },
    bad: () => { tone(220, 0.25, 0.1, 'sawtooth'); tone(180, 0.3, 0.1, 'sawtooth', 0.15); },
    clue: () => { tone(990, 0.1, 0.07); tone(1480, 0.18, 0.07, 'sine', 0.08); },
    hurt: () => noise(0.15, 0.4, 600),
    horn: () => { tone(420, 0.25, 0.08, 'square'); tone(530, 0.25, 0.06, 'square'); },
    click: () => tone(1800, 0.03, 0.05, 'square'),
  };
})(window.PD);
