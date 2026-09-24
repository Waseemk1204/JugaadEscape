// Sound for the solo mode. Everything is synthesised on top of the existing
// GameAudio context, so this mode still ships without a single audio file.
//
// The important part is that the monster is *placed*. Its growl, its breathing
// and the drag of its body all run through a panner sitting at its position in
// the world, with the listener pinned to the camera — so the sound tells you
// which way it is coming from and how far off it is, and running the other way
// is a decision you can make with your ears before you ever see it.

const M = 32; // map pixels per metre

// The one sound in this project that is a recording rather than an oscillator.
// Everything else is synthesised, but a human scream is not something you can
// fake convincingly from a formant bank, and the difference is the whole point
// of the moment it plays.
const SCREAM_URL = "./assets/audio/scream.m4a";

export class SoloAudio {
  constructor(audio) {
    this.audio = audio;
    this.nodes = null;
    this.proximity = 0;
    this.heartTimer = 0;
    this.screamBuffer = null;
  }

  // Fetched and decoded well before anyone dies.
  //
  // In two halves on purpose: the download needs no audio context, so it can
  // start the moment the page boots, while decoding has to wait for the first
  // user gesture to unlock one. Doing both at the start of a run meant the
  // first death of a session could beat the file and fall back to the
  // synthesised voice, which is exactly the one time it must not.
  async loadScream() {
    if (this.screamBuffer) return;
    if (!this.screamBytes) {
      this.screamBytes = fetch(SCREAM_URL, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`scream ${response.status}`);
          return response.arrayBuffer();
        })
        .catch((error) => {
          console.warn("scream unavailable, falling back to the synthesised voice", error);
          return null;
        });
    }
    const bytes = await this.screamBytes;
    const ctx = this.ctx;
    if (!bytes || !ctx || this.screamBuffer) return;
    try {
      // decodeAudioData detaches the buffer it is given, so it gets a copy —
      // otherwise a second attempt after a failed decode has nothing to read.
      this.screamBuffer = await ctx.decodeAudioData(bytes.slice(0));
    } catch (error) {
      console.warn("scream could not be decoded", error);
    }
  }

  // Plays the recording. Returns false when it is not available yet, so the
  // caller can fall back rather than dying in silence.
  playScream(gain = 1, { delay = 0, rate = 1 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.screamBuffer) return false;
    const source = ctx.createBufferSource();
    source.buffer = this.screamBuffer;
    source.playbackRate.value = rate;
    const level = ctx.createGain();
    level.gain.value = gain;
    // Through the same hard-walled room as everything else, so it belongs to
    // the corridor rather than arriving dry on top of it.
    source.connect(level).connect(this.audio.master);
    // A touch of room, well under the dry signal: the recording has to arrive
    // in the corridor, not in a cathedral.
    const wet = ctx.createGain();
    wet.gain.value = 0.18 * gain;
    level.connect(wet);
    wet.connect(this.screamReverb(ctx));
    source.start(ctx.currentTime + delay);
    return true;
  }

  get ctx() {
    return this.audio.ctx;
  }

  start() {
    this.audio.unlock();
    const ctx = this.ctx;
    if (!ctx || this.nodes) return;
    this.loadScream();
    const out = this.audio.master;

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noiseBuffer;

    // ---- the room: mains hum and the hiss of the tubes. Not positional; it is
    // coming from every ceiling in every direction, forever.
    const hum = ctx.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 100;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "bandpass";
    humFilter.frequency.value = 220;
    humFilter.Q.value = 6;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.035;
    hum.connect(humFilter).connect(humGain).connect(out);

    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer;
    hiss.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "bandpass";
    hissFilter.frequency.value = 3600;
    hissFilter.Q.value = 1.4;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.014;
    hiss.connect(hissFilter).connect(hissGain).connect(out);

    // ---- the monster's own bed of sound, placed in the world.
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 3.5;
    panner.maxDistance = 40;
    panner.rolloffFactor = 1.6;
    const monsterGain = ctx.createGain();
    monsterGain.gain.value = 0;
    panner.connect(monsterGain).connect(out);

    // A low growl with a slow beat in it, and a filtered rasp on top that
    // reads as breathing.
    const growlA = ctx.createOscillator();
    growlA.type = "sawtooth";
    growlA.frequency.value = 43;
    const growlB = ctx.createOscillator();
    growlB.type = "sawtooth";
    growlB.frequency.value = 45.7; // the beat between the two is the unease
    const growlFilter = ctx.createBiquadFilter();
    growlFilter.type = "lowpass";
    growlFilter.frequency.value = 340;
    growlA.connect(growlFilter);
    growlB.connect(growlFilter);
    growlFilter.connect(panner);

    const breath = ctx.createBufferSource();
    breath.buffer = noiseBuffer;
    breath.loop = true;
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = "bandpass";
    breathFilter.frequency.value = 520;
    breathFilter.Q.value = 2.4;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.0001;
    const breathLfo = ctx.createOscillator();
    breathLfo.type = "sine";
    breathLfo.frequency.value = 0.42; // a slow, wet in-and-out
    const breathLfoGain = ctx.createGain();
    breathLfoGain.gain.value = 0.55;
    breathLfo.connect(breathLfoGain).connect(breathGain.gain);
    breath.connect(breathFilter).connect(breathGain).connect(panner);

    // ---- a high whine that only exists at point-blank range.
    const whine = ctx.createOscillator();
    whine.type = "sine";
    whine.frequency.value = 1180;
    const whineLfo = ctx.createOscillator();
    whineLfo.frequency.value = 5.5;
    const whineLfoGain = ctx.createGain();
    whineLfoGain.gain.value = 40;
    whineLfo.connect(whineLfoGain).connect(whine.frequency);
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineGain).connect(out);

    for (const node of [hum, hiss, growlA, growlB, breath, breathLfo, whine, whineLfo]) node.start();
    this.nodes = {
      hum, humGain, hiss, hissGain,
      growlA, growlB, growlFilter, breath, breathLfo, breathGain,
      whine, whineGain, whineLfo,
      panner, monsterGain,
    };
    this.fuseHums = new Map();
  }

  // ------------------------------------------------------------- positioning

  // Pin the listener to the camera. Without this the panner has nothing to be
  // relative to and every sound arrives dead centre.
  setListener({ x, y, yaw }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const lx = x / M;
    const lz = y / M;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (l.positionX) {
      l.positionX.value = lx;
      l.positionY.value = 1.6;
      l.positionZ.value = lz;
      l.forwardX.value = fx;
      l.forwardY.value = 0;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else if (l.setPosition) {
      l.setPosition(lx, 1.6, lz);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  static place(panner, x, y, height = 1.2) {
    if (!panner) return;
    const px = x / M;
    const pz = y / M;
    if (panner.positionX) {
      panner.positionX.value = px;
      panner.positionY.value = height;
      panner.positionZ.value = pz;
    } else if (panner.setPosition) {
      panner.setPosition(px, height, pz);
    }
  }

  // Called every frame with where the monster is and what it is doing.
  setMonster({ x, y, proximity, hunting, staring, active }) {
    this.proximity = active ? proximity : 0;
    const ctx = this.ctx;
    if (!this.nodes || !ctx) return;
    const t = ctx.currentTime;
    SoloAudio.place(this.nodes.panner, x, y, 0.9);

    // Audible well before it is dangerous, so you get to hear it coming and
    // pick a direction.
    const base = active ? 0.34 + proximity * 0.5 : 0;
    this.nodes.monsterGain.gain.setTargetAtTime(hunting ? base * 1.5 : base, t, 0.25);
    this.nodes.growlFilter.frequency.setTargetAtTime(340 + proximity * 700, t, 0.4);
    this.nodes.growlA.frequency.setTargetAtTime(hunting ? 52 : 43, t, 0.5);
    this.nodes.growlB.frequency.setTargetAtTime(hunting ? 55.4 : 45.7, t, 0.5);
    this.nodes.breathGain.gain.setTargetAtTime(active ? 0.05 + proximity * 0.12 : 0.0001, t, 0.3);
    this.nodes.breathLfo.frequency.setTargetAtTime(staring ? 0.9 : hunting ? 1.5 : 0.42, t, 0.4);
    this.nodes.whineGain.gain.setTargetAtTime(proximity > 0.66 ? (proximity - 0.66) * 0.1 : 0, t, 0.3);
    this.nodes.humGain.gain.setTargetAtTime(0.035 + proximity * proximity * 0.05, t, 0.5);
  }

  // A faint electrical hum from each fuse box that has not been pulled. It is
  // the only navigation aid in the level that is not the compass, and it is
  // what makes wandering pay off.
  setFuseHums(fuses, px, py) {
    const ctx = this.ctx;
    if (!ctx || !this.nodes) return;
    for (const fuse of fuses) {
      const distance = Math.hypot(fuse.x - px, fuse.y - py) / M;
      const wanted = !fuse.done && distance < 30;
      let hum = this.fuseHums.get(fuse.id);
      if (wanted && !hum) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = 118;
        const buzz = ctx.createOscillator();
        buzz.type = "square";
        buzz.frequency.value = 236;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 900;
        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 2.5;
        panner.maxDistance = 30;
        panner.rolloffFactor = 2.2;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(filter);
        buzz.connect(filter);
        filter.connect(panner).connect(gain).connect(this.audio.master);
        osc.start();
        buzz.start();
        hum = { osc, buzz, gain, panner };
        this.fuseHums.set(fuse.id, hum);
      }
      if (!hum) continue;
      if (!wanted) {
        hum.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        continue;
      }
      SoloAudio.place(hum.panner, fuse.x, fuse.y, 1.4);
      hum.gain.gain.setTargetAtTime(0.09, ctx.currentTime, 0.5);
    }
  }

  // ------------------------------------------------------------------ stings

  // A heartbeat that speeds up with proximity, driven from the game loop.
  updateHeartbeat(dt) {
    if (this.proximity < 0.32) {
      this.heartTimer = 0;
      return;
    }
    this.heartTimer -= dt;
    if (this.heartTimer > 0) return;
    this.heartTimer = 1.05 - this.proximity * 0.6;
    const gain = 0.1 + this.proximity * 0.3;
    this.audio.tone({ freq: 58, type: "sine", duration: 0.16, gain, attack: 0.01 });
    this.audio.tone({ freq: 46, type: "sine", duration: 0.2, gain: gain * 0.7, attack: 0.012, delay: 0.2 });
  }

  // Its body dragging over carpet — placed, so you hear which side it is on.
  drag(volume) {
    if (volume <= 0.02 || !this.nodes) return;
    this.positional(this.nodes.panner, () => {
      this.audio.noise({ duration: 0.3, gain: 0.3 * volume, filter: 380 });
      this.audio.tone({ freq: 54, type: "sine", duration: 0.14, gain: 0.26 * volume });
    });
  }

  // GameAudio's one-shots go straight to the master bus, which is right for UI
  // and wrong for anything in the world. This reroutes a one-shot through a
  // panner for as long as it takes to fire.
  positional(panner, fire) {
    const original = this.audio.master;
    if (!panner) {
      fire();
      return;
    }
    this.audio.master = panner;
    try {
      fire();
    } finally {
      this.audio.master = original;
    }
  }

  // The moment it turns and sees you. Deliberately not a scream: it is a held,
  // rising note, so the scream still means something when it comes.
  noticed() {
    this.audio.tone({ freq: 220, type: "sawtooth", duration: 1.1, gain: 0.2, slideTo: 330 });
    this.audio.tone({ freq: 55, type: "sine", duration: 1.3, gain: 0.32 });
    this.audio.noise({ duration: 0.9, gain: 0.14, filter: 700 });
  }

  // It gave up. A falling note and the room going quiet again — the player
  // needs to *know* they got away, or they never learn that running works.
  lostYou() {
    this.audio.tone({ freq: 180, type: "triangle", duration: 1.4, gain: 0.16, slideTo: 90 });
  }

  // ------------------------------------------------------------- the scream
  //
  // The scream is a recording, and only a recording. There used to be a
  // synthesised voice here — a glottal source through a formant bank with a
  // waveshaper tearing it — kept as a fallback for the seconds before the file
  // finished decoding. It was a good imitation and it was still obviously an
  // imitation, and because it fired exactly when the real one was missing, the
  // only time anyone ever heard it was the first death of a session. It is
  // gone. The fetch starts at boot instead, and if it somehow is not ready the
  // moment plays without a voice rather than with the wrong one.

  // A short, unpleasant room. Not a nice hall — a corridor with hard walls.
  //
  // One shared node, wired to the bus exactly once when it is built. It used
  // to be connected again on every scream, and a WebAudio node connected to
  // the same destination N times is N times as loud: after a few deaths the
  // 1.6-second tail was drowning the recording that fed it, which is what made
  // a real voice come out sounding like a synthesiser.
  screamReverb(ctx) {
    if (this.screamIR) return this.screamIR;
    const seconds = 1.6;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        // A couple of hard early reflections, then a rough tail.
        const t = i / length;
        let v = (Math.random() * 2 - 1) * (1 - t) ** 2.2;
        if (i === Math.floor(ctx.sampleRate * 0.021) || i === Math.floor(ctx.sampleRate * 0.037)) v = 0.8;
        data[i] = v;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    convolver.connect(this.audio.master);
    this.screamIR = convolver;
    return convolver;
  }

  // Dying.
  //
  // The loudest thing in the game, and the only moment the player is not in
  // control. Four layers, in this order and no other: the grab, the scream,
  // the floor going, and the ring that outlasts both.
  death() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.audio.master;

    // 1. The grab. One short physical hit, no pitch, out of the way inside a
    // fifth of a second so it does not sit on top of the voice.
    this.audio.noise({ duration: 0.11, gain: 0.8, filter: 4400 });
    this.audio.noise({ duration: 0.2, gain: 0.5, filter: 1100 });

    // 2. The scream, on this frame, and it *is* the event.
    //
    // Nothing else vocal plays — not a pitched-down double, not a synthesised
    // stand-in over the top, not a second copy a beat later. Every one of those
    // was tried and every one of them came out sounding like a synthesiser
    // playing over a recording, because that is exactly what it was.
    // Loud. The master bus has a limiter on it, so this is driving the mix
    // hard rather than clipping — and the level that reads as "a scream in the
    // room with you" is a long way above the level that reads as "an effect".
    if (!this.playScream(2.4)) {
      // The file is not here. Fall silent on the voice rather than faking it:
      // a wrong scream is worse than none, and the hit and the sub still carry
      // the moment.
      console.warn("scream not decoded yet — death played without it");
      this.loadScream();
    }

    // 3. The floor going, underneath and slightly behind: it must never be
    // competing with the scream's attack.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    const subAmp = ctx.createGain();
    const subAt = now + 0.22;
    sub.frequency.setValueAtTime(90, subAt);
    sub.frequency.exponentialRampToValueAtTime(19, subAt + 2.6);
    subAmp.gain.setValueAtTime(0.0001, subAt);
    subAmp.gain.exponentialRampToValueAtTime(0.42, subAt + 0.12);
    subAmp.gain.exponentialRampToValueAtTime(0.0001, subAt + 2.8);
    sub.connect(subAmp).connect(out);
    sub.start(subAt);
    sub.stop(subAt + 3);

    // 4. And the ring left behind, once the voice has gone.
    const ring = ctx.createOscillator();
    ring.type = "sine";
    const ringAt = now + 1.4;
    ring.frequency.setValueAtTime(3050, ringAt);
    ring.frequency.linearRampToValueAtTime(2550, ringAt + 2.4);
    const ringAmp = ctx.createGain();
    ringAmp.gain.setValueAtTime(0.0001, ringAt);
    ringAmp.gain.exponentialRampToValueAtTime(0.05, ringAt + 0.3);
    ringAmp.gain.exponentialRampToValueAtTime(0.0001, ringAt + 2.6);
    ring.connect(ringAmp).connect(out);
    ring.start(ringAt);
    ring.stop(ringAt + 2.8);

    // Everything it was making goes quiet under the scream, so the ring is all
    // that is left in the room afterwards.
    if (this.nodes) {
      this.nodes.monsterGain.gain.setTargetAtTime(0, now + 0.3, 0.4);
      this.nodes.humGain.gain.setTargetAtTime(0.006, now + 0.3, 0.5);
      this.nodes.whineGain.gain.setTargetAtTime(0, now + 0.3, 0.4);
    }
  }

  // Coming back: a breath, and the room fading in around you.
  respawn() {
    this.audio.noise({ duration: 0.9, gain: 0.3, filter: 700 });
    this.audio.tone({ freq: 62, type: "sine", duration: 1.6, gain: 0.3, slideTo: 96 });
    const ctx = this.ctx;
    if (this.nodes && ctx) this.nodes.humGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.8);
  }

  // Pulling a fuse: the handle's clack, then the power catching.
  lever() {
    this.audio.tone({ freq: 240, type: "square", duration: 0.07, gain: 0.26 });
    this.audio.noise({ duration: 0.1, gain: 0.3, filter: 2600 });
    this.audio.tone({ freq: 90, type: "sine", duration: 0.24, gain: 0.3, delay: 0.06 });
  }

  powerSurge(final = false) {
    this.audio.tone({ freq: 70, type: "sine", duration: 0.7, gain: 0.34, slideTo: 44 });
    this.audio.noise({ duration: 0.5, gain: 0.2, filter: 900 });
    if (final) {
      this.audio.tone({ freq: 196, type: "triangle", duration: 1.2, gain: 0.26, delay: 0.25 });
      this.audio.tone({ freq: 294, type: "triangle", duration: 1.4, gain: 0.22, delay: 0.45 });
    }
  }

  // The lights going out across the whole floor at once.
  blackout() {
    this.audio.noise({ duration: 1.2, gain: 0.5, filter: 480 });
    this.audio.tone({ freq: 240, type: "sawtooth", duration: 1.4, gain: 0.34, slideTo: 30 });
    this.audio.tone({ freq: 58, type: "sine", duration: 2.6, gain: 0.44 });
    const ctx = this.ctx;
    if (this.nodes && ctx) {
      // The mains hum dies with them.
      this.nodes.humGain.gain.setTargetAtTime(0.004, ctx.currentTime + 0.4, 0.5);
      this.nodes.hissGain.gain.setTargetAtTime(0.002, ctx.currentTime + 0.4, 0.5);
    }
  }

  caught() {
    // The run is over. Nothing plays here: dying already screamed, on the
    // frame the face landed. Calling death() again from the end-of-run handler
    // is what put a second scream a couple of seconds after the first, and it
    // was the one the player actually noticed — the "new scream after death".
    const ctx = this.ctx;
    if (!this.nodes || !ctx) return;
    this.nodes.monsterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  }

  // The street after the Lobby: no footsteps, no breathing — only the city,
  // humming ahead, and a horn a long way off.
  escapeRun(seconds = 9) {
    const audio = this.audio;
    // The city: a low rumble of traffic, a horn a long way off.
    audio.noise({ duration: seconds, gain: 0.07, filter: 260 });
    audio.tone({ freq: 415, type: "square", duration: 0.5, gain: 0.025, delay: 5.6 });
    audio.tone({ freq: 392, type: "square", duration: 0.7, gain: 0.025, delay: 6.2 });
  }

  // Waking up in the dark room, after the last life. All of it is scheduled
  // against the scene's beats (see WAKE in three/wake.js), so it stays in time.
  wakeUp(beats) {
    const audio = this.audio;
    // A ringing in the ears that fades as you come round.
    audio.tone({ freq: 3100, type: "sine", duration: 3.2, gain: 0.03, attack: 0.4, delay: beats.OPEN_1 - 0.4 });
    // Groggy breathing, getting quicker as it dawns on you.
    let gap = 1.3;
    for (let at = 0.3; at < beats.POUNCE; at += gap, gap = Math.max(0.45, gap * 0.9)) {
      audio.noise({ duration: 0.4, gain: 0.1, filter: 900, delay: at });
      audio.noise({ duration: 0.55, gain: 0.14, filter: 520, delay: at + gap * 0.45 });
    }
    // Water dripping somewhere.
    for (const at of [0.8, 2.6, 4.1, 5.9, 7.2]) {
      audio.tone({ freq: 1500, type: "sine", duration: 0.09, gain: 0.05, slideTo: 700, delay: at });
    }
    // The torch: click, and the bulb catching.
    audio.noise({ duration: 0.03, gain: 0.3, filter: 4200, delay: beats.TORCH });
    audio.tone({ freq: 2400, type: "square", duration: 0.02, gain: 0.08, delay: beats.TORCH });
    // Something moving on the ceiling while you look up: slow creaks and
    // clicking joints, closer and closer.
    for (let at = beats.UP, i = 0; at < beats.SEEN; at += 0.34 - i * 0.02, i += 1) {
      audio.noise({ duration: 0.05, gain: 0.08 + i * 0.015, filter: 2600, delay: at });
      audio.tone({ freq: 190 - i * 8, type: "sawtooth", duration: 0.12, gain: 0.03 + i * 0.005, delay: at + 0.05 });
    }
    // Seen: a sharp intake of breath and a rising dissonance.
    audio.noise({ duration: 0.3, gain: 0.3, filter: 2400, delay: beats.SEEN });
    for (const [freq, detune] of [[233, 0], [247, 0], [349, 12]]) {
      audio.tone({ freq, type: "sawtooth", duration: beats.CUT - beats.SEEN, gain: 0.05, attack: 0.4, slideTo: freq * 1.5, detune, delay: beats.SEEN });
    }
    // It drops: the scream, and on the cut a hit that is all bass and then
    // nothing at all.
    this.playScream(1.4, { delay: beats.POUNCE - 0.05, rate: 1.05 });
    audio.noise({ duration: 0.6, gain: 0.7, filter: 1400, delay: beats.CUT });
    audio.tone({ freq: 44, type: "sine", duration: 1.6, gain: 0.8, slideTo: 28, delay: beats.CUT });
  }

  escaped() {
    this.audio.tone({ freq: 392, type: "triangle", duration: 0.8, gain: 0.3 });
    this.audio.tone({ freq: 523, type: "triangle", duration: 0.9, gain: 0.28, delay: 0.16 });
    this.audio.tone({ freq: 659, type: "sine", duration: 1.4, gain: 0.26, delay: 0.34 });
  }

  stop() {
    const nodes = this.nodes;
    const ctx = this.ctx;
    if (!nodes || !ctx) return;
    this.nodes = null;
    for (const gain of [nodes.humGain, nodes.hissGain, nodes.monsterGain, nodes.whineGain]) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    }
    for (const hum of this.fuseHums.values()) hum.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    const stopping = [
      nodes.hum, nodes.hiss, nodes.growlA, nodes.growlB, nodes.breath,
      nodes.breathLfo, nodes.whine, nodes.whineLfo,
      ...[...this.fuseHums.values()].flatMap((h) => [h.osc, h.buzz]),
    ];
    this.fuseHums.clear();
    setTimeout(() => {
      for (const node of stopping) {
        try {
          node.stop();
        } catch {}
      }
    }, 700);
  }
}
