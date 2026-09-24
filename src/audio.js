// Synthesised sound effects and ambience via WebAudio. No asset files needed;
// everything is generated from oscillators and noise so the game ships as a
// handful of text files. Audio starts on the first user gesture.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ambient = null;
    this.tension = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    // A gentle limiter lets everything sit much louder without the peaks
    // crackling when several effects land at once.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  tone({ freq = 440, type = "sine", duration = 0.2, gain = 0.3, attack = 0.005, decay, detune = 0, slideTo, delay = 0, out = null }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.detune.value = detune;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + (decay || duration));
    osc.connect(amp);
    amp.connect(out || this.master);
    osc.start(start);
    osc.stop(start + (decay || duration) + 0.05);
  }

  noise({ duration = 0.3, gain = 0.2, delay = 0, filter = 1200, out = null, type = "lowpass" }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = type;
    lp.frequency.value = filter;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    source.connect(lp);
    lp.connect(amp);
    amp.connect(out || this.master);
    source.start(start);
  }

  // ------------------------------------------------------------ effects

  searchTick() {
    this.tone({ freq: 620, type: "square", duration: 0.05, gain: 0.1 });
  }

  searchEmpty() {
    this.noise({ duration: 0.2, gain: 0.3, filter: 900 });
    this.tone({ freq: 160, type: "triangle", duration: 0.2, gain: 0.22 });
  }

  noteFound() {
    this.tone({ freq: 110, type: "sawtooth", duration: 1.4, gain: 0.22, attack: 0.02 });
    this.tone({ freq: 165, type: "sine", duration: 1.4, gain: 0.16, delay: 0.05 });
    this.tone({ freq: 220, type: "triangle", duration: 1.2, gain: 0.1, delay: 0.3 });
    this.noise({ duration: 0.8, gain: 0.08, filter: 500, delay: 0.1 });
  }

  noteFoundGeneric() {
    this.tone({ freq: 196, type: "triangle", duration: 0.5, gain: 0.14 });
    this.tone({ freq: 147, type: "triangle", duration: 0.7, gain: 0.12, delay: 0.25 });
  }

  tagStolen() {
    this.tone({ freq: 880, type: "sine", duration: 0.12, gain: 0.22 });
    this.tone({ freq: 660, type: "sine", duration: 0.22, gain: 0.18, delay: 0.1 });
  }

  writing() {
    this.noise({ duration: 0.12, gain: 0.1, filter: 3000 });
  }

  death() {
    this.tone({ freq: 90, type: "sawtooth", duration: 1.0, gain: 0.4, slideTo: 38 });
    this.noise({ duration: 0.55, gain: 0.24, filter: 400 });
  }

  meetingAlarm() {
    for (let i = 0; i < 3; i += 1) {
      this.tone({ freq: 740, type: "square", duration: 0.16, gain: 0.08, delay: i * 0.22 });
      this.tone({ freq: 520, type: "square", duration: 0.16, gain: 0.08, delay: i * 0.22 + 0.11 });
    }
  }

  voteTick() {
    this.tone({ freq: 1200, type: "sine", duration: 0.05, gain: 0.1 });
  }

  win() {
    [262, 330, 392, 523].forEach((freq, i) => this.tone({ freq, type: "triangle", duration: 0.5, gain: 0.14, delay: i * 0.12 }));
  }

  lose() {
    [392, 330, 262, 196].forEach((freq, i) => this.tone({ freq, type: "sawtooth", duration: 0.6, gain: 0.12, delay: i * 0.16 }));
  }

  // A footstep is a short filtered thud with a bit of scuff on top. Pitch and
  // level wander slightly so a run does not sound like a metronome.
  // Heel strike, then a scuff of the sole a beat later. The two-part shape is
  // what makes it read as a footstep rather than a click.
  footstep(volume = 1, running = false) {
    if (volume <= 0.02) return;
    const vary = 0.85 + Math.random() * 0.3;
    const gain = volume * (running ? 1.25 : 1);
    this.noise({ duration: 0.07, gain: 0.2 * gain * vary, filter: 900 * vary });
    this.tone({
      freq: (running ? 104 : 84) * vary,
      type: "triangle",
      duration: 0.13,
      gain: 0.2 * gain * vary,
      slideTo: (running ? 54 : 44) * vary,
    });
    this.noise({
      duration: 0.11,
      gain: 0.09 * gain * vary,
      filter: (running ? 3400 : 2400) * vary,
      delay: running ? 0.035 : 0.05,
    });
  }

  // Hinges creak open; a latch clacks shut.
  // Hinges creak on the way open; on the way shut the leaf thumps into the
  // frame and the latch snaps a moment later.
  door(open, volume = 1) {
    if (volume <= 0.02) return;
    if (open) {
      this.creak(0.55, 0.16 * volume);
      this.tone({ freq: 132, type: "triangle", duration: 0.5, gain: 0.13 * volume, slideTo: 178 });
      this.noise({ duration: 0.34, gain: 0.08 * volume, filter: 700 });
    } else {
      this.creak(0.3, 0.1 * volume);
      this.tone({ freq: 150, type: "triangle", duration: 0.24, gain: 0.22 * volume, slideTo: 74 });
      this.noise({ duration: 0.13, gain: 0.2 * volume, filter: 520 });
      this.noise({ duration: 0.04, gain: 0.26 * volume, filter: 4200, delay: 0.21 });
      this.tone({ freq: 1750, type: "square", duration: 0.025, gain: 0.12 * volume, delay: 0.21 });
      this.tone({ freq: 240, type: "triangle", duration: 0.12, gain: 0.1 * volume, delay: 0.22, slideTo: 120 });
    }
  }

  // Wood binding against a hinge: a wavering sawtooth swept upwards.
  creak(duration, gain) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190 + Math.random() * 60, start);
    osc.frequency.linearRampToValueAtTime(330 + Math.random() * 90, start + duration);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 21 + Math.random() * 9;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 26;
    wobble.connect(wobbleGain);
    wobbleGain.connect(osc.frequency);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 900;
    band.Q.value = 3.5;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.06);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(band);
    band.connect(amp);
    amp.connect(this.master);
    osc.start(start);
    wobble.start(start);
    osc.stop(start + duration + 0.05);
    wobble.stop(start + duration + 0.05);
  }

  // A heart attack, heard by everyone: the heart racing and stumbling, then
  // nothing, then the monitor tone that means nothing is coming back.
  heartAttack() {
    const beats = [0, 0.42, 0.78, 1.06, 1.3, 1.5, 1.66, 1.8, 2.25, 2.95];
    beats.forEach((at, i) => {
      const hard = 0.3 + (i / beats.length) * 0.35;
      this.tone({ freq: 62, type: "sine", duration: 0.14, gain: hard, attack: 0.008, delay: at });
      this.tone({ freq: 48, type: "sine", duration: 0.18, gain: hard * 0.75, attack: 0.01, delay: at + 0.13 });
    });
    this.noise({ duration: 0.5, gain: 0.25, filter: 500, delay: 3.2 }); // the body hitting the floor
    this.tone({ freq: 980, type: "sine", duration: 1.7, gain: 0.12, attack: 0.02, delay: 3.5 });
  }

  jump() {
    this.noise({ duration: 0.12, gain: 0.1, filter: 1400 });
    this.tone({ freq: 190, type: "triangle", duration: 0.14, gain: 0.1, slideTo: 260 });
  }

  click() {
    this.tone({ freq: 1500, type: "square", duration: 0.03, gain: 0.1 });
    this.tone({ freq: 900, type: "square", duration: 0.04, gain: 0.08, delay: 0.03 });
  }

  // A school bell: a struck bar with a long shimmering tail, rung twice.
  // The search at the door: a low drum that quickens while they are patted down.
  searchDrum(seconds = 7) {
    if (!this.ctx || !this.enabled) return;
    let at = 0;
    let gap = 0.62;
    while (at < seconds - 0.3) {
      this.tone({ freq: 70, type: "sine", duration: 0.28, gain: 0.3, slideTo: 44, delay: at });
      this.noise({ duration: 0.06, gain: 0.06, filter: 400, delay: at });
      at += gap;
      gap = Math.max(0.2, gap * 0.93);
    }
  }

  // Clean: a soft unresolved chord. It is not over.
  stillAmongYou() {
    if (!this.ctx || !this.enabled) return;
    for (const [freq, delay] of [[220, 0], [261.6, 0.08], [311.1, 0.16], [370, 0.5]]) {
      this.tone({ freq, type: "triangle", duration: 3, gain: 0.1, attack: 0.08, delay });
    }
    this.tone({ freq: 55, type: "sine", duration: 3.2, gain: 0.22, attack: 0.05 });
  }

  // The Killbook comes out of their coat: a hit, and a rising stab.
  killbookFound() {
    if (!this.ctx || !this.enabled) return;
    this.noise({ duration: 0.5, gain: 0.45, filter: 900 });
    this.tone({ freq: 48, type: "sine", duration: 1.4, gain: 0.5 });
    for (const [freq, i] of [[311, 0], [466, 1], [622, 2]]) {
      this.tone({ freq, type: "sawtooth", duration: 1.1, gain: 0.07, attack: 0.02, slideTo: freq * 1.06, delay: i * 0.04 });
    }
  }

  // Two-tone police siren, getting closer.
  siren(seconds = 5) {
    if (!this.ctx || !this.enabled) return;
    for (let at = 0, i = 0; at < seconds; at += 0.55, i += 1) {
      const gain = 0.05 + Math.min(1, at / seconds) * 0.09;
      this.tone({ freq: i % 2 ? 960 : 720, type: "square", duration: 0.52, gain, attack: 0.03, delay: at });
    }
  }

  // Hands meeting, a few pairs at a time.
  highFives(count = 8) {
    if (!this.ctx || !this.enabled) return;
    for (let i = 0; i < count; i += 1) {
      const at = i * 0.28 + Math.random() * 0.12;
      this.noise({ duration: 0.05, gain: 0.35, filter: 3200, delay: at });
    }
  }

  // Civilians win: a brass fanfare over timpani.
  heroic() {
    if (!this.ctx || !this.enabled) return;
    const notes = [
      [392, 0, 0.22], [392, 0.24, 0.12], [392, 0.38, 0.12], [523.3, 0.52, 0.6],
      [466.2, 1.16, 0.28], [523.3, 1.46, 0.28], [659.3, 1.76, 1.6],
    ];
    for (const [freq, delay, duration] of notes) {
      this.tone({ freq, type: "sawtooth", duration, gain: 0.08, attack: 0.02, delay });
      this.tone({ freq: freq / 2, type: "triangle", duration, gain: 0.08, attack: 0.02, delay });
    }
    // The last chord, held.
    for (const freq of [261.6, 329.6, 392, 523.3]) this.tone({ freq, type: "triangle", duration: 2.6, gain: 0.07, attack: 0.05, delay: 1.76 });
    for (const delay of [0, 0.52, 1.76, 1.96, 2.16]) {
      this.tone({ freq: 82, type: "sine", duration: 0.5, gain: 0.35, slideTo: 60, delay });
      this.noise({ duration: 0.12, gain: 0.12, filter: 600, delay });
    }
  }

  // The Killer wins: a deep boom, a slow tritone that will not resolve, and a
  // whisper of noise over the top.
  sinister() {
    if (!this.ctx || !this.enabled) return;
    this.tone({ freq: 36, type: "sine", duration: 4.5, gain: 0.55, attack: 0.02 });
    this.noise({ duration: 1.2, gain: 0.3, filter: 300 });
    for (const [freq, delay] of [[110, 0.3], [155.6, 0.9], [103.8, 1.6], [146.8, 2.2]]) {
      this.tone({ freq, type: "sawtooth", duration: 3.2, gain: 0.06, attack: 0.4, delay, slideTo: freq * 0.97 });
    }
    this.tone({ freq: 1244, type: "sine", duration: 3.5, gain: 0.025, attack: 1.2, delay: 1 });
    this.noise({ duration: 2.5, gain: 0.05, filter: 5000, delay: 1.5 });
  }

  // The roles bell: not the two dings that start the match but the old
  // electric bell, the clapper hammering the gong for a couple of seconds,
  // then one low toll underneath as the roles land.
  revealBell() {
    if (!this.ctx || !this.enabled) return;
    for (let at = 0; at < 2.3; at += 0.043) {
      const fade = at > 1.9 ? (2.3 - at) / 0.4 : 1;
      const jitter = 0.85 + Math.random() * 0.3;
      this.tone({ freq: 1180, type: "triangle", duration: 0.09, gain: 0.07 * fade * jitter, attack: 0.002, delay: at });
      this.tone({ freq: 2950, type: "sine", duration: 0.06, gain: 0.035 * fade * jitter, attack: 0.002, delay: at });
      this.noise({ duration: 0.015, gain: 0.05 * fade, filter: 5200, delay: at });
    }
    // The toll: a low, slightly out-of-tune bell that hangs in the air.
    for (const [ratio, gain] of [[1, 0.3], [2.02, 0.12], [2.93, 0.08], [4.1, 0.05]]) {
      this.tone({ freq: 98 * ratio, type: "sine", duration: 3.6, gain, attack: 0.01, delay: 0.4 });
    }
  }

  schoolBell() {
    if (!this.ctx || !this.enabled) return;
    const partials = [1, 2.76, 5.4, 8.9];
    for (const strike of [0, 0.62]) {
      partials.forEach((ratio, i) => {
        this.tone({
          freq: 523 * ratio,
          type: "sine",
          duration: 2.6 - i * 0.35,
          gain: 0.22 / (i + 1.3),
          attack: 0.004,
          delay: strike,
        });
      });
      this.noise({ duration: 0.05, gain: 0.1, filter: 6000, delay: strike });
    }
  }

  pageTurn() {
    this.noise({ duration: 0.16, gain: 0.14, filter: 3600 });
    this.noise({ duration: 0.12, gain: 0.1, filter: 2400, delay: 0.1 });
  }

  chatBlip() {
    this.tone({ freq: 980, type: "sine", duration: 0.05, gain: 0.08 });
  }

  countdownBeep(final = false) {
    this.tone({ freq: final ? 880 : 660, type: "sine", duration: final ? 0.45 : 0.09, gain: 0.16 });
  }

  // ------------------------------------------------------------ ambience

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 48;
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = 72.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    const amp = ctx.createGain();
    amp.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);
    osc.connect(amp);
    osc2.connect(amp);
    amp.connect(this.master);
    osc.start();
    osc2.start();
    lfo.start();
    this.ambient = { osc, osc2, lfo, amp };
  }

  // 0..1: rises as fewer players remain alive.
  setTension(level) {
    this.tension = level;
    if (!this.ambient) return;
    this.ambient.amp.gain.setTargetAtTime(0.04 + level * 0.06, this.ctx.currentTime, 0.5);
    this.ambient.osc2.frequency.setTargetAtTime(72.5 + level * 6, this.ctx.currentTime, 0.5);
  }

  stopAmbient() {
    if (!this.ambient) return;
    const { osc, osc2, lfo, amp } = this.ambient;
    amp.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    setTimeout(() => {
      osc.stop();
      osc2.stop();
      lfo.stop();
    }, 800);
    this.ambient = null;
  }
}
