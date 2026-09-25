// The three doors between you and the street, and what they look like as you
// work on them: the wooden doors' tower bolt and latch, the collapsible gate
// and its padlock, and the shutter with a padlock at each foot.
//
// Purely visual. The state lives in the game (shared/jugaad.js lockedDoors);
// this eases the meshes towards it every frame.

import * as THREE from "three";
import { TILE, U } from "../../shared/bank-map.js";

const cx = (cells) => cells * TILE * U;

export class DoorVisuals {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
    this.box = this.own(new THREE.BoxGeometry(1, 1, 1));
    this.brass = this.own(new THREE.MeshLambertMaterial({ color: 0xc9a13b }));
    this.steel = this.own(new THREE.MeshLambertMaterial({ color: 0x8a8f93 }));
    this.dark = this.own(new THREE.MeshLambertMaterial({ color: 0x33383c }));
    this.buildWooden();
    this.buildGate();
    this.buildShutter();
    this.anim = { wooden: 0, gate: 0, shutter: 0, bolt: 0 };
    // How far the shutter goes up when open: half way in play (you crawl
    // under it), all the way at opening time.
    this.shutterLift = 0.95;
  }

  own(thing) {
    this.disposables.push(thing);
    return thing;
  }

  part(material, [sx, sy, sz], [x, y, z], parent = this.group) {
    const m = new THREE.Mesh(this.box, material);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  padlock([x, y, z], parent = this.group) {
    const lock = new THREE.Group();
    this.part(this.brass, [0.09, 0.1, 0.04], [0, 0, 0], lock);
    const shackle = new THREE.Mesh(this.own(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI)), this.steel);
    shackle.position.y = 0.05;
    lock.add(shackle);
    lock.position.set(x, y, z);
    parent.add(lock);
    return lock;
  }

  // ------------------------------------------------------------------ wooden

  buildWooden() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#6b3f22";
    ctx.fillRect(0, 0, 64, 128);
    for (let x = 0; x < 64; x += 1) {
      ctx.fillStyle = `rgba(40,20,10,${0.08 + Math.random() * 0.2})`;
      ctx.fillRect(x, 0, 1, 128);
    }
    ctx.strokeStyle = "rgba(25,12,4,0.8)";
    ctx.lineWidth = 3;
    ctx.strokeRect(9, 8, 46, 50);
    ctx.strokeRect(9, 68, 46, 50);
    const texture = this.own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    const wood = this.own(new THREE.MeshLambertMaterial({ map: texture }));

    const z = cx(7.5);
    this.leaves = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(side < 0 ? cx(15) : cx(19), 0, z);
      const leaf = this.part(wood, [1.49, 2.6, 0.07], [side < 0 ? 0.75 : -0.75, 1.3, 0], hinge);
      void leaf;
      // Handle on each leaf, near the meeting edge.
      this.part(this.brass, [0.03, 0.22, 0.03], [side < 0 ? 1.35 : -1.35, 1.05, 0.07], hinge);
      this.part(this.brass, [0.03, 0.22, 0.03], [side < 0 ? 1.35 : -1.35, 1.05, -0.07], hinge);
      this.group.add(hinge);
      this.leaves.push({ hinge, side });
    }
    // Tower bolt at the top of the right leaf: a barrel on the leaf and a bolt
    // that shoots up into the frame.
    const right = this.leaves[1].hinge;
    this.part(this.steel, [0.05, 0.22, 0.04], [-1.4, 2.42, 0.06], right);
    this.bolt = this.part(this.dark, [0.018, 0.2, 0.018], [-1.4, 2.56, 0.06], right);
    // Latch plate at the meeting edge.
    this.part(this.steel, [0.06, 0.14, 0.02], [-1.47, 1.05, 0.045], right);
  }

  // -------------------------------------------------------------------- gate

  buildGate() {
    // The collapsible grille: vertical channels with scissor bars between.
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 128, 256);
    ctx.strokeStyle = "#4b5256";
    ctx.lineWidth = 6;
    for (let x = 4; x < 128; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    for (let y = -32; y < 256; y += 64) {
      for (let x = 4; x < 128; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 32, y + 64);
        ctx.moveTo(x + 32, y);
        ctx.lineTo(x, y + 64);
        ctx.stroke();
      }
    }
    const texture = this.own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3 / 0.5, 1);
    const grille = this.own(new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));

    const z = cx(4.5);
    this.gateHalves = [];
    for (const side of [-1, 1]) {
      const anchor = new THREE.Group();
      anchor.position.set(side < 0 ? cx(13) : cx(21), 0, z);
      const half = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1, 2.66)), grille);
      half.position.set(side < 0 ? 1.5 : -1.5, 1.33, 0);
      half.scale.x = 3;
      anchor.add(half);
      // The leading edge post, which the padlock goes through.
      const post = this.part(this.dark, [0.05, 2.66, 0.05], [side < 0 ? 3 : -3, 1.33, 0], anchor);
      this.group.add(anchor);
      this.gateHalves.push({ anchor, half, post, side });
    }
    // Top and bottom tracks.
    this.part(this.dark, [cx(8), 0.05, 0.08], [cx(17), 2.68, z]);
    this.part(this.dark, [cx(8), 0.02, 0.08], [cx(17), 0.01, z]);
    this.gateLock = this.padlock([cx(17), 1.1, z + 0.05]);
  }

  // ----------------------------------------------------------------- shutter

  buildShutter() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#6c7a73";
    ctx.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 8) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(0, y, 64, 2);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, y + 5, 64, 3);
    }
    for (let i = 0; i < 120; i += 1) {
      ctx.fillStyle = `rgba(${120 + Math.random() * 40},${60 + Math.random() * 20},30,${Math.random() * 0.35})`;
      ctx.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 3, 1 + Math.random() * 2);
    }
    const texture = this.own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 1);
    const metal = this.own(new THREE.MeshLambertMaterial({ map: texture }));
    this.shutter = new THREE.Group();
    this.part(metal, [cx(8), 2.9, 0.05], [cx(17), 1.45, cx(0.3)], this.shutter);
    // Bottom bar with the floor rings.
    this.part(this.dark, [cx(8), 0.08, 0.09], [cx(17), 0.04, cx(0.3)], this.shutter);
    this.group.add(this.shutter);
    this.shutterLocks = [this.padlock([cx(13.8), 0.09, cx(0.45)]), this.padlock([cx(20.2), 0.09, cx(0.45)])];
    for (const lock of this.shutterLocks) this.part(this.steel, [0.08, 0.02, 0.08], [lock.position.x, 0.01, lock.position.z]);
  }

  // --------------------------------------------------------------- update

  // `doors` is the game's door state: { wooden: { open, broken, done }, ... }
  update(doors, dt, now = 0) {
    const ease = (key, target, rate) => {
      this.anim[key] += (target - this.anim[key]) * Math.min(1, dt * rate);
      return this.anim[key];
    };

    // What the player is working on right now (set by the game while E is
    // held): the door answers the tool.
    const work = this.working;
    const on = (door, step) => work && work.doorId === door && (!step || work.stepId === step);

    const w = ease("wooden", doors.wooden.open ? 1 : 0, 3);
    // Forcing the latch rattles both leaves in their frame.
    const rattle = on("wooden", "latch") && work.p > 0.3 ? Math.sin(now * 38) * (work.kind === "blade" ? 0.012 : 0.005) : 0;
    for (const { hinge, side } of this.leaves) hinge.rotation.y = (side < 0 ? -w * Math.PI * 0.46 : w * Math.PI * 0.46) + rattle * side;
    // The tower bolt slides across as the umbrella yanks it.
    const yank = on("wooden", "bolt") ? Math.max(0, (work.p - 0.78) / 0.22) : 0;
    const bolt = ease("bolt", doors.wooden.done.bolt ? 1 : 0, 6);
    this.bolt.position.y = 2.56 - Math.max(bolt, yank) * 0.13;

    const g = ease("gate", doors.gate.open ? 1 : 0, 1.6);
    for (const { half, post, side } of this.gateHalves) {
      // Folds back towards the wall: the lattice concertinas as it goes.
      const width = 3 - g * 2.7;
      half.scale.x = width;
      half.position.x = side < 0 ? width / 2 : -width / 2;
      post.position.x = side < 0 ? width : -width;
    }
    this.placeLock(this.gateLock, doors.gate.done.padlock, doors.gate.broken, [cx(17) + (this.gateHalves[0].post.position.x - 3), 1.1, cx(4.5) + 0.05]);
    this.shakeLock(this.gateLock, on("gate", "padlock") ? work : null, now);

    const s = ease("shutter", doors.shutter.open ? 1 : 0, 1.2);
    this.shutter.position.y = s * this.shutterLift;
    this.placeLock(this.shutterLocks[0], doors.shutter.done.lockLeft, doors.shutter.broken, [cx(13.8), 0.09, cx(0.45)]);
    this.placeLock(this.shutterLocks[1], doors.shutter.done.lockRight, doors.shutter.broken, [cx(20.2), 0.09, cx(0.45)]);
    this.shakeLock(this.shutterLocks[0], on("shutter", "lockLeft") ? work : null, now);
    this.shakeLock(this.shutterLocks[1], on("shutter", "lockRight") ? work : null, now);
  }

  // A padlock being worked on twitches on its hasp: small and quick for a
  // pick, a hard jump for each extinguisher blow.
  shakeLock(lock, work, now) {
    if (!work) return;
    if (work.kind === "smash") {
      const cycle = (work.p * 2) % 1;
      const hit = cycle > 0.72 && cycle < 0.85 ? (0.85 - cycle) / 0.13 : 0;
      lock.rotation.z += hit * 0.9;
      lock.position.y += hit * 0.03;
      return;
    }
    const strength = work.kind === "picks" ? 0.12 : work.kind === "shim" ? 0.06 : 0.04;
    lock.rotation.z += Math.sin(now * 42) * strength;
    lock.rotation.x += Math.sin(now * 31) * strength * 0.5;
  }

  // Locked: hanging in place. Opened: hanging open, off to the side.
  // Broken: on the floor.
  placeLock(lock, open, broken, [x, y, z]) {
    if (broken && open) {
      lock.position.set(x + 0.2, 0.05, z + 0.25);
      lock.rotation.set(Math.PI / 2, 0, 0.8);
      return;
    }
    lock.rotation.set(0, 0, open ? 0.6 : 0);
    lock.position.set(open ? x + 0.12 : x, open ? Math.max(0.06, y - 0.05) : y, z);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const thing of this.disposables) thing.dispose();
  }
}
