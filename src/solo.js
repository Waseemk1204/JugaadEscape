// Solo mode: "Escape Room" (the maze itself is still called the Lobby in the code).
//
// A single-player horror run in an endless Backrooms level. It shares the
// renderer, the audio context and the input handling with the multiplayer game
// and nothing else: no socket, no room, no server. That keeps it playable with
// the back end asleep, and means it cannot destabilise the part that already
// works.
//
// The shape of a run: you are lost. Three fuse boxes are scattered a long way
// out and the compass will not help you find them until you are almost on top
// of one — until then you are navigating by the hum they give off and by luck.
// Something wanders the level with you, in plain sight, and mostly ignores you.
// When it does notice, you get a moment's warning and then a chase you can
// win by breaking away for long enough. You can survive that three times.
// Pulling the last fuse lights the way out and tells it exactly where you are.

import * as THREE from "three";
import { Backrooms, U, PLAYER_RADIUS, FOG_COLOR } from "./three/backrooms.js";
import { Stalker, RANGE } from "./three/stalker.js";
import { createScareCanvas } from "./three/monster.js";
import { SoloProps, FUSE_COUNT, FUSE_HOLD_MS } from "./three/soloprops.js";
import { SoloAudio } from "./soloaudio.js";
import { EscapeScene, ESCAPE } from "./three/escape.js";
import { WakeScene, WAKE } from "./three/wake.js";

const EYE_HEIGHT = 1.62;
const SPEED = { WALK: 118, RUN: 178, CROUCH: 62 };
const STAMINA_MAX = 6.5; // seconds of sprint
const STAMINA_RECOVER = 0.45; // per second, once you have stopped
const STAMINA_DELAY = 1.2; // seconds before recovery starts
const JUMP_HEIGHT = 0.55;
// Leaving the Lobby: its view fades to black, then the street fades up.
const ESCAPE_FADE_OUT_S = 0.7;
const ESCAPE_FADE_IN_S = 0.9;
const JUMP_MS = 520;
const STALKER_DELAY_S = 8; // grace period before it exists at all
// It picks itself up and reappears somewhere else near you on this cadence.
//
// Left to walk, it drifts into a corner of the maze and the run goes quiet for
// minutes at a time. Relocating it keeps it circling you without making it
// cheat: it always lands out of sight and outside its own notice range, so it
// arrives as something you come across rather than something that pounces.
const RELOCATE_EVERY_S = 25;
// Each fuse pulled makes it harder: chases last longer, and it turns up
// near you more often. Indexed by fuses done (0, 1, 2).
const CHASE_LIMIT_S = [10, 12, 13];
const RELOCATE_S = [25, 22, 20];
const LIVES = 3;
const BEST_TIME_KEY = "killbook.solo.best";

// Dying. The run does not end — you wake up somewhere else in the maze, a life
// down, with no idea where you are. Losing your bearings is the punishment;
// the monster taking you is just how it starts.
// The light going off in its face: when each flash lands, how long it lasts,
// and how hard. The first is on the frame of impact.
const FACE_FLASHES = [
  { at: 0, length: 0.09, color: "#ffffff", strength: 0.95 },
  { at: 0.19, length: 0.08, color: "#ff2a14", strength: 0.6 },
  { at: 0.34, length: 0.08, color: "#fff4e6", strength: 0.75 },
];

// Where the exit appears when the lights go out, in metres from the player.
const EXIT_MIN_M = 28;
const EXIT_MAX_M = 50;

// How long its face owns the screen when it takes you.
const FACE_FLASH_S = 0.5;

const DEATH = {
  SEQUENCE_S: 3.2, // how long you spend on the floor watching it
  RESPAWN_MIN: 55 * 32, // how far away you come back, in map pixels
  RESPAWN_MAX: 95 * 32,
  GRACE_S: 5, // it cannot sense you for this long after you come back
};

const $ = (id) => document.querySelector(id);

export class SoloGame {
  constructor({ renderer, canvas, audio, input, look, onQuit }) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.audio = audio;
    this.input = input;
    this.look = look;
    this.onQuit = onQuit;
    this.sound = new SoloAudio(audio);
    this.active = false;
    this.frameId = 0;
    this.el = null;
    this.bound = false;
  }

  // ------------------------------------------------------------------ setup

  cacheDom() {
    if (this.el) return;
    this.el = {
      hud: $("#solo-hud"),
      screen: $("#screen-solo"),
      fuses: $("#solo-fuses"),
      lives: $("#solo-lives"),
      timer: $("#solo-timer"),
      compass: $("#solo-compass"),
      arrow: $("#solo-arrow"),
      compassLabel: $("#solo-compass-label"),
      staminaBar: $("#solo-stamina"),
      stamina: $("#solo-stamina-fill"),
      prompt: $("#solo-prompt"),
      promptLabel: $("#solo-prompt-label"),
      holdFill: $("#solo-hold-fill"),
      vignette: $("#solo-vignette"),
      flash: $("#solo-flash"),
      fade: $("#solo-fade"),
      eyes: $("#solo-eyes"),
      lidTop: $("#solo-eyes .lid.top"),
      lidBottom: $("#solo-eyes .lid.bottom"),
      blood: $("#solo-blood"),
      face: $("#solo-face"),
      strobe: $("#solo-strobe"),
      hint: $("#solo-hint"),
      runBanner: $("#solo-run-banner"),
      end: $("#solo-end"),
      endTitle: $("#solo-end-title"),
      endBody: $("#solo-end-body"),
      endStats: $("#solo-end-stats"),
      retry: $("#solo-retry"),
      quit: $("#solo-quit"),
      leave: $("#solo-leave"),
      torchButton: $("#solo-torch"),
      seed: $("#solo-seed"),
      // Shared with the multiplayer match, so this mode has to leave them sane.
      killbookButton: $("#killbook-button"),
      interactLabel: $("#interact-label"),
    };
    // The whole head, at screen size, ready to be thrown at the player.
    const faceCanvas = createScareCanvas();
    faceCanvas.className = "solo-face-image";
    this.el.face.append(faceCanvas);
    this.el.faceImage = faceCanvas;

    this.el.retry.addEventListener("click", () => this.restart());
    this.el.quit.addEventListener("click", () => this.quit());
    this.el.leave.addEventListener("click", () => this.quit());
    this.el.torchButton?.addEventListener("click", () => this.toggleTorch());
  }

  start(seed = Math.floor(Math.random() * 1e9)) {
    this.cacheDom();
    this.seed = seed >>> 0;
    this.audio.unlock();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG_COLOR);
    // Fog is doing real work here: it hides the chunk boundary, and it stops
    // the endless grid of pillars from reading as a repeating wallpaper.
    this.scene.fog = new THREE.Fog(FOG_COLOR, 3, 22);
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 40);
    this.scene.add(this.camera);

    this.level = new Backrooms(this.scene, this.seed);
    this.stalker = new Stalker(this.scene, this.level);
    this.props = new SoloProps(this.scene, this.level, mulberry32(this.seed ^ 0x5bf03635));
    this.buildTorch();

    // Spawn at the origin of the seed's world, so the same seed is the same run.
    const spawn = this.level.findOpenSpot(0, 0);
    this.player = { x: spawn.x, y: spawn.y, moving: false, running: false, crouching: false, torchOn: true };
    this.props.place(spawn);

    this.yaw = 0;
    this.pitch = 0;
    this.bob = 0;
    this.crouchEase = 0;
    this.jumpAt = -9999;
    this.jumpHeight = 0;
    this.stamina = STAMINA_MAX;
    this.staminaIdle = 0;
    this.winded = false;
    this.torchOn = true;
    this.hold = 0;
    this.stepTimer = 0;
    this.dragTimer = 0;
    this.elapsed = 0;
    this.lives = LIVES;
    this.grace = 0;
    this.shake = 0;
    this.dying = null;
    this.deathDrop = 0;
    this.blackout = false;
    this.fade = 0; // 1 is fully black, used for dying and respawning
    this.runOver = null;
    this.escaped = false;
    this.proximity = 0;
    this.stalkerSpawned = false;
    this.relocateIn = RELOCATE_EVERY_S;
    this.wasHunting = false;
    this.lastTime = performance.now();
    this.hudTimerText = "";
    this.hudFuseText = "";
    this.hudLives = -1;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, matchMedia("(hover: none)").matches ? 1.5 : 2);
    this.pixelRatio = this.maxPixelRatio;
    this.frameMs = 16;
    this.adaptCooldown = 0;

    this.el.screen.classList.remove("hidden");
    this.el.screen.classList.remove("blackout");
    this.el.end.classList.add("hidden");
    this.el.runBanner.classList.add("hidden");
    this.el.hint.classList.remove("faded");
    // On a laptop there is no joystick, so the opening line has to carry the
    // controls as well as the premise.
    this.el.hint.textContent = matchMedia("(hover: hover) and (pointer: fine)").matches
      ? "WASD to move · Shift to sprint · C to crouch · E to use · F for torch. Three fuse boxes are out there. Listen for them."
      : "Three fuse boxes are out there somewhere. Listen for them.";
    this.el.seed.textContent = `SEED ${this.seed.toString(36).toUpperCase().slice(0, 6)}`;
    this.canvas.classList.remove("hidden");
    // The action stack is the match's, borrowed. There is no Killbook here, and
    // "Interact" is always the same thing: pulling a fuse.
    this.el.killbookButton.classList.add("hidden");
    this.el.interactLabel.textContent = "Use";
    this.setFuseText();

    this.bindControls();
    this.look.enable();
    this.input.locked = false;
    this.sound.start();
    this.active = true;
    this.resize();
    this.frameId = requestAnimationFrame((t) => this.loop(t));
  }

  // The player's torch. In a level this bright it is not about seeing — it is
  // about the trade: light makes you easier to notice.
  buildTorch() {
    this.torch = new THREE.SpotLight(0xffeec4, 16, 20, 0.6, 0.7, 1.4);
    this.torch.position.set(0.14, -0.05, 0);
    this.camera.add(this.torch);
    this.torch.target.position.set(0, 0, -1);
    this.camera.add(this.torch.target);

    this.torchModel = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x3a3f47, toneMapped: false }),
    );
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x565c65, toneMapped: false }),
    );
    head.position.z = -0.18;
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false }),
    );
    lens.position.z = -0.225;
    this.torchModel.add(body, head, lens);
    this.torchModel.position.set(0.44, -0.4, -0.9);
    this.torchModel.scale.setScalar(0.72);
    this.camera.add(this.torchModel);
  }

  // Borrow the shared input handlers for as long as this mode owns the screen,
  // then hand them back exactly as they were.
  bindControls() {
    if (this.bound) return;
    this.bound = true;
    this.savedLook = this.look.onLook;
    this.savedJump = this.input.onJump;
    this.savedTorch = this.input.onToggleTorch;
    this.look.onLook = (dx, dy) => {
      // While you are dying, the camera is not yours.
      if (this.dying) return;
      this.yaw -= dx;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - dy));
    };
    this.input.onJump = () => this.jump();
    this.input.onToggleTorch = () => this.toggleTorch();
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    this.onKey = (event) => {
      if (event.key === "Escape" && this.active && !this.runOver) this.quit();
    };
    window.addEventListener("keydown", this.onKey);
  }

  unbindControls() {
    if (!this.bound) return;
    this.bound = false;
    this.look.onLook = this.savedLook;
    this.input.onJump = this.savedJump;
    this.input.onToggleTorch = this.savedTorch;
    window.removeEventListener("resize", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKey);
  }

  resize() {
    this.width = Math.round(window.visualViewport?.width || window.innerWidth);
    this.height = Math.round(window.visualViewport?.height || window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / Math.max(1, this.height);
    this.camera.updateProjectionMatrix();
    this.cutscene?.resize(this.width, this.height);
  }

  // Hold the frame rate by trading resolution, not smoothness. Frames longer
  // than ~60ms are stalls — a backgrounded tab, a GC pause — and counting them
  // as "slow GPU" would permanently downgrade a machine that is actually fine.
  adaptResolution(dt) {
    const ms = dt * 1000;
    if (document.hidden || ms > 60) return;
    this.frameMs += (ms - this.frameMs) * 0.05;
    this.adaptCooldown -= dt;
    if (this.adaptCooldown > 0) return;
    if (this.frameMs > 23 && this.pixelRatio > 0.7) {
      this.pixelRatio = Math.max(0.7, this.pixelRatio - 0.2);
      this.adaptCooldown = 2.5;
      this.resize();
    } else if (this.frameMs < 13 && this.pixelRatio < this.maxPixelRatio) {
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.2);
      this.adaptCooldown = 4;
      this.resize();
    }
  }

  // ------------------------------------------------------------------- loop

  loop(time) {
    if (!this.active) return;
    // Book the next frame before doing any work, so one bad frame is one bad
    // frame rather than a game frozen on the spot.
    this.frameId = requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min((time - this.lastTime) / 1000 || 0, 0.05);
    this.lastTime = time;
    const elapsed = time / 1000;
    this.adaptResolution(dt);

    // Walking out: the Lobby fades to black before the street appears.
    if (this.escapeFade !== null && this.escapeFade !== undefined && !this.cutscene) {
      this.escapeFade = Math.min(1, this.escapeFade + dt / ESCAPE_FADE_OUT_S);
      this.el.fade.style.opacity = String(this.escapeFade);
      if (this.escapeFade >= 1) {
        this.escapeFade = null;
        this.cutscene = new EscapeScene(this.renderer, { width: this.width, height: this.height });
        this.el.screen.classList.add("escaping");
        this.sound.escapeRun(ESCAPE.FADE_AT + 0.6);
      } else {
        this.renderCamera(dt, elapsed);
        this.renderer.render(this.scene, this.camera);
      }
      return;
    }
    // Out of the door and down the street, or awake in the dark room at the
    // end: nothing else runs.
    if (this.cutscene) {
      if (this.cutscene instanceof WakeScene) this.updateWake(dt);
      else this.updateEscape(dt);
      return;
    }
    // After either ending there is only black behind the card.
    if (this.runOver && this.cardShown) {
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear();
      return;
    }

    if (this.runOver) this.updateEnding(dt, elapsed);
    else {
      if (this.dying) this.updateDying(dt);
      this.update(dt, elapsed);
    }

    this.level.update(this.player.x, this.player.y, elapsed, dt);
    this.props.update(elapsed);
    this.sound.setListener({ x: this.player.x, y: this.player.y, yaw: this.yaw });
    this.renderCamera(dt, elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt, elapsed) {
    const input = this.input;
    input.poll();
    this.elapsed += dt;
    this.grace = Math.max(0, this.grace - dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);

    // --- movement, relative to where you are looking. Frozen while dying:
    // the whole point is that you cannot do anything about it.
    const frozen = Boolean(this.dying);
    // Run the bar dry and you are winded: no sprinting until it has filled
    // back up, and it fills on its own whether or not sprint is still on.
    const wantsRun = input.running && (this.blackout || !this.winded);
    const speed = input.crouching ? SPEED.CROUCH : wantsRun ? SPEED.RUN : SPEED.WALK;
    let moving = false;
    if (!frozen && !input.locked && (input.x || input.y)) {
      const forwardX = -Math.sin(this.yaw);
      const forwardY = -Math.cos(this.yaw);
      const rightX = Math.cos(this.yaw);
      const rightY = -Math.sin(this.yaw);
      let mx = forwardX * -input.y + rightX * input.x;
      let my = forwardY * -input.y + rightY * input.x;
      const length = Math.hypot(mx, my) || 1;
      mx /= length;
      my /= length;
      // Axes are resolved separately so walking into a wall slides along it
      // rather than stopping dead.
      this.moveAxis(mx * speed * dt, 0);
      this.moveAxis(0, my * speed * dt);
      moving = true;
    }
    this.player.moving = moving;
    this.player.running = moving && wantsRun;
    this.player.crouching = input.crouching;
    this.player.torchOn = this.torchOn;

    // --- stamina. Sprinting is the fast way out of trouble and the fast way
    // into it: it is loud, and it runs out.
    if (this.blackout) {
      // Once the lights are out there is nothing left to ration: the last leg
      // is a flat-out run and the game should not be arguing with you about it.
      this.stamina = STAMINA_MAX;
      this.winded = false;
    } else if (this.player.running) {
      this.stamina = Math.max(0, this.stamina - dt);
      this.staminaIdle = 0;
      // Sprint stays switched on: you drop to a walk, and pick the pace back
      // up by yourself once you have your breath.
      if (this.stamina <= 0) this.winded = true;
    } else {
      this.staminaIdle += dt;
      if (this.staminaIdle > STAMINA_DELAY) {
        this.stamina = Math.min(STAMINA_MAX, this.stamina + dt * STAMINA_MAX * STAMINA_RECOVER);
        if (this.stamina >= STAMINA_MAX) this.winded = false;
      }
    }

    const sinceJump = performance.now() - this.jumpAt;
    this.jumpHeight = sinceJump < JUMP_MS ? Math.sin((sinceJump / JUMP_MS) * Math.PI) * JUMP_HEIGHT : 0;

    this.updateFootsteps(dt);
    this.updateStalker(dt, elapsed);
    if (!frozen) this.updateObjective(dt);
    this.sound.setFuseHums(this.props.fuses, this.player.x, this.player.y);
    this.updateHud();
  }

  moveAxis(dx, dy) {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    const radius = this.player.crouching ? PLAYER_RADIUS - 3 : PLAYER_RADIUS;
    if (!this.level.isBlocked(nx, ny, radius)) {
      this.player.x = nx;
      this.player.y = ny;
    }
  }

  updateFootsteps(dt) {
    if (!this.player.moving) {
      this.stepTimer = 0;
      return;
    }
    this.stepTimer -= dt;
    if (this.stepTimer > 0) return;
    this.stepTimer = this.player.crouching ? 0.74 : this.player.running ? 0.3 : 0.47;
    this.audio.footstep(this.player.crouching ? 0.25 : 0.8, this.player.running);
  }

  // ------------------------------------------------------------- the monster

  updateStalker(dt, elapsed) {
    // A short grace period. Being hunted from the first second is not tense,
    // it is just punishing before the player knows the controls.
    if (!this.stalkerSpawned && this.elapsed > STALKER_DELAY_S) {
      this.stalkerSpawned = this.stalker.spawn(this.player.x, this.player.y);
      this.relocateIn = this.relocateEvery();
    }
    if (!this.stalkerSpawned) {
      this.sound.setMonster({ x: this.player.x, y: this.player.y, proximity: 0, hunting: false, active: false });
      return;
    }

    // Move it back into your orbit on a timer — but never while it is aware of
    // you, or relocating would rescue you from a chase you were losing, and
    // never once the power is out, because from then on it is genuinely coming
    // for you and teleporting would make that meaningless.
    this.relocateIn -= dt;
    if (this.relocateIn <= 0) {
      this.relocateIn = this.relocateEvery();
      const idle = this.stalker.brain.state === "wander";
      if (idle && !this.blackout && !this.dying) this.stalker.spawn(this.player.x, this.player.y);
    }

    const result = this.stalker.update(dt, this.player, elapsed);
    this.proximity = result.proximity;
    this.stalkerState = result.state;

    // Tell the player, plainly, when the chase starts and when it ends. A
    // player who cannot tell whether they got away never learns that running
    // works, and stops trying.
    // Tell the player, plainly, when a chase starts and when it is over. A
    // chase is noticing, hunting and searching together — keying this off the
    // hunt alone meant breaking line of sight (which drops it into searching)
    // never announced the escape, and being re-spotted replayed the sting.
    const chasing = result.state === "notice" || result.state === "hunt" || result.state === "search";
    if (chasing && !this.wasHunting) {
      this.sound.noticed();
      this.flash("It has seen you. Get out of its sight, or just stay ahead of it.");
      this.shake = Math.min(1, this.shake + 0.35);
    } else if (!chasing && this.wasHunting) {
      this.sound.lostYou();
      this.flash("It lost you.");
    }
    this.wasHunting = chasing;

    this.sound.setMonster({
      x: this.stalker.x,
      y: this.stalker.y,
      proximity: result.proximity,
      hunting: result.hunting,
      staring: result.staring,
      active: true,
    });
    this.sound.updateHeartbeat(dt);

    // Its body dragging over the carpet, audible before it is visible.
    if (result.distance < RANGE.DREAD * 1.6) {
      this.dragTimer -= dt;
      if (this.dragTimer <= 0) {
        this.dragTimer = result.hunting ? 0.42 : 0.78;
        this.sound.drag(Math.max(0, 1 - result.distance / (RANGE.DREAD * 1.6)) ** 1.5);
      }
    }

    if (result.caught && this.grace <= 0 && !this.dying) this.die();
  }

  // It had you.
  //
  // You do not get pulled free and left standing where it happened, which is
  // what the old version did and which made being caught feel like a fee
  // rather than an event. You die on the floor while it stands over you, and
  // then you are somewhere else entirely, a life down and with no idea where.
  die() {
    if (this.dying || this.runOver) return;
    this.lives -= 1;
    this.dying = { t: 0, respawned: false };
    this.input.locked = true;
    this.sound.death();
    this.shake = 1;
    // Hard cut, on the same frame as the scream. No transition — the whole
    // effect is that it is simply there, filling the screen, before you have
    // registered anything else.
    this.el.face.classList.add("hit");
    // And the first flash on this same frame. The dying sequence only starts
    // running next frame, which would put the white hit a frame behind the
    // scream and the face.
    const first = FACE_FLASHES[0];
    this.el.strobe.style.background = first.color;
    this.el.strobe.style.opacity = String(first.strength);
  }

  updateDying(dt) {
    const dying = this.dying;
    dying.t += dt;

    // The face holds for half a second, and everything about it is violent:
    // it shudders side to side, and the light goes off in its face three times.
    if (dying.t < FACE_FLASH_S) {
      const k = dying.t / FACE_FLASH_S; // 0 → 1 across the flash

      // Left-right tremor. Random every frame rather than a sine, because a
      // smooth wobble reads as an animation and a jitter reads as the camera
      // being hit. It starts violent and settles as the screen goes out.
      const tremor = (Math.random() * 2 - 1) * 6 * (1 - k * 0.7);
      const lurch = Math.random() * 0.04;
      this.el.faceImage.style.transform = `translateX(${tremor.toFixed(2)}vw) scale(${(1.06 + lurch).toFixed(3)})`;

      // Three hard flashes of light: white on impact, red, white again. Not a
      // continuous strobe — flicker faster than about three a second is a
      // known seizure trigger, and a jump scare should not also be a medical
      // risk. Three distinct hits land as violence without being that.
      const flash = FACE_FLASHES.find((f) => dying.t >= f.at && dying.t < f.at + f.length);
      if (flash) {
        const into = (dying.t - flash.at) / flash.length;
        this.el.strobe.style.background = flash.color;
        this.el.strobe.style.opacity = String((flash.strength * (1 - into)).toFixed(3));
        this.el.faceImage.style.filter = `contrast(1.5) brightness(${(1.2 + (1 - into) * 0.9).toFixed(2)})`;
      } else {
        this.el.strobe.style.opacity = "0";
        this.el.faceImage.style.filter = "contrast(1.35) brightness(1)";
      }
    } else if (this.el.face.classList.contains("hit")) {
      this.el.face.classList.remove("hit");
      this.el.strobe.style.opacity = "0";
    }

    // Black out over the first second, hold, then fade back up somewhere new.
    if (dying.t < 1.1) this.fade = Math.min(1, Math.max(0, (dying.t - FACE_FLASH_S * 0.6) / 0.8));
    else if (!dying.respawned && dying.t > 1.6) {
      dying.respawned = true;
      if (this.lives <= 0) {
        // Let the face and the scream finish before the card takes the screen.
        setTimeout(() => this.endRun(false), 900);
        dying.respawned = true;
        dying.over = true;
        return;
      }
      this.respawn();
    } else if (dying.respawned && !dying.over) {
      this.fade = Math.max(0, 1 - (dying.t - 1.6) / 1.4);
      if (dying.t > DEATH.SEQUENCE_S) {
        this.dying = null;
        this.fade = 0;
        this.deathDrop = 0;
        this.input.locked = false;
      }
    }
    // The camera goes down with you, and gets back up on the other side.
    this.deathDrop = dying.respawned
      ? Math.max(0, 1 - (dying.t - 1.6) / 0.9)
      : Math.min(1, dying.t / 0.8);
    // And it keeps looking at the thing standing over you — but only until you
    // are somewhere else, or it would swing the new view around too.
    if (this.stalkerSpawned && !dying.respawned) {
      const target = Math.atan2(-(this.stalker.x - this.player.x), -(this.stalker.y - this.player.y));
      const delta = ((target - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += delta * Math.min(1, dt * 7);
      this.pitch += (0.55 - this.pitch) * Math.min(1, dt * 3);
    }
  }

  // Wake up a long way off, facing nothing in particular.
  respawn() {
    const angle = Math.random() * Math.PI * 2;
    const distance = DEATH.RESPAWN_MIN + Math.random() * (DEATH.RESPAWN_MAX - DEATH.RESPAWN_MIN);
    const spot = this.level.findOpenSpot(
      Math.round((this.player.x + Math.cos(angle) * distance) / 48),
      Math.round((this.player.y + Math.sin(angle) * distance) / 48),
    );
    this.player.x = spot.x;
    this.player.y = spot.y;
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.deathDrop = 0;
    this.stamina = STAMINA_MAX;
    this.winded = false;
    this.grace = DEATH.GRACE_S;
    this.proximity = 0;
    this.wasHunting = false;
    // It does not follow you here. It has to find you again, from wherever it
    // was — which in the endgame it will, quickly.
    this.stalker.banish(this.player.x, this.player.y, DEATH.GRACE_S);
    this.sound.respawn();
    this.flash(
      this.lives === 1
        ? "You are somewhere else. One life left."
        : `You are somewhere else. ${this.lives} lives left.`,
    );
  }

  // --------------------------------------------------------------- objective

  updateObjective(dt) {
    const props = this.props;
    if (props.atExit(this.player.x, this.player.y)) {
      this.endRun(true);
      return;
    }

    const fuse = props.fuseInReach(this.player.x, this.player.y);
    if (!fuse) {
      this.hold = 0;
      this.showPrompt(null);
      return;
    }

    if (this.input.holding) {
      this.hold += dt * 1000;
      if (this.hold >= FUSE_HOLD_MS) {
        this.hold = 0;
        const complete = props.pull(fuse);
        this.sound.lever();
        this.sound.powerSurge(complete);
        this.setFuseText();
        this.showPrompt(null);
        if (complete) {
          // The bargain, and the whole shape of the last leg: the lights go
          // out across the floor, the way out is marked from here on, it stops
          // looking and starts running, and so can you — for as long as you
          // like. Everything that was making the torch decorative is gone at
          // once.
          this.beginBlackout();
        } else {
          this.tighten();
          this.flash(`Fuse ${props.fuses.filter((f) => f.done).length} of ${FUSE_COUNT}. It is getting harder to shake.`);
        }
        return;
      }
    } else {
      this.hold = Math.max(0, this.hold - dt * 2200);
    }
    this.showPrompt("Pull the fuse", this.hold / FUSE_HOLD_MS);
  }

  fusesDone() {
    return this.props.fuses.filter((f) => f.done).length;
  }

  relocateEvery() {
    return RELOCATE_S[Math.min(this.fusesDone(), RELOCATE_S.length - 1)];
  }

  // After each fuse: the next chase lasts longer, and it comes round sooner.
  tighten() {
    const done = Math.min(this.fusesDone(), CHASE_LIMIT_S.length - 1);
    this.stalker.brain.chaseLimit = CHASE_LIMIT_S[done];
    this.relocateIn = Math.min(this.relocateIn, this.relocateEvery());
  }

  beginBlackout() {
    this.blackout = true;
    // The way out is close — never more than 50m in a straight line — and on
    // the far side of you from it, so the last leg is a sprint and a race
    // rather than a trek or a run straight into its arms.
    this.props.moveExitNear(this.player.x, this.player.y, {
      minDistance: EXIT_MIN_M * 32,
      maxDistance: EXIT_MAX_M * 32,
      avoid: this.stalkerSpawned ? { x: this.stalker.x, y: this.stalker.y } : null,
    });
    this.level.setBlackout(true);
    this.stalker.brain.goFinal();
    this.sound.blackout();
    this.shake = 1;
    this.torchOn = true;
    this.el.torchButton?.setAttribute("aria-pressed", "true");
    this.el.torchButton?.classList.add("active");
    this.el.screen.classList.add("blackout");
    this.flash("The lights are out. It knows where you are. Run — you will not tire now.");
    this.el.runBanner.classList.remove("hidden");
  }

  // -------------------------------------------------------------- rendering

  renderCamera(dt, elapsed) {
    const player = this.player;
    if (this.player.moving) this.bob += dt * (this.player.running ? 11 : 7.4);
    const bobY = this.player.moving ? Math.sin(this.bob) * 0.034 : 0;
    const bobX = this.player.moving ? Math.cos(this.bob * 0.5) * 0.019 : 0;
    const crouchTarget = this.player.crouching ? 0.45 : 0;
    this.crouchEase += (crouchTarget - this.crouchEase) * Math.min(1, dt * 12);

    // Screen shake, used sparingly: being noticed, and being killed.
    const shake = this.shake ** 2;
    // While dying the shake is side to side and much harder — the same
    // tremor as the face, carried into the world as the screen goes out.
    const sideways = this.dying ? 2.6 : 1;
    const upDown = this.dying ? 0.35 : 1;
    const shakeX = shake * Math.sin(elapsed * 47) * 0.09 * sideways;
    const shakeY = shake * Math.sin(elapsed * 61 + 1.7) * 0.07 * upDown;

    // Dying drops the eyeline to the carpet, which is the only time the game
    // takes the camera off you.
    const floored = (this.deathDrop || 0) * (EYE_HEIGHT - 0.22);
    this.camera.position.set(
      player.x * U + bobX + shakeX,
      EYE_HEIGHT + bobY - this.crouchEase + this.jumpHeight + shakeY - floored,
      player.y * U,
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, shake * Math.sin(elapsed * 39) * 0.06, "YXZ");

    // Everything closes in as it gets nearer: the fog tightens and the view
    // narrows a fraction. Neither is loud enough to notice consciously.
    const p = this.proximity;
    // With the power off the fog is the darkness itself, so it comes in hard
    // and loses its colour — otherwise a dark level still glows yellow at the
    // edges and the torch has nothing to cut through.
    const dark = this.level.blackout ?? 0;
    this.scene.fog.color.setRGB(
      0.435 * (1 - dark) + 0.012 * dark,
      0.376 * (1 - dark) + 0.011 * dark,
      0.188 * (1 - dark) + 0.014 * dark,
    );
    this.scene.background.copy(this.scene.fog.color);
    this.scene.fog.far = (22 - dark * 8) - p * 7;
    const fov = 78 - p * 5;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    this.torch.visible = this.torchOn;
    this.torchModel.visible = this.torchOn && !this.dying;
    if (this.torchOn) {
      const flicker = 0.93 + Math.sin(elapsed * 7.1) * 0.04 + Math.sin(elapsed * 18.3) * 0.02;
      this.torch.intensity = 16 * flicker;
      const sway = this.player.moving ? Math.sin(elapsed * 9) * 0.012 : Math.sin(elapsed * 1.6) * 0.004;
      this.torchModel.position.y = -0.4 + sway;
      this.torchModel.rotation.z = sway * 0.6;
    }
  }

  updateEnding(dt, elapsed) {
    // On a catch the camera keeps running so the thing stays on screen; it is
    // the only good look at it the player ever gets.
    this.proximity = Math.min(1, this.proximity + dt * 0.6);
    this.shake = Math.max(0, this.shake - dt * 0.4);
    if (this.stalkerSpawned && !this.escaped) {
      this.stalker.animate(dt, elapsed, { proximity: 1 });
      const dx = this.stalker.x * U - this.camera.position.x;
      const dz = this.stalker.y * U - this.camera.position.z;
      const target = Math.atan2(-dx, -dz);
      const delta = ((target - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += delta * Math.min(1, dt * 6);
    }
    this.applyVignette();
  }

  // ------------------------------------------------------------------- HUD

  updateHud() {
    const seconds = Math.floor(this.elapsed);
    const text = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (text !== this.hudTimerText) {
      this.hudTimerText = text;
      this.el.timer.textContent = text;
    }
    if (this.lives !== this.hudLives) {
      this.hudLives = this.lives;
      this.el.lives.innerHTML = "";
      for (let i = 0; i < LIVES; i += 1) {
        const pip = document.createElement("span");
        pip.className = i < this.lives ? "solo-life" : "solo-life spent";
        this.el.lives.append(pip);
      }
    }
    const staminaLeft = this.stamina / STAMINA_MAX;
    this.el.stamina.style.transform = `scaleX(${staminaLeft})`;
    this.el.staminaBar.classList.toggle("spent", staminaLeft < 0.995);
    this.el.staminaBar.classList.toggle("winded", Boolean(this.winded));

    // The compass always points at the next thing: the nearest fuse, or the
    // exit once it exists. A bearing is not a route — the maze between you and
    // it is the game.
    const goal = this.props.nearestTo(this.player.x, this.player.y);
    const live = Boolean(goal);
    this.el.compass.classList.toggle("dead", !live);
    if (live) {
      const bearing = Math.atan2(goal.x - this.player.x, -(goal.y - this.player.y));
      this.el.arrow.style.transform = `rotate(${bearing - this.yaw}rad)`;
      const metres = Math.round(Math.hypot(goal.x - this.player.x, goal.y - this.player.y) * U);
      this.el.compassLabel.textContent = goal.kind === "exit" ? `EXIT · ${metres}m` : `FUSE · ${metres}m`;
    } else {
      this.el.compassLabel.textContent = "NO SIGNAL";
    }

    this.applyVignette();
    this.el.fade.style.opacity = String(this.fade);
    if (this.elapsed > 26) this.el.hint.classList.add("faded");
  }

  applyVignette() {
    const p = this.proximity;
    const style = this.el.vignette.style;
    style.opacity = String(Math.min(0.92, p * 1.15));
    // It only turns red once it is genuinely close, so the colour means
    // something rather than being permanent decoration.
    style.setProperty("--solo-dread", p > 0.55 ? "rgba(96,10,10,0.9)" : "rgba(8,7,4,0.92)");
  }

  flashScreen(strength) {
    const flash = this.el.flash;
    flash.style.transition = "none";
    flash.style.opacity = String(strength);
    // Two frames so the browser actually paints the opaque state before the
    // transition back takes over.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        flash.style.transition = "opacity 700ms ease-out";
        flash.style.opacity = "0";
      }),
    );
  }

  setFuseText() {
    const done = this.props.fuses.filter((f) => f.done).length;
    const text = `${done} / ${FUSE_COUNT}`;
    if (text === this.hudFuseText) return;
    this.hudFuseText = text;
    this.el.fuses.textContent = text;
  }

  showPrompt(label, progress = 0) {
    const shown = Boolean(label);
    this.el.prompt.classList.toggle("hidden", !shown);
    if (!shown) return;
    this.el.promptLabel.textContent = label;
    this.el.holdFill.style.transform = `scaleX(${Math.min(1, progress)})`;
  }

  flash(message) {
    this.el.hint.textContent = message;
    this.el.hint.classList.remove("faded");
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.el.hint.classList.add("faded"), 4500);
  }

  // ------------------------------------------------------------- transitions

  jump() {
    if (!this.active || this.runOver || this.dying) return;
    if (performance.now() - this.jumpAt < JUMP_MS) return;
    this.jumpAt = performance.now();
    this.audio.jump();
  }

  toggleTorch() {
    if (!this.active || this.runOver) return;
    this.torchOn = !this.torchOn;
    this.audio.click();
    this.el.torchButton?.setAttribute("aria-pressed", String(this.torchOn));
    this.el.torchButton?.classList.toggle("active", this.torchOn);
    this.flash(this.torchOn ? "Torch on. It can see the light." : "Torch off. Harder to see, harder to be seen.");
  }

  endRun(escaped) {
    if (this.runOver) return;
    this.runOver = true;
    this.el.runBanner.classList.add("hidden");
    this.escaped = escaped;
    this.input.locked = true;
    this.look.disable();
    this.showPrompt(null);
    this.dying = null;
    // The fade and the face sit above everything, including this card.
    this.fade = 0;
    this.el.fade.style.opacity = "0";
    this.el.face.classList.remove("hit");
    if (this.el.strobe) this.el.strobe.style.opacity = "0";

    if (escaped) {
      // Through the door and out into the city first; the card comes after.
      // Everything of the Lobby goes quiet — its hum and every sound it
      // makes — while the view fades out; the street fades in from black.
      this.sound.setMonster({ x: this.player.x, y: this.player.y, proximity: 0, hunting: false, active: false });
      this.sound.stop();
      this.el.vignette.style.opacity = "0";
      this.escapeFade = 0;
      return;
    }
    // Out of lives: you wake up somewhere dark first. The card comes after.
    this.sound.caught();
    this.sound.stop();
    this.cutscene = new WakeScene(this.renderer, { width: this.width, height: this.height });
    this.el.screen.classList.add("waking");
    this.el.vignette.style.opacity = "0";
    this.el.face.classList.remove("hit");
    this.el.fade.style.opacity = "0";
    this.sound.wakeUp(WAKE);
  }

  // Waking: eyelids, blood in your eyes and a blur that clears, then the
  // torch, the look round, the look up — and the cut to black.
  updateWake(dt) {
    const scene = this.cutscene;
    scene.update(dt);
    const t = scene.t;
    const open = scene.eyes();
    this.el.lidTop.style.transform = `translateY(${(-open * 100).toFixed(1)}%)`;
    this.el.lidBottom.style.transform = `translateY(${(open * 100).toFixed(1)}%)`;
    // Blood at the edges of your sight, heaviest as you come round.
    this.el.blood.style.opacity = String(Math.max(0.55, 1 - t * 0.06).toFixed(2));
    const blur = Math.max(0, 6 - Math.max(0, t - WAKE.OPEN_2) * 4);
    this.canvas.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : "";
    if (t >= WAKE.CUT) {
      // Cut, not fade: black on the frame it reaches you.
      this.el.fade.style.opacity = "1";
      this.el.blood.style.opacity = "0";
    } else {
      scene.render();
    }
    if (scene.done) {
      scene.dispose();
      this.cutscene = null;
      this.canvas.style.filter = "";
      this.el.screen.classList.remove("waking");
      this.el.fade.style.opacity = "0";
      this.showEndCard(false);
    }
  }

  // The run out: step the scene, one groan from the doorway when you look
  // back, then fade to black and show the card.
  updateEscape(dt) {
    const scene = this.cutscene;
    scene.update(dt);
    // Up out of black at the start, back down into it at the end.
    const fadeIn = Math.max(0, 1 - scene.t / ESCAPE_FADE_IN_S);
    const fadeOut = Math.max(0, Math.min(1, (scene.t - ESCAPE.FADE_AT) / (ESCAPE.LENGTH - ESCAPE.FADE_AT - 0.3)));
    this.el.fade.style.opacity = String(Math.max(fadeIn, fadeOut));
    scene.render();
    if (scene.done) {
      scene.dispose();
      this.cutscene = null;
      this.el.screen.classList.remove("escaping");
      this.sound.escaped();
      this.el.fade.style.opacity = "0";
      this.showEndCard(true);
    }
  }

  showEndCard(escaped) {
    this.cardShown = true;
    const seconds = Math.floor(this.elapsed);
    const time = formatSeconds(seconds);
    const best = escaped ? this.recordBest(seconds) : null;

    this.el.endTitle.textContent = escaped ? "You got out" : "You died";
    this.el.endBody.textContent = escaped
      ? "It watched you go from the doorway. It did not follow."
      : "It was waiting on the ceiling the whole time.";
    const fuses = this.props.fuses.filter((f) => f.done).length;
    this.el.endStats.innerHTML = "";
    const stat = (label, value) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = label;
      const figure = document.createElement("strong");
      figure.textContent = value;
      li.append(name, figure);
      this.el.endStats.append(li);
    };
    stat("Time", time);
    stat("Fuses", `${fuses} / ${FUSE_COUNT}`);
    if (best !== null) stat("Best escape", formatSeconds(best));
    this.el.end.classList.remove("hidden");
    this.el.end.classList.toggle("escaped", escaped);
  }

  recordBest(seconds) {
    let best = seconds;
    try {
      const stored = Number(localStorage.getItem(BEST_TIME_KEY));
      if (stored > 0) best = Math.min(stored, seconds);
      localStorage.setItem(BEST_TIME_KEY, String(best));
    } catch {
      // Private browsing and blocked storage are fine; the run still counted.
    }
    return best;
  }

  restart() {
    this.teardown();
    this.start();
  }

  quit() {
    this.teardown();
    this.el.screen.classList.add("hidden");
    this.onQuit?.();
  }

  teardown() {
    this.active = false;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.flashTimer);
    this.unbindControls();
    this.look.disable();
    this.input.locked = false;
    this.input.runOn = false;
    this.input.crouchOn = false;
    this.input.syncStanceButtons();
    this.sound.stop();
    this.runOver = null;
    this.dying = null;
    this.el.face.classList.remove("hit");
    if (this.el.strobe) this.el.strobe.style.opacity = "0";
    this.el.end.classList.add("hidden");
    this.el.runBanner.classList.add("hidden");
    this.cutscene?.dispose();
    this.cutscene = null;
    this.escapeFade = null;
    this.cardShown = false;
    this.canvas.style.filter = "";
    this.el.screen?.classList.remove("escaping", "waking");
    this.el.fade.style.opacity = "0";
    this.stalker?.dispose();
    this.props?.dispose();
    this.level?.dispose();
    this.scene = null;
  }
}

function formatSeconds(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Small seeded PRNG, so a given seed always lays the fuse boxes out the same
// way as the maze around them.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
