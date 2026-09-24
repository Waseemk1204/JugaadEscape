// The sound of a bank branch at 6 PM with the shutter down: ceiling fans, an
// AC that has been dying since 2009, tube lights buzzing — and one heavy man
// who can hear a drawer open from his cabin.
//
// Everything is synthesised on GameAudio (src/audio.js). Sounds that happen
// somewhere in the room go through a stereo panner and a distance gain worked
// out from where you are standing and which way you face, so you can hear Sir
// coming before you see him.

import { U } from "../shared/bank-map.js";

export class BankAudio {
  constructor(audio) {
    this.audio = audio;
    this.listener = { x: 0, y: 0, yaw: 0 };
    this.loops = [];
  }

  get ctx() {
    return this.audio.ctx;
  }

  // ---------------------------------------------------------------- ambience

  start() {
    const ctx = this.ctx;
    if (!ctx || this.running) return;
    this.running = true;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    out.connect(this.audio.master);
    this.bed = out;

    // Fans: filtered noise with a slow wobble.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const fan = ctx.createBufferSource();
    fan.buffer = buffer;
    fan.loop = true;
    const fanFilter = ctx.createBiquadFilter();
    fanFilter.type = "lowpass";
    fanFilter.frequency.value = 520;
    const fanGain = ctx.createGain();
    fanGain.gain.value = 0.05;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 0.9;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 0.012;
    wobble.connect(wobbleGain);
    wobbleGain.connect(fanGain.gain);
    fan.connect(fanFilter);
    fanFilter.connect(fanGain);
    fanGain.connect(out);
    fan.start();
    wobble.start();

    // Tube lights and the AC: mains hum.
    const hum = ctx.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 100;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 240;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.012;
    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(out);
    hum.start();

    this.loops.push(fan, wobble, hum);

    // Now and then, the city outside: a horn, a pressure-horn truck, a dog.
    this.cityTimer = setInterval(() => this.cityNoise(), 7000);
  }

  cityNoise() {
    if (!this.running || Math.random() < 0.35) return;
    const a = this.audio;
    const kind = Math.random();
    if (kind < 0.5) {
      // Two-tone car horn, far off.
      a.tone({ freq: 420, type: "square", duration: 0.22, gain: 0.012 });
      a.tone({ freq: 530, type: "square", duration: 0.22, gain: 0.01, delay: 0.01 });
    } else if (kind < 0.8) {
      // A truck's musical pressure horn.
      [523, 659, 784, 659].forEach((f, i) => a.tone({ freq: f, type: "square", duration: 0.16, gain: 0.008, delay: i * 0.17 }));
    } else {
      // Scooter going past.
      a.tone({ freq: 90, type: "sawtooth", duration: 1.6, gain: 0.012, slideTo: 140 });
    }
  }

  stop() {
    this.running = false;
    clearInterval(this.cityTimer);
    for (const node of this.loops) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    this.loops = [];
    this.bed?.disconnect();
    this.bed = null;
    this.stopBusy();
  }

  // ------------------------------------------------------------- positional

  setListener(listener) {
    this.listener = listener;
  }

  // A panner + gain for a sound at (x, y) map pixels. Returns null when too
  // far away to hear at all.
  at(x, y, range = 26) {
    const ctx = this.ctx;
    if (!ctx) return null;
    const { x: lx, y: ly, yaw } = this.listener;
    const dx = (x - lx) * U;
    const dy = (y - ly) * U;
    const d = Math.hypot(dx, dy);
    const gain = Math.max(0, 1 - d / range) ** 1.4;
    if (gain < 0.01) return null;
    const rightX = Math.cos(yaw);
    const rightY = -Math.sin(yaw);
    const pan = d < 0.3 ? 0 : Math.max(-1, Math.min(1, (dx * rightX + dy * rightY) / d));
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan * 0.85;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    amp.connect(panner);
    panner.connect(this.audio.master);
    // Let the nodes go once the sound has played.
    setTimeout(() => {
      amp.disconnect();
      panner.disconnect();
    }, 12000);
    return amp;
  }

  // --------------------------------------------------------------- the boss

  bossStep(x, y, heavy = 1) {
    const out = this.at(x, y, 18);
    if (!out) return;
    const a = this.audio;
    const vary = 0.9 + Math.random() * 0.2;
    // Leather soles on vitrified tile: a slap and a squeak.
    a.tone({ freq: 70 * vary, type: "sine", duration: 0.16, gain: 0.45 * heavy, slideTo: 42, out });
    a.noise({ duration: 0.05, gain: 0.25 * heavy, filter: 2600, out });
    if (Math.random() < 0.25) a.tone({ freq: 1900 * vary, type: "sine", duration: 0.05, gain: 0.03, out, delay: 0.05 });
  }

  // He does not speak in words the synth can say, so he mutters in shape:
  // a few rising and falling syllables at a gruff pitch. The subtitles carry
  // the meaning.
  voice(x, y, mood = "normal", syllables = 4) {
    const out = this.at(x, y, 30);
    if (!out) return;
    const a = this.audio;
    const base = mood === "shout" ? 190 : mood === "aside" ? 120 : 145;
    const gain = mood === "shout" ? 0.16 : mood === "aside" ? 0.06 : 0.1;
    for (let i = 0; i < syllables; i += 1) {
      const f = base * (0.85 + Math.random() * 0.35);
      const at = i * (mood === "shout" ? 0.16 : 0.13);
      a.tone({ freq: f, type: "sawtooth", duration: 0.12, gain, slideTo: f * (mood === "shout" ? 1.15 : 0.9), delay: at, out });
      a.tone({ freq: f * 2.6, type: "sine", duration: 0.1, gain: gain * 0.4, delay: at, out });
      a.noise({ duration: 0.05, gain: gain * 0.3, filter: 1800, delay: at, out });
    }
  }

  cabinDoor(x, y) {
    const out = this.at(x, y);
    if (!out) return;
    this.audio.creak(0.4, 0.12);
    this.audio.noise({ duration: 0.12, gain: 0.2, filter: 600, delay: 0.3, out });
  }

  chairCreak(x, y) {
    const out = this.at(x, y);
    if (!out) return;
    this.audio.tone({ freq: 240, type: "sawtooth", duration: 0.35, gain: 0.04, slideTo: 170, out });
  }

  flush(x, y) {
    const out = this.at(x, y, 28);
    if (!out) return;
    this.audio.noise({ duration: 2.4, gain: 0.35, filter: 900, out });
    this.audio.noise({ duration: 1.6, gain: 0.2, filter: 2200, delay: 0.4, out });
    this.audio.tone({ freq: 300, type: "sine", duration: 1.6, gain: 0.04, slideTo: 180, delay: 0.2, out });
  }

  // The sting when he hears you: "Kaun hai?!"
  alerted() {
    const a = this.audio;
    a.tone({ freq: 196, type: "square", duration: 0.12, gain: 0.08 });
    a.tone({ freq: 294, type: "square", duration: 0.25, gain: 0.08, delay: 0.12 });
  }

  // He has seen something.
  noticed() {
    this.audio.tone({ freq: 880, type: "triangle", duration: 0.12, gain: 0.1 });
    this.audio.tone({ freq: 1175, type: "triangle", duration: 0.18, gain: 0.08, delay: 0.1 });
  }

  lostInterest() {
    this.audio.tone({ freq: 587, type: "triangle", duration: 0.15, gain: 0.06 });
    this.audio.tone({ freq: 440, type: "triangle", duration: 0.2, gain: 0.05, delay: 0.12 });
  }

  // A pulse that quickens while his suspicion meter on you fills.
  meterPulse(level) {
    this.audio.tone({ freq: 60 + level * 30, type: "sine", duration: 0.12, gain: 0.12 + level * 0.25 });
  }

  // THAPPAD.
  slap() {
    const a = this.audio;
    a.noise({ duration: 0.09, gain: 0.9, filter: 5200, type: "highpass" });
    a.noise({ duration: 0.18, gain: 0.5, filter: 1600 });
    a.tone({ freq: 120, type: "sine", duration: 0.25, gain: 0.5, slideTo: 60 });
    // The cartoon ringing that follows.
    for (let i = 0; i < 6; i += 1) a.tone({ freq: 1800 + i * 90, type: "sine", duration: 0.4, gain: 0.03, delay: 0.25 + i * 0.12 });
    // A slide whistle down, because it is that kind of bank.
    a.tone({ freq: 1400, type: "sine", duration: 0.7, gain: 0.07, slideTo: 300, delay: 0.3 });
  }

  // ---------------------------------------------------------------- decoys

  photocopier(x, y, seconds = 8) {
    const out = this.at(x, y, 30);
    if (!out) return;
    const a = this.audio;
    for (let t = 0; t < seconds; t += 0.62) {
      a.noise({ duration: 0.4, gain: 0.35, filter: 1400, delay: t, out });
      a.tone({ freq: 180, type: "sawtooth", duration: 0.35, gain: 0.06, slideTo: 260, delay: t, out });
      a.tone({ freq: 2200, type: "square", duration: 0.03, gain: 0.02, delay: t + 0.4, out });
    }
  }

  cashMachine(x, y, seconds = 4) {
    const out = this.at(x, y, 26);
    if (!out) return;
    for (let t = 0; t < seconds; t += 0.05) {
      this.audio.noise({ duration: 0.035, gain: 0.25, filter: 3400, delay: t, out });
    }
    this.audio.tone({ freq: 1600, type: "square", duration: 0.2, gain: 0.04, delay: seconds, out });
  }

  // The landline on his desk: the old double trill.
  landline(x, y, rings = 2) {
    const out = this.at(x, y, 32);
    if (!out) return;
    for (let r = 0; r < rings; r += 1) {
      for (let t = 0; t < 0.8; t += 0.05) {
        this.audio.tone({ freq: t % 0.1 < 0.05 ? 1400 : 1750, type: "square", duration: 0.05, gain: 0.05, delay: r * 2 + t, out });
      }
    }
  }

  // Your phone's alarm: the default ringtone, of course.
  phoneAlarm(x, y, seconds = 6) {
    const out = this.at(x, y, 30);
    if (!out) return;
    const tune = [659, 587, 370, 415, 554, 494, 294, 330, 494, 440, 277, 330, 440];
    let t = 0;
    while (t < seconds) {
      for (const f of tune) {
        this.audio.tone({ freq: f, type: "square", duration: 0.13, gain: 0.05, delay: t, out });
        t += 0.14;
      }
      t += 0.4;
    }
  }

  flick(x, y) {
    this.audio.tone({ freq: 400, type: "triangle", duration: 0.08, gain: 0.08, slideTo: 900 });
    const out = this.at(x, y, 26);
    if (!out) return;
    this.audio.noise({ duration: 0.08, gain: 0.5, filter: 2800, delay: 0.25, out });
    this.audio.tone({ freq: 900, type: "square", duration: 0.04, gain: 0.08, delay: 0.25, out });
    this.audio.noise({ duration: 0.05, gain: 0.3, filter: 2000, delay: 0.38, out });
  }

  // ------------------------------------------------------------- your hands

  // While you hold E: a sound that says what you are doing.
  busy(kind) {
    if (this.busyKind === kind) return;
    this.stopBusy();
    this.busyKind = kind;
    const a = this.audio;
    const tick = {
      search: () => a.noise({ duration: 0.08, gain: 0.08, filter: 1800 }),
      pick: () => a.tone({ freq: 2600 + Math.random() * 800, type: "square", duration: 0.015, gain: 0.03 }),
      card: () => a.noise({ duration: 0.1, gain: 0.05, filter: 4200 }),
      oil: () => a.noise({ duration: 0.15, gain: 0.05, filter: 700 }),
      metal: () => a.tone({ freq: 700 + Math.random() * 400, type: "triangle", duration: 0.05, gain: 0.05 }),
    }[kind] || (() => a.noise({ duration: 0.06, gain: 0.05, filter: 1500 }));
    this.busyTimer = setInterval(tick, kind === "pick" ? 180 : 260);
  }

  stopBusy() {
    clearInterval(this.busyTimer);
    this.busyTimer = null;
    this.busyKind = null;
  }

  pickup() {
    this.audio.tone({ freq: 660, type: "triangle", duration: 0.08, gain: 0.08 });
    this.audio.tone({ freq: 990, type: "triangle", duration: 0.12, gain: 0.07, delay: 0.07 });
  }

  nothing() {
    this.audio.tone({ freq: 220, type: "triangle", duration: 0.15, gain: 0.06 });
  }

  locked() {
    this.audio.tone({ freq: 160, type: "square", duration: 0.07, gain: 0.05 });
    this.audio.tone({ freq: 130, type: "square", duration: 0.09, gain: 0.05, delay: 0.08 });
  }

  unlock() {
    const a = this.audio;
    a.noise({ duration: 0.04, gain: 0.25, filter: 4000 });
    a.tone({ freq: 1200, type: "square", duration: 0.03, gain: 0.06, delay: 0.04 });
    a.tone({ freq: 520, type: "triangle", duration: 0.2, gain: 0.08, delay: 0.08 });
  }

  combine() {
    const a = this.audio;
    [523, 659, 784].forEach((f, i) => a.tone({ freq: f, type: "triangle", duration: 0.14, gain: 0.08, delay: i * 0.07 }));
  }

  select() {
    this.audio.tone({ freq: 1100, type: "sine", duration: 0.03, gain: 0.04 });
  }

  // Almirah doors, the gate sliding, the shutter going up.
  creakOpen(loudness) {
    this.audio.creak(0.6, 0.06 + loudness * 0.18);
  }

  gateSlide(loud) {
    const a = this.audio;
    if (loud) {
      // Rusted track: a long metal screech.
      for (let i = 0; i < 3; i += 1) a.creak(0.7, 0.25);
      a.tone({ freq: 2400, type: "sawtooth", duration: 1.2, gain: 0.05, slideTo: 1900 });
    }
    for (let t = 0; t < 1.2; t += 0.1) a.noise({ duration: 0.08, gain: loud ? 0.25 : 0.08, filter: 2500, delay: t });
  }

  shutterRoll(loud) {
    const a = this.audio;
    for (let t = 0; t < 1.6; t += 0.07) {
      a.noise({ duration: 0.09, gain: loud ? 0.6 : 0.15, filter: loud ? 1800 : 900, delay: t });
      if (loud) a.tone({ freq: 90 + Math.random() * 40, type: "square", duration: 0.06, gain: 0.08, delay: t });
    }
  }

  woodenDoors(open) {
    this.audio.door(open, 0.8);
  }

  smash() {
    const a = this.audio;
    a.noise({ duration: 0.3, gain: 0.9, filter: 3000 });
    a.tone({ freq: 900, type: "square", duration: 0.4, gain: 0.12, slideTo: 600 });
    a.tone({ freq: 1340, type: "triangle", duration: 0.9, gain: 0.08 });
  }

  footstep(volume, running) {
    this.audio.footstep(volume, running);
  }

  // ----------------------------------------------------------- cutscenes

  // The whole office, groaning at once.
  groan() {
    const a = this.audio;
    for (let i = 0; i < 6; i += 1) {
      const f = 110 + Math.random() * 90;
      a.tone({ freq: f, type: "sawtooth", duration: 1.1, gain: 0.035, slideTo: f * 0.72, delay: i * 0.07, attack: 0.08 });
    }
    a.noise({ duration: 1, gain: 0.05, filter: 700 });
  }

  // Something heavy and metal hitting its stop.
  bang(x, y, heavy = 1) {
    const out = this.at(x, y, 40);
    if (!out) return;
    const a = this.audio;
    a.noise({ duration: 0.35, gain: 0.8 * heavy, filter: 1400, out });
    a.tone({ freq: 70, type: "sine", duration: 0.5, gain: 0.6 * heavy, slideTo: 38, out });
    a.tone({ freq: 620, type: "square", duration: 0.5, gain: 0.05 * heavy, slideTo: 540, out });
  }

  // A padlock snapping shut, or a key turning.
  click(x, y) {
    const out = this.at(x, y, 30);
    if (!out) return;
    this.audio.noise({ duration: 0.03, gain: 0.35, filter: 5000, out });
    this.audio.tone({ freq: 1500, type: "square", duration: 0.025, gain: 0.08, delay: 0.05, out });
  }

  keyJingle(x, y) {
    const out = this.at(x, y, 20);
    if (!out) return;
    for (let i = 0; i < 7; i += 1) {
      this.audio.tone({ freq: 3000 + Math.random() * 2500, type: "sine", duration: 0.06, gain: 0.03, delay: i * 0.05 + Math.random() * 0.03, out });
    }
  }

  // You, hitting the floor of the record room.
  thud() {
    this.audio.noise({ duration: 0.25, gain: 0.5, filter: 500 });
    this.audio.tone({ freq: 80, type: "sine", duration: 0.3, gain: 0.5, slideTo: 45 });
    this.audio.noise({ duration: 0.6, gain: 0.08, filter: 3000, delay: 0.15 }); // dust off the files
  }

  lightSwitch() {
    this.audio.tone({ freq: 2200, type: "square", duration: 0.02, gain: 0.08 });
    this.audio.noise({ duration: 0.04, gain: 0.15, filter: 3000 });
    this.audio.tone({ freq: 100, type: "sine", duration: 0.3, gain: 0.03, slideTo: 50, delay: 0.05 });
  }

  titleSting() {
    const a = this.audio;
    [[294, 0], [392, 0.12], [440, 0.24], [587, 0.4]].forEach(([f, d]) => {
      a.tone({ freq: f, type: "triangle", duration: 0.5, gain: 0.1, delay: d });
      a.tone({ freq: f * 1.5, type: "sine", duration: 0.4, gain: 0.03, delay: d });
    });
    a.noise({ duration: 0.08, gain: 0.25, filter: 5000, delay: 0.4 });
  }

  // ------------------------------------------------------------------ ends

  escaped() {
    const a = this.audio;
    const notes = [[392, 0], [523, 0.15], [659, 0.3], [784, 0.45], [659, 0.75], [784, 0.9], [1047, 1.1]];
    for (const [f, d] of notes) {
      a.tone({ freq: f, type: "triangle", duration: 0.35, gain: 0.1, delay: d });
      a.tone({ freq: f / 2, type: "square", duration: 0.3, gain: 0.03, delay: d });
    }
    for (const d of [0, 0.45, 0.9, 1.1]) a.noise({ duration: 0.06, gain: 0.2, filter: 5000, delay: d });
  }

  gameOver() {
    const a = this.audio;
    [392, 370, 349, 330].forEach((f, i) => a.tone({ freq: f, type: "sawtooth", duration: 0.5, gain: 0.07, delay: i * 0.45, slideTo: f * 0.97 }));
    a.tone({ freq: 98, type: "sawtooth", duration: 1.6, gain: 0.08, delay: 1.8, slideTo: 60 });
  }
}
