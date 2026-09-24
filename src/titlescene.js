// The landing page's backdrop: the real branch, after hours, in slow
// cinematic drifts — the locked front doors, Motu Sir at his desk behind the
// glass, your desk with the resignation letter on it. Built from the same
// world, doors and Boss the game uses, and thrown away when the shift starts.

import * as THREE from "three";
import { BankWorld } from "./three/bank.js";
import { DoorVisuals } from "./three/doors.js";
import { Boss } from "./three/boss.js";
import { SPOTS, TILE, U } from "../shared/bank-map.js";

const M = (cells) => cells * TILE * U;

// Each shot: the eye glides from `from` to `to` (cells, height in metres)
// while looking at `look`.
// The words sit on the left of the page, so each shot is framed with its
// subject to the right of centre.
const SHOTS = [
  { from: [22.6, 13.0, 1.45], to: [20.6, 11.8, 1.55], look: [15.2, 7.2, 1.45], seconds: 8 },
  { from: [16.8, 25.6, 1.35], to: [19.4, 24.4, 1.45], look: [27.6, 19.6, 1.25], seconds: 8 },
  { from: [12.3, 27.4, 1.5], to: [11.7, 26.9, 1.35], look: [9.6, 25.1, 0.85], seconds: 7 },
  { from: [3.2, 29.6, 2.1], to: [6.5, 29.4, 2.0], look: [19, 16, 1.1], seconds: 8 },
];

const LOCKED = {
  wooden: { open: false, broken: false, done: { bolt: false, latch: false } },
  gate: { open: false, broken: false, done: { padlock: false, oil: false } },
  shutter: { open: false, broken: false, done: { lockLeft: false, lockRight: false, grease: false } },
};

export class TitleScene {
  constructor(renderer, fadeEl) {
    this.renderer = renderer;
    this.fadeEl = fadeEl;
    this.active = false;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 80);
    this.world = new BankWorld(this.scene);
    this.doors = new DoorVisuals(this.scene);
    this.boss = new Boss(this.scene);
    this.shot = 0;
    this.t = 0;
    this.last = performance.now();
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.resize();
    this.frame = requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia("(hover: none)").matches ? 1.25 : 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  loop(time) {
    if (!this.active) return;
    this.frame = requestAnimationFrame((t) => this.loop(t));
    const dt = Math.max(0, Math.min(0.05, (time - this.last) / 1000));
    this.last = time;
    this.t += dt;
    const now = time / 1000;

    let shot = SHOTS[this.shot];
    if (this.t > shot.seconds) {
      this.t = 0;
      this.shot = (this.shot + 1) % SHOTS.length;
      shot = SHOTS[this.shot];
    }
    // Dip to black at each cut.
    const k = this.t / shot.seconds;
    const fade = Math.max(0, 1 - this.t / 0.9, (this.t - (shot.seconds - 0.7)) / 0.7);
    if (this.fadeEl) this.fadeEl.style.opacity = String(Math.min(1, fade).toFixed(3));

    const ease = k * k * (3 - 2 * k);
    const [fx, fy, fh] = shot.from;
    const [tx, ty, th] = shot.to;
    this.camera.position.set(M(fx + (tx - fx) * ease), fh + (th - fh) * ease, M(fy + (ty - fy) * ease));
    this.camera.lookAt(M(shot.look[0]), shot.look[2], M(shot.look[1]));

    // Sir at his desk, now and then looking up from his screen.
    const glance = Math.max(0, Math.sin(now * 0.45)) ** 6;
    this.boss.update({
      x: SPOTS.bossChair.x,
      y: SPOTS.bossChair.y,
      angle: Math.PI,
      headTurn: glance * Math.sin(now * 1.3) * 0.5,
      pose: "sit",
      dt,
      time: now,
    });
    this.world.update(now, dt);
    this.world.setClock(18 * 60 + 7);
    this.doors.update(LOCKED, dt);
    this.renderer.render(this.scene, this.camera);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.onResize);
    this.boss.dispose();
    this.doors.dispose();
    this.world.dispose();
    this.scene = null;
    if (this.fadeEl) this.fadeEl.style.opacity = "0";
  }
}
