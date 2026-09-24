// Jugaad Escape.
//
// 6 PM, Bharatiya Jugaad Bank. Motu Sir has pulled down the shutter,
// padlocked the collapsible gate, bolted the wooden doors and announced that
// nobody goes home until he says so. You are going home.
//
// The loop: sit at your desk looking busy while he watches the floor from his
// glass cabin. When he is not looking — on the phone, on his round, in the
// loo — get up, search drawers and almirahs for everyday office things, bend
// them into tools, and work on the three doors between you and the street.
// Make noise and he comes out: "Kaun hai?!", then 10–15 seconds to get back in
// your chair. Get caught and he slaps you back to your desk. Five slaps and
// you are here till midnight.
//
// This file is the glue: movement, the camera, the HUD, and turning the
// boss's decisions (shared/boss-ai.js) and the jugaad rules (shared/jugaad.js)
// into things that happen on screen.

import * as THREE from "three";
import { BankMap, SPOTS, TILE, U, PLAYER_RADIUS, roomAt, cellPoint } from "../shared/bank-map.js";
import { BossBrain } from "../shared/boss-ai.js";
import {
  ITEMS, CONTAINERS, DOORS, CODE_NOTE, SLOTS,
  placeItems, lockedDoors, doorUnlocked, waysFor, makeItem, spend, combine, nearRecipes, jugaadScore, jugaadTitle,
} from "../shared/jugaad.js";
import { BankWorld } from "./three/bank.js";
import { Boss } from "./three/boss.js";
import { DoorVisuals } from "./three/doors.js";
import { BankAudio } from "./bankaudio.js";
import { EscapeScene, ESCAPE } from "./three/escape.js";
import { IntroScene, LockupScene } from "./cutscenes.js";
import { floorModel, heldModel, itemIcon } from "./three/items.js";

const EYE = { STAND: 1.6, CROUCH: 0.98, SEATED: 1.18 };
const SPEED = { WALK: 100, RUN: 150, CROUCH: 52 };
const ATTEMPTS = 5;
const REACH = 1.7 * 32; // map pixels you can reach from where you stand
const START_MINUTES = 18 * 60; // 6:00 PM
const GAME_MINUTES_PER_SECOND = 1 / 6; // the wall clock runs ten times fast
const BEST_KEY = "jugaad.escape.best";

// How loud the player is on foot (0..1, see BossBrain.hearNoise).
const STEP_NOISE = { walk: 0.07, run: 0.3, crouch: 0 };

// Where you stand to work each door's main action, and the gadgets you can
// set off as decoys. In grid cells.
const DOOR_POINTS = { wooden: [16.9, 7.5], gate: [16.9, 4.5], shutter: [16.9, 0.55] };
const DECOYS = [
  { id: "photocopier", at: [20.1, 18.35], label: "Print 50 copies of the circular", cooldown: 40 },
  { id: "landline", at: [26.2, 9.65], label: "Ring Sir's extension from the enquiry phone", cooldown: 60 },
  { id: "cash", at: [9.7, 14.65], label: "Switch on the note-counting machine", cooldown: 30 },
];

// Plain-language descriptions of what a door step wants, for hints.
const TAG_WORDS = {
  hook: "something long with a hook",
  card: "a thin plastic card",
  blade: "a thin strip of metal",
  masterkey: "the right key",
  gatekey: "the gate key",
  picks: "a lockpick",
  crudepick: "a lockpick",
  shim: "a thin metal shim",
  smash: "something very heavy",
  oil: "oil or grease",
};

const ESCAPE_FADE_OUT_S = 0.7;
const ESCAPE_FADE_IN_S = 0.9;

const $ = (id) => document.querySelector(id);

export class JugaadGame {
  constructor({ renderer, canvas, audio, input, look, onQuit }) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.audio = audio;
    this.input = input;
    this.look = look;
    this.onQuit = onQuit;
    this.sound = new BankAudio(audio);
    this.active = false;
    this.el = null;
    this.bound = false;
  }

  // ------------------------------------------------------------------ setup

  cacheDom() {
    if (this.el) return;
    this.el = {
      screen: $("#screen-solo"),
      hud: $("#solo-hud"),
      flash: $("#solo-flash"),
      fade: $("#solo-fade"),
      thappad: $("#thappad"),
      clock: $("#hud-clock"),
      attempts: $("#hud-attempts"),
      boss: $("#hud-boss"),
      bossText: $("#hud-boss-text"),
      doors: $("#hud-doors"),
      eye: $("#hud-eye"),
      eyeFill: $("#hud-eye-fill"),
      seated: $("#hud-seated"),
      prompt: $("#solo-prompt"),
      promptLabel: $("#solo-prompt-label"),
      promptSub: $("#solo-prompt-sub"),
      holdTrack: $("#solo-prompt .hold-track"),
      holdFill: $("#solo-hold-fill"),
      subtitle: $("#hud-subtitle"),
      hint: $("#solo-hint"),
      noise: $("#hud-noise"),
      inventory: $("#hud-inventory"),
      itemNote: $("#hud-item-note"),
      crosshair: $("#solo-hud .crosshair"),
      cine: $("#cine"),
      cineSkip: $("#cine-skip"),
      titleFlash: $("#title-flash"),
      end: $("#solo-end"),
      endEyebrow: $("#solo-end-eyebrow"),
      endTitle: $("#solo-end-title"),
      endBody: $("#solo-end-body"),
      endStats: $("#solo-end-stats"),
      endHacks: $("#solo-end-hacks"),
      retry: $("#solo-retry"),
      quit: $("#solo-quit"),
      leave: $("#solo-leave"),
      useButton: $("#use-button"),
      combineButton: $("#combine-button"),
      interactLabel: $("#interact-label"),
    };
    this.el.retry.addEventListener("click", () => this.restart());
    this.el.quit.addEventListener("click", () => this.quit());
    this.el.leave.addEventListener("click", () => this.quit());
    this.el.cineSkip.addEventListener("click", () => this.cinematic?.skip());
    this.el.useButton?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.useItem();
    });
    this.el.combineButton?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.combineItems();
    });
    this.el.inventory.addEventListener("pointerdown", (e) => {
      const slot = e.target.closest("[data-slot]");
      if (!slot) return;
      e.preventDefault();
      this.selectSlot(Number(slot.dataset.slot));
    });
  }

  start(seed = Math.floor(Math.random() * 1e9)) {
    this.cacheDom();
    this.seed = seed >>> 0;
    this.random = mulberry32(this.seed);
    this.audio.unlock();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
    this.scene.add(this.camera);

    // What you are holding is drawn in a pass of its own over the world, so
    // it never sinks into a wall you are standing against.
    this.handScene = new THREE.Scene();
    this.handScene.add(new THREE.AmbientLight(0xfff6e6, 1.5));
    const handLight = new THREE.DirectionalLight(0xffffff, 2);
    handLight.position.set(0.5, 1, 0.6);
    this.handScene.add(handLight);
    this.handCam = new THREE.PerspectiveCamera(72, 1, 0.01, 5);
    this.hand = new THREE.Group();
    this.handCam.add(this.hand);
    this.handScene.add(this.handCam);
    this.handId = null;
    this.handRaise = 0;

    this.map = new BankMap();
    this.world = new BankWorld(this.scene);
    this.doorVisuals = new DoorVisuals(this.scene);
    this.brain = new BossBrain(this.map, mulberry32(this.seed ^ 0x9e3779b9));
    this.bossBody = new Boss(this.scene);

    // What is hidden where, this run.
    const placed = placeItems(mulberry32(this.seed ^ 0x5bf03635));
    this.contents = placed.contents;
    this.junk = placed.junk;
    this.code = placed.code;
    this.knowsCode = false;
    this.searched = new Set();
    this.doors = lockedDoors();
    this.inventory = [makeItem("phone")];
    this.selected = 0;
    this.floorItems = [];
    this.floorMeshes = new Map();
    this.keysTaken = false;
    this.cooldowns = {};
    this.pending = []; // delayed noises: { at, x, y, loudness }

    this.player = { ...SPOTS.playerChair, seated: true, crouching: false, running: false, moving: false };
    this.yaw = 0;
    this.pitch = -0.08;
    this.bob = 0;
    this.eye = EYE.SEATED;
    this.shake = 0;
    this.stepTimer = 0;
    this.bossStepDistance = 0;
    this.lastBoss = { x: this.brain.x, y: this.brain.y };
    this.pulseTimer = 0;
    this.wasNoticing = false;

    this.elapsed = 0;
    this.attempts = ATTEMPTS;
    this.stats = { slaps: 0, spotted: 0, searched: 0, crafted: 0, decoys: 0, log: [] };
    this.hold = null;
    this.target = null;
    this.slap = null;
    this.runOver = null;
    this.escaped = false;
    this.escapeFade = null;
    this.cutscene = null;
    this.cardShown = false;
    this.paused = true; // until the intro is dismissed
    this.hintsShown = new Set();
    this.fade = 0;
    this.hud = {};
    this.lastTime = performance.now();
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, matchMedia("(hover: none)").matches ? 1.5 : 2);
    this.pixelRatio = this.maxPixelRatio;
    this.frameMs = 16;
    this.adaptCooldown = 0;

    this.el.screen.classList.remove("hidden");
    this.el.end.classList.add("hidden");
    this.el.hint.classList.add("faded");
    this.el.subtitle.classList.add("hidden");
    this.el.fade.style.opacity = "0";
    this.el.thappad.classList.add("hidden");
    this.el.interactLabel.textContent = "Use";
    this.canvas.classList.remove("hidden");
    this.renderInventory();
    this.renderDoors();

    this.bindControls();
    this.input.locked = true;
    this.active = true;
    this.resize();
    // The shift opens on a scene: Sir locking everybody in.
    this.sound.start();
    this.startCinematic(new IntroScene(this));
    this.frameId = requestAnimationFrame((t) => this.loop(t));
  }

  // --------------------------------------------------------------- scenes

  startCinematic(scene) {
    this.cinematic = scene;
    this.el.screen.classList.add("cinematic");
    document.body.classList.add("cinematic");
    this.el.cine.classList.remove("hidden");
    this.showPrompt(null);
  }

  endCinematic() {
    const scene = this.cinematic;
    this.cinematic = null;
    scene?.dispose();
    this.el.screen.classList.remove("cinematic");
    document.body.classList.remove("cinematic");
    this.el.cine.classList.add("hidden");
  }

  showTitleFlash() {
    const el = this.el.titleFlash;
    el.classList.remove("hidden", "show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(this.titleTimer);
    this.titleTimer = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  // The fifth slap does not send you back to your desk. He has somewhere
  // else in mind.
  startLockup() {
    this.runOver = true;
    this.slap = null;
    this.input.locked = true;
    this.look.disable();
    this.showPrompt(null);
    this.sound.stopBusy();
    this.el.thappad.classList.add("hidden");
    this.startCinematic(new LockupScene(this));
  }

  finishLockup() {
    this.el.screen.classList.add("ending");
    this.sound.stop();
    this.sound.gameOver();
    this.showEndCard(false);
    this.el.fade.style.opacity = "0";
  }

  // The opening scene is over (or skipped): the shift starts.
  beginShift() {
    if (!this.active) return;
    this.paused = false;
    this.audio.unlock();
    this.sound.start();
    this.look.enable();
    this.input.locked = false;
    this.player = { ...SPOTS.playerChair, seated: true, crouching: false, running: false, moving: false };
    this.yaw = 0;
    this.pitch = -0.08;
    this.eye = EYE.SEATED;
    this.brain.reset();
    this.lastBoss = { x: this.brain.x, y: this.brain.y };
    this.el.seated.classList.remove("hidden");
    this.tutorial();
  }

  tutorial() {
    const laptop = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const steps = [
      [3500, "You're at your desk, looking busy. Sir watches the floor from his glass cabin — mostly he stares at his screen."],
      [10000, laptop
        ? "Press E (or just walk) to get up. Hold E to search drawers, bags and almirahs. C to crouch behind desks."
        : "Walk to get up. Hold Use to search drawers, bags and almirahs. Crouch to hide behind desks."],
      [18000, "Every minute Sir walks a round past your desk. Every other time he goes to the loo instead — then his cabin is empty."],
      [26000, "Make a noise and he'll shout \"Kaun hai?!\" — you then have 10–15 seconds to get back in your chair. Get caught and it's a thappad."],
    ];
    this.tutorialTimers = steps.map(([ms, text]) => setTimeout(() => this.active && !this.runOver && this.flash(text, 7000), ms));
  }

  // Borrow the shared input for as long as the shift lasts.
  bindControls() {
    if (this.bound) return;
    this.bound = true;
    this.savedLook = this.look.onLook;
    this.savedKey = this.input.onKey;
    this.look.onLook = (dx, dy) => {
      if (this.slap || this.paused) return;
      this.yaw -= dx;
      this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - dy));
    };
    this.input.onKey = (key) => this.onKey(key);
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
  }

  unbindControls() {
    if (!this.bound) return;
    this.bound = false;
    this.look.onLook = this.savedLook;
    this.input.onKey = this.savedKey;
    window.removeEventListener("resize", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
  }

  onKey(key) {
    if (!this.active) return false;
    if (key === "escape" && !this.runOver) {
      this.quit();
      return true;
    }
    if (this.cinematic) {
      if (key === "enter" || key === "e" || key === " ") this.cinematic.skip();
      return true;
    }
    if (this.paused) return true;
    if (this.runOver || this.slap) return false;
    if (/^[1-5]$/.test(key)) {
      this.selectSlot(Number(key) - 1);
      return true;
    }
    if (key === "f") {
      this.useItem();
      return true;
    }
    if (key === "g") {
      this.combineItems();
      return true;
    }
    if (key === "q") {
      this.dropItem();
      return true;
    }
    return false;
  }

  resize() {
    this.width = Math.round(window.visualViewport?.width || window.innerWidth);
    this.height = Math.round(window.visualViewport?.height || window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / Math.max(1, this.height);
    this.camera.updateProjectionMatrix();
    if (this.handCam) {
      this.handCam.aspect = this.camera.aspect;
      this.handCam.updateProjectionMatrix();
    }
    this.cutscene?.resize(this.width, this.height);
  }

  // Hold the frame rate by trading resolution, not smoothness.
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
    this.frameId = requestAnimationFrame((t) => this.loop(t));
    // Never negative (a clock that jumps back), never more than a stall's worth.
    const dt = Math.max(0, Math.min((time - this.lastTime) / 1000 || 0, 0.05));
    this.lastTime = time;
    const now = time / 1000;
    this.adaptResolution(dt);

    // Out under the shutter: fade to black, then the street.
    if (this.escapeFade !== null && !this.cutscene) {
      this.escapeFade = Math.min(1, this.escapeFade + dt / ESCAPE_FADE_OUT_S);
      this.el.fade.style.opacity = String(this.escapeFade);
      if (this.escapeFade >= 1) {
        this.escapeFade = null;
        this.cutscene = new EscapeScene(this.renderer, { width: this.width, height: this.height });
        this.sound.escaped();
      } else {
        this.renderWorld(dt, now);
      }
      return;
    }
    if (this.cutscene) {
      this.updateEscape(dt);
      return;
    }
    // A phone held upright: everything waits (see main.js).
    if (this.blocked && !this.runOver) {
      this.renderWorld(0, now);
      return;
    }
    if (this.cinematic) {
      this.cinematic.update(dt, now);
      this.renderWorld(dt, now);
      return;
    }
    if (this.runOver && this.cardShown) {
      this.renderWorld(dt, now);
      return;
    }

    if (!this.paused && !this.runOver) {
      if (this.slap) this.updateSlap(dt, now);
      else this.update(dt, now);
    }
    this.renderWorld(dt, now);
  }

  renderWorld(dt, now) {
    this.world.update(now, dt);
    this.world.setClock(START_MINUTES + this.elapsed * GAME_MINUTES_PER_SECOND);
    this.world.setPropVisible("boss-keys", this.brain.away && !this.keysTaken);
    this.doorVisuals.update(this.doors, dt);
    this.syncFloorItems(now);
    // While a scene plays it drives Sir and the camera itself.
    if (!this.cinematic) {
      if (!this.slap) this.animateBoss(dt, now);
      this.sound.setListener({ x: this.player.x, y: this.player.y, yaw: this.yaw });
      this.renderCamera(dt, now);
    }
    this.renderer.render(this.scene, this.camera);
    this.updateHand(dt, now);
    if (this.hand.visible) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.handScene, this.handCam);
      this.renderer.autoClear = true;
    }
  }

  // The selected item, in your right hand at the bottom of the screen. It
  // drops out of view and comes back up when you switch, bobs as you walk,
  // and works away while you hold E on something.
  updateHand(dt, now) {
    const selected = this.inventory[this.selected];
    const showing = !this.cinematic && !this.slap && !this.runOver && !this.paused && !this.player.seated;
    const id = showing && selected ? selected.id : null;
    if (id !== this.handId) {
      this.handId = id;
      this.hand.clear();
      this.handRaise = 0;
      const model = id ? heldModel(id) : null;
      if (model) this.hand.add(model);
    }
    this.hand.visible = Boolean(this.handId && this.hand.children.length);
    if (!this.hand.visible) return;
    this.handRaise = Math.min(1, this.handRaise + dt * 4);
    const ease = 1 - (1 - this.handRaise) ** 3;
    const p = this.player;
    const walk = p.moving ? Math.sin(this.bob) * 0.012 : Math.sin(now * 1.4) * 0.004;
    const sway = p.moving ? Math.cos(this.bob * 0.5) * 0.01 : 0;
    const working = this.hold ? Math.sin(now * 28) * 0.012 : 0;
    const crouch = p.crouching ? 0.03 : 0;
    this.hand.position.set(0.21 + sway, -0.2 - (1 - ease) * 0.28 + walk + crouch, -0.42 - (this.hold ? 0.06 : 0));
    this.hand.rotation.set(working * 2, working * 3, working * 4);
  }

  update(dt, now) {
    const input = this.input;
    input.poll();
    this.elapsed += dt;
    this.shake = Math.max(0, this.shake - dt * 2);

    // --- movement. Walking stands you up from your desk.
    const wantsMove = Boolean(input.x || input.y);
    if (this.player.seated && wantsMove && !input.locked) this.standUp();
    const crouching = input.crouching && !this.player.seated;
    const running = input.running && !crouching;
    const speed = crouching ? SPEED.CROUCH : running ? SPEED.RUN : SPEED.WALK;
    let moving = false;
    if (!this.player.seated && !input.locked && wantsMove) {
      const fx = -Math.sin(this.yaw);
      const fy = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const ry = -Math.sin(this.yaw);
      let mx = fx * -input.y + rx * input.x;
      let my = fy * -input.y + ry * input.x;
      const length = Math.hypot(mx, my) || 1;
      mx /= length;
      my /= length;
      const before = { x: this.player.x, y: this.player.y };
      this.moveAxis(mx * speed * dt, 0, crouching);
      this.moveAxis(0, my * speed * dt, crouching);
      moving = before.x !== this.player.x || before.y !== this.player.y;
    }
    this.player.moving = moving;
    this.player.running = moving && running;
    this.player.crouching = crouching;

    this.updateFootsteps(dt);
    this.updatePending(dt);
    this.updateBoss(dt, now);
    if (this.slap || this.runOver) return;
    this.updateInteraction(dt);
    this.updateHud();

    // Under the shutter and out.
    if (this.doors.shutter.open && this.player.y < -TILE * 0.35) this.endRun(true);
  }

  moveAxis(dx, dy, crouching) {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    const radius = crouching ? PLAYER_RADIUS - 2 : PLAYER_RADIUS;
    // The shutter only goes half way up: you have to crawl.
    if (ny < TILE * 0.95 && this.doors.shutter.open && !crouching && Math.abs(nx - 16.9 * TILE) < 4 * TILE) {
      this.hintOnce("crawl", "The shutter's only half up. Crouch (C) and crawl under!");
      return;
    }
    if (!this.map.isBlocked(nx, ny, radius)) {
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
    const kind = this.player.crouching ? "crouch" : this.player.running ? "run" : "walk";
    this.stepTimer = kind === "crouch" ? 0.62 : kind === "run" ? 0.3 : 0.45;
    this.sound.footstep(kind === "crouch" ? 0.15 : kind === "run" ? 0.9 : 0.45, kind === "run");
    if (STEP_NOISE[kind] > 0) this.noise(this.player.x, this.player.y, STEP_NOISE[kind], { quiet: true });
  }

  // Noises scheduled for later: the photocopier warming up, the phone alarm.
  updatePending(dt) {
    for (const p of this.pending) p.at -= dt;
    const due = this.pending.filter((p) => p.at <= 0);
    this.pending = this.pending.filter((p) => p.at > 0);
    for (const p of due) {
      p.sound?.();
      this.noise(p.x, p.y, p.loudness, { decoy: true });
    }
    for (const item of this.floorItems) {
      if (item.alarmIn === undefined || item.alarmIn === null) continue;
      item.alarmIn -= dt;
      if (item.alarmIn <= 0) {
        item.alarmIn = null;
        item.ringing = 6;
        this.sound.phoneAlarm(item.x, item.y, 6);
        this.noise(item.x, item.y, 0.72, { decoy: true });
      }
    }
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
  }

  // Something made a sound. Sir may have heard it.
  noise(x, y, loudness, { quiet = false, decoy = false } = {}) {
    if (loudness <= 0) return false;
    const heard = this.brain.hearNoise(x, y, loudness);
    if (!quiet && loudness >= 0.25 && !decoy) this.showNoise(loudness);
    return heard;
  }

  // --------------------------------------------------------------- the boss

  updateBoss(dt, now) {
    const world = {
      doors: DOORS.filter((d) => d.id !== "shutter").map((d) => {
        const p = cellPoint(DOOR_POINTS[d.id]);
        return { id: d.id, x: p.x, y: p.y, tampered: this.doors[d.id].open || this.doors[d.id].broken };
      }),
      keysTaken: this.keysTaken,
    };
    const result = this.brain.update(dt, this.player, world);
    for (const event of result.events) this.onBossEvent(event);

    // Footsteps: heavy, and audible round corners.
    const moved = Math.hypot(this.brain.x - this.lastBoss.x, this.brain.y - this.lastBoss.y);
    this.lastBoss = { x: this.brain.x, y: this.brain.y };
    this.bossStepDistance += moved;
    if (this.bossStepDistance > 22) {
      this.bossStepDistance = 0;
      this.sound.bossStep(this.brain.x, this.brain.y);
    }

    // A pulse that quickens as he twigs.
    if (result.meter > 0.04 && !this.player.seated) {
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 0.95 - result.meter * 0.6;
        this.sound.meterPulse(result.meter);
      }
    }
    if (this.wasNoticing && !result.noticing && !this.slap) this.sound.lostInterest();
    this.wasNoticing = result.noticing;
    void now;
  }

  onBossEvent(e) {
    const b = this.brain;
    switch (e.type) {
      case "say":
        this.subtitle(e.text, e.mood);
        this.sound.voice(b.x, b.y, e.mood, Math.min(8, Math.max(2, Math.round(e.text.split(" ").length / 1.5))));
        break;
      case "alerted":
        this.sound.alerted();
        if (!this.player.seated) this.flash("He heard that! Get back to your desk before he comes out.", 5000);
        break;
      case "standUp":
        this.sound.chairCreak(b.x, b.y);
        this.sound.cabinDoor(b.x, b.y);
        break;
      case "sitDown":
        this.sound.chairCreak(b.x, b.y);
        break;
      case "flush":
        this.sound.flush(b.x, b.y);
        break;
      case "pee":
        if (!this.hintsShown.has("pee")) this.hintOnce("pee", "Sir's in the loo. His cabin is empty — and his keys are on his desk.");
        break;
      case "noticing":
        this.stats.spotted += 1;
        this.sound.noticed();
        break;
      case "emptyDesk":
        this.stats.searched += 1;
        this.flash("He found your chair empty. He's looking for you — get back and sit down!", 5000);
        break;
      case "relock":
        this.relockDoor(e.id, true);
        break;
      case "arrived":
        this.bossFindsPhone(e.x, e.y);
        break;
      case "caught":
        this.startSlap();
        break;
      default:
        break;
    }
  }

  // Your phone, ringing on the floor where he is standing: confiscated.
  bossFindsPhone(x, y) {
    const phone = this.floorItems.find((f) => f.item.id === "phone" && Math.hypot(f.x - x, f.y - y) < 3 * 32);
    if (!phone) return;
    this.floorItems = this.floorItems.filter((f) => f !== phone);
    this.contents["boss-drawer"].push("phone");
    this.subtitle("Yeh kiska phone hai?! …Jama. Mere drawer mein.", "shout");
    this.flash("Sir took your phone and locked it in his desk drawer.", 5000);
  }

  animateBoss(dt, now) {
    const b = this.brain;
    let pose = "stand";
    if (b.mode === "cabin") pose = "sit";
    else if (b.mode === "phone") pose = "phone";
    else if (b.mode === "alerted") pose = b.peeing ? "pee" : b.timer > 1.2 ? "sit" : "stand";
    else if (b.peeing) pose = "pee";
    else if (b.moving) pose = "walk";
    const angry = ["alerted", "search", "investigate", "confront"].includes(b.mode);
    let mark = null;
    if (b.mode === "confront" || b.mode === "search") mark = "!";
    else if (b.mode === "alerted" || b.noticing) mark = b.noticing ? "?" : "!";
    else if (b.mode === "phone") mark = "z";
    this.bossBody.setMark(mark);
    this.bossBody.update({
      x: b.x,
      y: b.y,
      angle: b.angle,
      headTurn: b.headTurn,
      pose,
      moving: b.moving,
      speed: b.mode === "search" || b.mode === "investigate" ? 1.3 : 1,
      dt,
      time: now,
      angry,
    });
  }

  // He saw a door standing open (or a broken padlock) and locked it again.
  relockDoor(id, seenByHim = false) {
    const room = roomAt(this.player.x, this.player.y);
    const beyond =
      (id === "wooden" && ["landing", "vestibule", "street"].includes(room)) ||
      (id === "gate" && ["vestibule", "street"].includes(room));
    if (seenByHim && beyond) {
      // You are on the wrong side of the door he is shutting. That is that.
      this.brain.mode = "confront";
      this.subtitle("Bhaagne ki koshish?! Idhar aao!", "shout");
      this.startSlap();
      return;
    }
    const door = DOORS.find((d) => d.id === id);
    this.doors[id] = { open: false, broken: false, done: Object.fromEntries(door.steps.map((s) => [s.id, false])) };
    this.map.setDoorOpen(id, false);
    this.renderDoors();
    if (seenByHim) this.flash(`Sir found the ${door.name.toLowerCase()} tampered with and locked ${id === "wooden" ? "them" : "it"} again. Close doors behind you!`, 6000);
  }

  // ----------------------------------------------------------- interaction

  // Everything you could be looking at right now.
  candidates() {
    const list = [];
    for (const c of CONTAINERS) {
      if (c.needs?.bossAway && !(this.brain.away && !this.keysTaken && this.contents[c.id].length)) continue;
      if (c.needs?.opened && !this.searched.has(c.needs.opened)) continue;
      list.push({ kind: "container", key: `c:${c.id}`, c, ...cellPoint(c.at), rank: this.searched.has(c.id) && !this.contents[c.id].length ? 4 : 0 });
    }
    for (const door of DOORS) {
      const state = this.doors[door.id];
      door.steps.forEach((step, i) => {
        if (state.done[step.id]) return;
        const ownsOil = this.inventory.some((it) => ITEMS[it.id].tags.includes("oil"));
        // An optional step (oiling) only competes for the spot once you
        // could actually do it.
        const rank = step.optional ? (ownsOil ? 0.5 : 5) : i;
        list.push({ kind: "step", key: `s:${door.id}:${step.id}`, door, step, ...cellPoint(step.at), rank });
      });
      if (doorUnlocked(door.id, this.doors) && !(door.id === "shutter" && state.open)) {
        list.push({ kind: "door", key: `d:${door.id}`, door, ...cellPoint(DOOR_POINTS[door.id]), rank: 1 });
      }
    }
    for (const d of DECOYS) list.push({ kind: "decoy", key: `x:${d.id}`, d, ...cellPoint(d.at), rank: 2 });
    for (const f of this.floorItems) list.push({ kind: "floor", key: `f:${f.item.uid}`, f, x: f.x, y: f.y, rank: 0 });
    if (!this.player.seated) list.push({ kind: "chair", key: "chair", x: SPOTS.playerChair.x, y: SPOTS.playerChair.y - 8, rank: 3 });
    return list;
  }

  // What the crosshair is on: close, roughly in front of you, not through a wall.
  pickTarget() {
    const p = this.player;
    const fx = -Math.sin(this.yaw);
    const fy = -Math.cos(this.yaw);
    let best = null;
    let bestScore = Infinity;
    const all = this.candidates();
    for (const c of all) {
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > REACH) continue;
      const angle = d < 4 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy) / d)));
      if (angle > (d < 0.6 * 32 ? 1.3 : 0.62)) continue;
      if (!this.reachable(p.x, p.y, c.x, c.y)) continue;
      const score = angle + (d / REACH) * 0.35 + c.rank * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    // Several things on one spot (bolt, latch, the doors themselves): the
    // lowest rank wins.
    if (best) {
      const same = all.filter((c) => Math.hypot(c.x - best.x, c.y - best.y) < 6);
      same.sort((a, b) => a.rank - b.rank);
      best = same[0];
    }
    return best;
  }

  // No reaching through walls or glass.
  reachable(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / 6);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (d * (1 - t) < 16) break;
      const ch = this.map.cell(Math.floor((ax + (bx - ax) * t) / TILE), Math.floor((ay + (by - ay) * t) / TILE));
      if (ch === "#" || ch === "g") return false;
    }
    return true;
  }

  // Work out the prompt for a target: what E does, how long, and how loud.
  describe(t) {
    const selectedUid = this.inventory[this.selected]?.uid;
    switch (t.kind) {
      case "container": {
        const c = t.c;
        if (this.searched.has(c.id) && !this.contents[c.id].length) return { label: c.name, sub: "Already searched — nothing left." };
        if (c.needs?.item && !this.inventory.some((it) => it.id === c.needs.item)) {
          return { label: `${c.name} — locked`, sub: "A small key would open it." };
        }
        if (c.needs?.code && !this.knowsCode) {
          return { label: c.name, sub: "Locked with a 3-digit code. Did he write it down somewhere?" };
        }
        const verb = c.needs?.code ? `Open the key box (code ${this.code})` : this.searched.has(c.id) ? `Search ${c.name} again` : `Search ${c.name}`;
        return { label: verb, sub: c.noise >= 0.3 ? "Creaky — he might hear it." : "", time: c.time, busy: "search", key: t.key };
      }
      case "step": {
        const ways = waysFor(t.step, this.inventory, selectedUid);
        if (!ways.length) {
          const want = [...new Set(Object.keys(t.step.ways).map((tag) => TAG_WORDS[tag]).filter(Boolean))];
          // The hint already says what a one-answer step wants; spell out the
          // options only when there are several.
          const extra = want.length > 1 ? ` (Try ${want.slice(0, 3).join(", or ")}.)` : "";
          return { label: `${t.door.name}: ${t.step.name}`, sub: `${t.step.hint}${extra}` };
        }
        const way = ways[0];
        const others = ways.length - 1;
        const loud = way.noise >= 0.6 ? " — VERY LOUD" : way.noise >= 0.25 ? " — a bit noisy" : "";
        return {
          label: `${way.verb} with ${way.item ? ITEMS[way.item.id].name : "your hands"}`,
          sub: `${t.door.name}: ${t.step.name}${loud}${others ? ` · ${others} other way${others > 1 ? "s" : ""} — pick an item (1–5)` : ""}`,
          time: way.time,
          busy: busyFor(way.tag),
          key: `${t.key}:${way.item?.uid || "hands"}`,
          way,
        };
      }
      case "door": {
        const state = this.doors[t.door.id];
        const oiled = t.door.id === "gate" ? state.done.oil : t.door.id === "shutter" ? state.done.grease : true;
        const loudness = oiled ? t.door.open.quiet : t.door.open.loud;
        if (state.open) {
          return { label: t.door.open.close, sub: loudness >= 0.6 ? "It will screech." : "", time: 0.8, busy: "metal", key: t.key };
        }
        const warn = loudness >= 0.95 ? "Dry — this will be heard across the branch!" : loudness >= 0.6 ? "The track is dry — it'll screech. Oil it first?" : "";
        return { label: t.door.open.verb, sub: warn, time: t.door.id === "shutter" ? 1.6 : 1, busy: "metal", key: t.key };
      }
      case "decoy": {
        const left = Math.ceil(this.cooldowns[t.d.id] || 0);
        if (left > 0) return { label: t.d.label, sub: `Wait ${left}s before trying that again.` };
        const sub = {
          photocopier: "Loud. He'll come to see who's printing — away from his cabin.",
          landline: "If he's at his desk he'll be stuck on the phone for ~25s.",
          cash: "Loud, near the counters.",
        }[t.d.id];
        return { label: t.d.label, sub, time: 0.7, busy: "search", key: t.key };
      }
      case "floor":
        return { label: `Pick up ${ITEMS[t.f.item.id].name}`, sub: t.f.alarmIn ? `Alarm in ${Math.ceil(t.f.alarmIn)}s` : "", time: 0.3, busy: "search", key: t.key };
      case "chair":
        return { label: "Sit down and look busy", sub: "Safe from Sir while you're in your chair.", time: 0.25, key: t.key };
      default:
        return null;
    }
  }

  updateInteraction(dt) {
    // Seated: E stands you up; nothing else is in reach.
    if (this.player.seated) {
      this.target = null;
      if (this.input.holding && !this.heldLastFrame) this.standUp();
      this.heldLastFrame = this.input.holding;
      this.showPrompt(null);
      this.el.crosshair.classList.remove("active");
      return;
    }
    const target = this.pickTarget();
    this.target = target;
    const info = target ? this.describe(target) : null;
    this.el.crosshair.classList.toggle("active", Boolean(info));
    if (!info) {
      this.hold = null;
      this.sound.stopBusy();
      this.showPrompt(null);
      this.heldLastFrame = this.input.holding;
      return;
    }
    if (!info.time) {
      this.hold = null;
      this.sound.stopBusy();
      this.showPrompt(info.label, info.sub, null);
      this.heldLastFrame = this.input.holding;
      return;
    }
    if (this.input.holding) {
      if (!this.hold || this.hold.key !== info.key) this.hold = { key: info.key, t: 0 };
      this.hold.t += dt;
      if (info.busy) this.sound.busy(info.busy);
      if (this.hold.t >= info.time) {
        this.hold = null;
        this.sound.stopBusy();
        this.perform(target, info);
        // One action per press: let go before the next.
        this.input.hold = false;
        this.input.keys.delete("e");
      }
    } else {
      this.hold = null;
      this.sound.stopBusy();
    }
    this.heldLastFrame = this.input.holding;
    this.showPrompt(info.label, info.sub, this.hold ? this.hold.t / info.time : 0);
  }

  perform(target, info) {
    switch (target.kind) {
      case "container":
        this.searchContainer(target.c);
        break;
      case "step":
        this.doStep(target.door, target.step, info.way);
        break;
      case "door":
        this.toggleDoor(target.door);
        break;
      case "decoy":
        this.triggerDecoy(target.d);
        break;
      case "floor":
        this.pickUp(target.f);
        break;
      case "chair":
        this.sitDown();
        break;
      default:
        break;
    }
  }

  searchContainer(c) {
    const at = cellPoint(c.at);
    this.searched.add(c.id);
    if (c.noise >= 0.3) this.sound.creakOpen(c.noise);
    this.noise(at.x, at.y, c.noise);
    const found = [];
    const left = [];
    for (const id of this.contents[c.id]) {
      if (id === CODE_NOTE) {
        this.knowsCode = true;
        found.push(`a sticky note: "key box — ${this.code}"`);
      } else if (this.inventory.length < SLOTS) {
        this.inventory.push(makeItem(id));
        found.push(ITEMS[id].name);
      } else {
        left.push(id);
      }
    }
    this.contents[c.id] = left;
    if (c.id === "boss-keys" && found.length) {
      this.keysTaken = true;
      this.flash("You swiped Sir's key bunch. He WILL notice when he sits down — be at your desk.", 6500);
    }
    for (const prop of ["coat-stand", "extinguisher", "broom-corner"]) {
      if (c.id === prop && !this.contents[prop].length) this.world.setPropVisible(prop, false);
    }
    if (found.length) {
      this.sound.pickup();
      if (c.id !== "boss-keys") this.flash(`Found ${found.join(", ")}.${left.length ? " Your hands are full — drop something (Q) for the rest." : ""}`, 5000);
      this.hintOnce("bag", "Your bag holds five things. 1–5 picks one; G combines two things into a better tool; F uses it.");
      this.selected = Math.max(0, this.inventory.length - 1);
    } else if (left.length) {
      this.sound.nothing();
      this.flash("There's something in here, but your hands are full. Drop something (Q) first.", 4500);
    } else {
      this.sound.nothing();
      this.flash(this.junk[c.id] && !this.searchedJunk?.has(c.id) ? this.junk[c.id] : "Nothing useful.", 4000);
      this.searchedJunk = this.searchedJunk || new Set();
      this.searchedJunk.add(c.id);
    }
    this.renderInventory();
  }

  doStep(door, step, way) {
    const state = this.doors[door.id];
    const at = cellPoint(step.at);
    state.done[step.id] = true;
    if (way.breaks) state.broken = true;
    let used = "your hands";
    if (way.item) {
      used = ITEMS[way.item.id].name;
      const before = this.inventory.length;
      this.inventory = spend(this.inventory, way.item.uid);
      if (this.inventory.length < before) this.flash(`${used} used up.`, 2500);
      this.selected = Math.min(this.selected, Math.max(0, this.inventory.length - 1));
    }
    this.stats.log.push({ door: door.name, step: step.name, tag: way.tag, item: used });
    if (way.tag === "smash") this.sound.smash();
    else if (way.tag !== "oil") this.sound.unlock();
    this.noise(at.x, at.y, way.noise);

    const unlocked = doorUnlocked(door.id, this.doors);
    if (step.optional) {
      this.flash(`${step.name}: done with ${used}. It'll be quiet now.`, 4000);
    } else if (unlocked && door.steps.filter((s) => !s.optional).every((s) => state.done[s.id])) {
      const lines = {
        wooden: "The wooden doors are unlocked! Open them — and pull them shut behind you so Sir doesn't notice.",
        gate: "The gate padlock is off! Oil the track before you slide it, or it'll screech.",
        shutter: "Both shutter locks are open. Grease the channels — or just heave it up and run for it.",
      };
      this.flash(`Jugaad! ${step.name} done with ${used}. ${lines[door.id]}`, 7000);
    } else {
      this.flash(`Jugaad! ${step.name} done with ${used}.`, 4000);
    }
    if (way.breaks) this.hintOnce("broken", "A smashed lock is obvious. If Sir sees it, he'll put a new one on.");
    this.renderInventory();
    this.renderDoors();
  }

  toggleDoor(door) {
    const state = this.doors[door.id];
    const at = cellPoint(DOOR_POINTS[door.id]);
    const oiled = door.id === "gate" ? state.done.oil : door.id === "shutter" ? state.done.grease : true;
    const loudness = oiled ? door.open.quiet : door.open.loud;
    const opening = !state.open;
    state.open = opening;
    this.map.setDoorOpen(door.id, opening);
    // Do not close a door on yourself.
    if (!opening && this.map.isBlocked(this.player.x, this.player.y, PLAYER_RADIUS)) {
      state.open = true;
      this.map.setDoorOpen(door.id, true);
      this.flash("Step out of the doorway first.", 2500);
      return;
    }
    if (door.id === "wooden") this.sound.woodenDoors(opening);
    else if (door.id === "gate") this.sound.gateSlide(!oiled);
    else this.sound.shutterRoll(!oiled);
    this.noise(at.x, at.y, loudness);
    if (door.id === "shutter") {
      this.flash(loudness >= 0.9 ? "It's up — and he definitely heard that! Crouch (C) and crawl under, NOW!" : "The shutter's up, half way. Crouch (C) and crawl out under it.", 6000);
      if (loudness >= 0.9) this.subtitle("SHUTTER?! RUKO! RUKOOO!", "shout");
    } else if (opening && door.id === "wooden") {
      this.hintOnce("close", "Doors left open are the first thing Sir notices. Pull them shut (E) when you head back.");
    }
    this.renderDoors();
  }

  triggerDecoy(d) {
    if (this.cooldowns[d.id] > 0) return;
    this.cooldowns[d.id] = d.cooldown;
    const at = cellPoint(d.at);
    this.stats.decoys += 1;
    if (d.id === "photocopier") {
      this.flash("Fifty copies of the branch circular, queued. It starts in a few seconds — move!", 5000);
      this.pending.push({ at: 3, x: at.x, y: at.y, loudness: 0.8, sound: () => this.sound.photocopier(at.x, at.y, 8) });
    } else if (d.id === "cash") {
      this.sound.cashMachine(at.x, at.y, 4);
      this.noise(at.x, at.y, 0.65, { decoy: true });
      this.flash("Brrrrrrrt. The note counter chatters away on its own.", 4000);
    } else if (d.id === "landline") {
      if (this.brain.phoneCall()) {
        this.sound.landline(this.brain.x, this.brain.y, 1);
        this.flash("You dialled his extension and left the receiver off. He's answered — ~25 seconds of 'haan ji, haan ji'.", 6000);
      } else {
        this.sound.landline(SPOTS.bossChair.x, SPOTS.bossChair.y, 2);
        this.flash("It rings and rings. He isn't at his desk to answer.", 4000);
        this.cooldowns[d.id] = 8;
      }
    }
  }

  pickUp(f) {
    if (this.inventory.length >= SLOTS) {
      this.flash("Your hands are full. Drop something (Q) first.", 3000);
      return;
    }
    this.floorItems = this.floorItems.filter((x) => x !== f);
    this.inventory.push(f.item);
    this.selected = this.inventory.length - 1;
    this.sound.pickup();
    this.renderInventory();
  }

  standUp() {
    if (!this.player.seated) return;
    this.player.seated = false;
    this.hintOnce("crouch", "Crouch (C) to keep below desk height — he can't see you behind the desks.");
    this.el.seated.classList.add("hidden");
  }

  sitDown() {
    this.player.seated = true;
    this.player.x = SPOTS.playerChair.x;
    this.player.y = SPOTS.playerChair.y;
    this.input.crouchOn = false;
    this.input.runOn = false;
    this.input.syncStanceButtons();
    this.el.seated.classList.remove("hidden");
    this.sound.chairCreak(this.player.x, this.player.y);
  }

  // Things on the floor: what you dropped, and your phone counting down.
  syncFloorItems(now) {
    const live = new Set(this.floorItems.map((f) => f.item.uid));
    for (const [uid, model] of this.floorMeshes) {
      if (live.has(uid)) continue;
      // Models share geometry and materials; just take this one away.
      this.scene.remove(model);
      this.floorMeshes.delete(uid);
    }
    for (const f of this.floorItems) {
      let model = this.floorMeshes.get(f.item.uid);
      if (!model) {
        model = floorModel(f.item.id);
        model.position.set(f.x * U, 0, f.y * U);
        model.rotation.y = (f.x * 13 + f.y * 7) % (Math.PI * 2);
        this.scene.add(model);
        this.floorMeshes.set(f.item.uid, model);
      }
      // A phone going off buzzes itself across the tiles.
      if (f.item.id === "phone" && f.ringing > 0) {
        f.ringing -= 1 / 60;
        model.position.x = f.x * U + Math.sin(now * 90) * 0.004;
        model.rotation.y += Math.sin(now * 70) * 0.01;
      }
    }
  }

  // ------------------------------------------------------------- inventory

  selectSlot(i) {
    if (this.slap || this.runOver) return;
    if (i < 0 || i >= this.inventory.length) return;
    this.selected = i;
    this.sound.select();
    this.renderInventory();
  }

  useItem() {
    if (this.paused || this.slap || this.runOver) return;
    const item = this.inventory[this.selected];
    if (!item) return;
    if (item.id === "phone") {
      if (this.player.seated) {
        this.flash("Leave it somewhere away from your desk — the alarm will bring him to it.", 3500);
        return;
      }
      this.inventory.splice(this.selected, 1);
      this.selected = Math.max(0, Math.min(this.selected, this.inventory.length - 1));
      this.floorItems.push({ item, x: this.player.x, y: this.player.y, alarmIn: 12 });
      this.flash("Alarm set for 12 seconds. Put the phone down and walk away.", 4000);
      this.stats.decoys += 1;
      this.renderInventory();
      return;
    }
    if (item.id === "gulel") {
      if (this.cooldowns.gulel > 0) return;
      this.cooldowns.gulel = 6;
      const hit = this.aimPoint(14 * 32);
      this.sound.flick(hit.x, hit.y);
      this.pending.push({ at: 0.3, x: hit.x, y: hit.y, loudness: 0.55 });
      this.stats.decoys += 1;
      this.flash("Thwip. An eraser clatters off somewhere over there.", 2500);
      return;
    }
    this.flash(`${ITEMS[item.id].name}: ${ITEMS[item.id].note}`, 4000);
  }

  // Where a straight line from your eyes first meets a wall or something tall.
  aimPoint(max) {
    const fx = -Math.sin(this.yaw);
    const fy = -Math.cos(this.yaw);
    let x = this.player.x;
    let y = this.player.y;
    for (let d = 0; d < max; d += 8) {
      const nx = x + fx * 8;
      const ny = y + fy * 8;
      if (this.map.blocksSight(Math.floor(nx / TILE), Math.floor(ny / TILE), false)) break;
      x = nx;
      y = ny;
    }
    return { x, y };
  }

  combineItems() {
    if (this.paused || this.slap || this.runOver) return;
    const result = combine(this.inventory, this.inventory[this.selected]?.uid);
    if (!result) {
      const near = nearRecipes(this.inventory)[0];
      if (near) {
        const have = this.inventory.find((i) => i.id === near.a || i.id === near.b);
        const need = have.id === near.a ? near.b : near.a;
        this.flash(`Nothing to combine yet. Your ${ITEMS[have.id].name.toLowerCase()} would go with a ${ITEMS[need].name.toLowerCase()}…`, 4500);
      } else {
        this.flash("Nothing in your bag goes together. Yet.", 3000);
      }
      return;
    }
    this.inventory = result.inventory;
    this.selected = this.inventory.findIndex((i) => i.uid === result.made.uid);
    this.stats.crafted += 1;
    this.sound.combine();
    this.flash(`Jugaad! ${ITEMS[result.recipe.a].name} + ${ITEMS[result.recipe.b].name} → ${ITEMS[result.made.id].name}. ${ITEMS[result.made.id].note}`, 6000);
    this.renderInventory();
  }

  dropItem() {
    if (this.paused || this.slap || this.runOver || this.player.seated) return;
    const item = this.inventory[this.selected];
    if (!item) return;
    this.inventory.splice(this.selected, 1);
    this.selected = Math.max(0, Math.min(this.selected, this.inventory.length - 1));
    const fx = -Math.sin(this.yaw);
    const fy = -Math.cos(this.yaw);
    this.floorItems.push({ item, x: this.player.x + fx * 14, y: this.player.y + fy * 14 });
    this.flash(`Dropped ${ITEMS[item.id].name}.`, 2000);
    this.renderInventory();
  }

  // ------------------------------------------------------------------ slap

  // He has you. Turn to face him, black, he is in front of you, THAPPAD,
  // black, and you are back at your desk.
  startSlap() {
    if (this.slap || this.runOver) return;
    this.slap = { t: 0, placed: false, hit: false, back: false };
    this.input.locked = true;
    this.hold = null;
    this.sound.stopBusy();
    this.showPrompt(null);
    this.player.seated = false;
    this.el.seated.classList.add("hidden");
  }

  updateSlap(dt, now) {
    const s = this.slap;
    s.t += dt;
    this.elapsed += dt;
    const b = this.brain;
    const face = (x, y, rate) => {
      const target = Math.atan2(-(x - this.player.x), -(y - this.player.y));
      const delta = ((target - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += delta * Math.min(1, dt * rate);
      this.pitch += (0 - this.pitch) * Math.min(1, dt * rate);
    };

    if (s.t < 0.9) {
      face(b.x, b.y, 6);
      this.fade = Math.max(0, (s.t - 0.5) / 0.4);
      this.animateBoss(dt, now);
    } else if (!s.placed) {
      // In the dark, he closes the distance. Put him right in front of you.
      s.placed = true;
      const fx = -Math.sin(this.yaw);
      const fy = -Math.cos(this.yaw);
      this.slapBoss = { x: this.player.x + fx * 40, y: this.player.y + fy * 40, angle: Math.atan2(-fy, -fx) };
      this.pitch = 0.12;
    } else if (s.t < 2.6) {
      this.fade = Math.max(0, 1 - (s.t - 0.9) / 0.3);
      const k = Math.max(0, (s.t - 1.2) / 0.8);
      this.bossBody.setMark("!");
      this.bossBody.update({ ...this.slapBoss, pose: "slap", slap: k, dt, time: now, angry: true });
      if (!s.hit && k >= 0.7) {
        s.hit = true;
        this.sound.slap();
        this.shake = 1;
        this.yaw += 0.55;
        this.flashScreen(0.85);
        this.el.thappad.classList.remove("hidden");
        this.el.thappad.classList.remove("pop");
        void this.el.thappad.offsetWidth;
        this.el.thappad.classList.add("pop");
      }
    } else if (!s.back) {
      this.fade = Math.min(1, (s.t - 2.6) / 0.4);
      if (s.t > 3.1) {
        s.back = true;
        this.el.thappad.classList.add("hidden");
        this.afterSlap();
        if (this.runOver) return;
      }
    } else {
      this.fade = Math.max(0, 1 - (s.t - 3.1) / 0.7);
      if (s.t > 3.8) {
        this.slap = null;
        this.fade = 0;
        this.input.locked = false;
      }
    }
    this.el.fade.style.opacity = String(this.fade);
    this.updateHud();
  }

  afterSlap() {
    this.attempts -= 1;
    this.stats.slaps += 1;
    // Whatever was in your hand, he keeps.
    const held = this.inventory[this.selected];
    let lost = "";
    if (held) {
      this.inventory.splice(this.selected, 1);
      this.selected = Math.max(0, Math.min(this.selected, this.inventory.length - 1));
      this.contents[held.id === "phone" ? "boss-drawer" : "boss-almirah"].push(held.id);
      lost = ` He took your ${ITEMS[held.id].name.toLowerCase()}${held.id === "phone" ? " — it's in his desk drawer" : " — it's in his almirah"}.`;
    }
    // Anything left open or broken, he locks again.
    for (const door of DOORS) {
      const state = this.doors[door.id];
      if (state.open || state.broken) this.relockDoor(door.id, false);
    }
    this.brain.afterSlap();
    this.player = { ...SPOTS.playerChair, seated: true, crouching: false, running: false, moving: false };
    this.input.crouchOn = false;
    this.input.runOn = false;
    this.input.syncStanceButtons();
    this.yaw = 0;
    this.pitch = -0.08;
    this.el.seated.classList.remove("hidden");
    this.renderInventory();
    this.renderDoors();
    if (this.attempts <= 0) {
      this.startLockup();
      return;
    }
    this.subtitle("Chup chaap kaam karo! Agli baar salary kaat lunga!", "shout");
    this.flash(`Back at your desk, cheek stinging. ${this.attempts} chance${this.attempts === 1 ? "" : "s"} left.${lost}`, 6500);
  }

  // -------------------------------------------------------------- rendering

  renderCamera(dt, now) {
    const p = this.player;
    if (p.moving) this.bob += dt * (p.running ? 11 : p.crouching ? 5 : 7.6);
    const bobY = p.moving ? Math.sin(this.bob) * 0.03 : 0;
    const bobX = p.moving ? Math.cos(this.bob * 0.5) * 0.016 : 0;
    const target = p.seated ? EYE.SEATED : p.crouching ? EYE.CROUCH : EYE.STAND;
    this.eye += (target - this.eye) * Math.min(1, dt * 10);
    const shake = this.shake ** 2;
    const sx = shake * Math.sin(now * 47) * 0.08;
    const sy = shake * Math.sin(now * 61 + 1.7) * 0.05;
    this.camera.position.set(p.x * U + bobX + sx, this.eye + bobY + sy, p.y * U);
    this.camera.rotation.set(this.pitch, this.yaw, shake * Math.sin(now * 39) * 0.05, "YXZ");
  }

  // ------------------------------------------------------------------- HUD

  updateHud() {
    const minutes = START_MINUTES + this.elapsed * GAME_MINUTES_PER_SECOND;
    const clock = formatClock(minutes);
    if (clock !== this.hud.clock) {
      this.hud.clock = clock;
      this.el.clock.textContent = clock;
    }
    if (this.attempts !== this.hud.attempts) {
      this.hud.attempts = this.attempts;
      this.el.attempts.innerHTML = "";
      for (let i = 0; i < ATTEMPTS; i += 1) {
        const pip = document.createElement("span");
        pip.className = i < this.attempts ? "hud-attempt" : "hud-attempt spent";
        this.el.attempts.append(pip);
      }
    }

    const status = this.bossStatus();
    if (status.text !== this.hud.bossText) {
      this.hud.bossText = status.text;
      this.el.bossText.textContent = status.text;
    }
    if (status.cls !== this.hud.bossCls) {
      this.hud.bossCls = status.cls;
      this.el.boss.className = `hud-boss ${status.cls}`;
    }

    const meter = this.player.seated || this.slap ? 0 : this.brain.meter;
    this.el.eye.classList.toggle("show", meter > 0.02);
    this.el.eye.classList.toggle("hot", meter > 0.6);
    this.el.eyeFill.style.transform = `scaleX(${meter.toFixed(3)})`;
    this.el.fade.style.opacity = String(this.fade);
  }

  bossStatus() {
    const b = this.brain;
    const s = (n) => `${Math.max(0, Math.ceil(n))}s`;
    switch (b.mode) {
      case "cabin":
        return { cls: "calm", text: `Sir in his cabin · ${b.nextOuting === "round" ? "round" : "loo break"} in ${s(b.outingIn)}` };
      case "phone":
        return { cls: "chance", text: `Sir stuck on the phone · ${s(b.timer)}` };
      case "alerted":
        return { cls: "danger", text: `Sir heard that! Out in ${s(b.timer)} — get to your desk!` };
      case "round":
        return { cls: "warn", text: "Sir is walking his round" };
      case "washroom":
        if (b.peeing) return { cls: "chance", text: `Sir in the loo · ${s(b.action?.t ?? 0)} · cabin empty!` };
        return { cls: "warn", text: b.plan.some((p) => p.action === "pee") ? "Sir heading to the loo" : "Sir back from the loo" };
      case "investigate":
        return { cls: "danger", text: "Sir is checking the noise" };
      case "search":
        return { cls: "danger", text: "Sir is looking for you!" };
      case "return":
        return { cls: "warn", text: "Sir walking back to his cabin" };
      default:
        return { cls: "danger", text: "CAUGHT" };
    }
  }

  renderInventory() {
    const el = this.el.inventory;
    el.innerHTML = "";
    for (let i = 0; i < SLOTS; i += 1) {
      const item = this.inventory[i];
      const slot = document.createElement("button");
      slot.className = `hud-slot${i === this.selected && item ? " selected" : ""}${item ? "" : " empty"}`;
      slot.dataset.slot = String(i);
      slot.type = "button";
      const key = document.createElement("span");
      key.className = "hud-slot-key";
      key.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "hud-slot-name";
      name.textContent = item ? ITEMS[item.id].name : "—";
      const icon = item ? itemIcon(item.id) : null;
      if (icon) {
        const img = document.createElement("img");
        img.className = "hud-slot-icon";
        img.src = icon;
        img.alt = "";
        slot.append(key, img, name);
      } else {
        slot.append(key, name);
      }
      if (item?.uses) {
        const uses = document.createElement("span");
        uses.className = "hud-slot-uses";
        uses.textContent = `×${item.uses}`;
        slot.append(uses);
      }
      el.append(slot);
    }
    const selected = this.inventory[this.selected];
    this.el.itemNote.textContent = selected ? ITEMS[selected.id].note : "";
  }

  renderDoors() {
    const el = this.el.doors;
    el.innerHTML = "";
    for (const door of DOORS) {
      const state = this.doors[door.id];
      const li = document.createElement("li");
      const unlocked = doorUnlocked(door.id, this.doors);
      li.className = state.open ? "open" : unlocked ? "unlocked" : "";
      const title = document.createElement("strong");
      title.textContent = `${door.name}${state.open ? " · open" : unlocked ? " · unlocked" : ""}`;
      li.append(title);
      const steps = document.createElement("span");
      steps.className = "hud-door-steps";
      steps.textContent = door.steps
        .map((s) => `${state.done[s.id] ? "✓" : s.optional ? "○" : "•"} ${s.name}${s.optional && !state.done[s.id] ? " (optional)" : ""}`)
        .join("   ");
      li.append(steps);
      el.append(li);
    }
  }

  showPrompt(label, sub = "", progress = null) {
    const shown = Boolean(label);
    this.el.prompt.classList.toggle("hidden", !shown);
    if (!shown) return;
    if (label !== this.hud.promptLabel) {
      this.hud.promptLabel = label;
      this.el.promptLabel.textContent = label;
    }
    if (sub !== this.hud.promptSub) {
      this.hud.promptSub = sub;
      this.el.promptSub.textContent = this.forTouch(sub || "");
      this.el.promptSub.classList.toggle("hidden", !sub);
    }
    this.el.holdTrack.classList.toggle("hidden", progress === null);
    if (progress !== null) this.el.holdFill.style.transform = `scaleX(${Math.min(1, progress)})`;
  }

  flash(message, ms = 4500) {
    this.el.hint.textContent = this.forTouch(message);
    this.el.hint.classList.remove("faded");
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.el.hint.classList.add("faded"), ms);
  }

  // Hints are written for a keyboard; on a phone, name the buttons instead.
  forTouch(text) {
    if (!matchMedia("(hover: none)").matches) return text;
    return text
      .replace(/Crouch \(C\)/g, "Crouch")
      .replace(/drop something \(Q\)/gi, "drop something")
      .replace(/Pull them shut \(E\)/g, "Pull them shut (Use)")
      .replace(/1–5 picks one; G combines two things into a better tool; F uses it\./, "Tap a slot to pick it; Combine makes a better tool out of two; Item uses it.")
      .replace(/press F/gi, "tap Item")
      .replace(/ \((?:[A-Z]|1–5)\)/g, "");
  }

  hintOnce(key, message) {
    if (this.hintsShown.has(key)) return;
    this.hintsShown.add(key);
    this.flash(message, 6000);
  }

  // Who is talking: Sir (the default), you (your thoughts), or everyone.
  subtitle(text, mood = "normal", speaker = "Motu Sir") {
    const el = this.el.subtitle;
    el.innerHTML = "";
    const who = document.createElement("span");
    who.className = "hud-subtitle-who";
    who.textContent = mood === "thought" ? "" : `${speaker}: `;
    el.append(who, document.createTextNode(mood === "thought" ? `(${text})` : text));
    el.className = `hud-subtitle ${mood}`;
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = setTimeout(() => el.classList.add("hidden"), 2200 + text.length * 45);
  }

  showNoise(loudness) {
    const el = this.el.noise;
    el.textContent = loudness >= 0.9 ? "VERY LOUD!" : loudness >= 0.5 ? "Loud!" : "Noise";
    el.className = `hud-noise show ${loudness >= 0.5 ? "loud" : ""}`;
    clearTimeout(this.noiseTimer);
    this.noiseTimer = setTimeout(() => el.classList.remove("show"), 1400);
  }

  flashScreen(strength) {
    const flash = this.el.flash;
    flash.style.transition = "none";
    flash.style.opacity = String(strength);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        flash.style.transition = "opacity 600ms ease-out";
        flash.style.opacity = "0";
      }),
    );
  }

  // ------------------------------------------------------------- endings

  endRun(escaped) {
    if (this.runOver) return;
    this.runOver = true;
    this.escaped = escaped;
    this.input.locked = true;
    this.look.disable();
    this.showPrompt(null);
    this.sound.stopBusy();
    this.slap = null;
    this.fade = 0;
    this.el.fade.style.opacity = "0";
    this.el.screen.classList.add("ending");
    if (escaped) {
      this.sound.stop();
      this.escapeFade = 0;
      return;
    }
    this.sound.stop();
    this.sound.gameOver();
    this.showEndCard(false);
  }

  updateEscape(dt) {
    const scene = this.cutscene;
    scene.update(dt);
    const fadeIn = Math.max(0, 1 - scene.t / ESCAPE_FADE_IN_S);
    const fadeOut = Math.max(0, Math.min(1, (scene.t - ESCAPE.FADE_AT) / (ESCAPE.LENGTH - ESCAPE.FADE_AT - 0.3)));
    this.el.fade.style.opacity = String(Math.max(fadeIn, fadeOut));
    scene.render();
    if (scene.done) {
      scene.dispose();
      this.cutscene = null;
      this.el.fade.style.opacity = "0";
      this.showEndCard(true);
    }
  }

  showEndCard(escaped) {
    this.cardShown = true;
    const seconds = Math.floor(this.elapsed);
    const best = escaped ? this.recordBest(seconds) : null;
    const score = jugaadScore({ ...this.stats, seconds, escaped });
    const title = jugaadTitle(score, escaped);
    const clock = formatClock(START_MINUTES + this.elapsed * GAME_MINUTES_PER_SECOND);

    this.el.endEyebrow.textContent = title;
    this.el.endTitle.textContent = escaped ? "Ghar pahunch gaye!" : "Overtime.";
    this.el.endBody.textContent = escaped
      ? `Out under the shutter at ${clock}. Resignation: effective immediately. Notice period: served in spirit. Behind you, Motu Sir is still shouting "Kal subah nau baje!" from the doorway.`
      : "Five slaps, and a night in the record room. At 11:40 PM somebody remembers to unlock the door. Your resignation letter is still in your pocket — and your notice period starts tomorrow.";
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
    stat("Jugaad score", String(score));
    stat("Time in the bank", formatSeconds(seconds));
    stat("Slaps", String(this.stats.slaps));
    stat("Times he spotted you", String(this.stats.spotted));
    stat("Tools you made", String(this.stats.crafted));
    if (best !== null) stat("Best escape", formatSeconds(best));
    this.el.endHacks.innerHTML = "";
    for (const entry of this.stats.log) {
      const li = document.createElement("li");
      li.textContent = `${entry.door} · ${entry.step}: ${entry.item}`;
      this.el.endHacks.append(li);
    }
    this.el.endHacks.classList.toggle("hidden", !this.stats.log.length);
    $("#solo-end-hacks-label").classList.toggle("hidden", !this.stats.log.length);
    this.el.end.classList.remove("hidden");
    this.el.end.classList.toggle("escaped", escaped);
  }

  recordBest(seconds) {
    let best = seconds;
    try {
      const stored = Number(localStorage.getItem(BEST_KEY));
      if (stored > 0) best = Math.min(stored, seconds);
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Storage can be unavailable; the run still counted.
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
    clearTimeout(this.subtitleTimer);
    clearTimeout(this.noiseTimer);
    for (const t of this.tutorialTimers || []) clearTimeout(t);
    clearTimeout(this.titleTimer);
    this.el.titleFlash.classList.add("hidden");
    this.endCinematic();
    this.unbindControls();
    this.look.disable();
    this.input.locked = false;
    this.input.runOn = false;
    this.input.crouchOn = false;
    this.input.syncStanceButtons();
    this.sound.stop();
    this.cutscene?.dispose();
    this.cutscene = null;
    this.escapeFade = null;
    this.cardShown = false;
    this.el.end.classList.add("hidden");
    this.el.screen.classList.remove("ending");
    this.el.fade.style.opacity = "0";
    this.el.thappad.classList.add("hidden");
    this.bossBody?.dispose();
    this.doorVisuals?.dispose();
    this.world?.dispose();
    this.scene = null;
  }
}

function busyFor(tag) {
  if (tag === "picks" || tag === "crudepick") return "pick";
  if (tag === "card" || tag === "shim") return "card";
  if (tag === "oil") return "oil";
  return "metal";
}

function formatSeconds(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatClock(minutes) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

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

