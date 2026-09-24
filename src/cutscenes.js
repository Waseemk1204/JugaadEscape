// The two scenes the player watches rather than plays, staged in the bank
// itself with the real doors, the real furniture and Motu Sir's real body.
//
//   IntroScene   — 6 PM. You have finally written your resignation, notice
//                  period be damned. Then Sir walks out of his cabin and, one
//                  by one, locks the shutter, the gate and the wooden doors,
//                  and tells the whole branch nobody goes home.
//   LockupScene  — the last thappad. He shoves you into the record room at
//                  the back, tells you that you in particular are not going
//                  anywhere tonight, and locks the door.
//
// Each scene is a generator: it yields a number of seconds to wait, or a
// function to wait on, and reads top to bottom like a script. The scene owns
// the camera and Sir's body while it runs; the game just renders.

import * as THREE from "three";
import { SPOTS, TILE, U } from "../shared/bank-map.js";

const C = (x, y) => ({ x: x * TILE, y: y * TILE }); // grid cells → map pixels
const M = (cells) => cells * TILE * U; // grid cells → metres
const WEST = Math.PI;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;

// ------------------------------------------------------------------ the actor

// Sir, on rails: walks where the script says, strikes the pose it asks for.
class Actor {
  constructor(game) {
    this.game = game;
    this.x = SPOTS.bossChair.x;
    this.y = SPOTS.bossChair.y;
    this.angle = WEST;
    this.pose = "sit";
    this.path = [];
    this.speed = 92;
    this.reach = 1;
    this.slap = 0;
    this.angry = false;
    this.facing = null;
    this.stepped = 0;
  }

  walkTo(point) {
    this.path = this.game.map.findPath(this.x, this.y, point.x, point.y, 15);
    if (!this.path.length) this.path = [point];
    this.facing = null;
  }

  get walking() {
    return this.path.length > 0;
  }

  face(angle) {
    this.facing = angle;
  }

  faceToward(x, y) {
    this.facing = Math.atan2(y - this.y, x - this.x);
  }

  update(dt, now) {
    let moving = false;
    if (this.path.length) {
      const next = this.path[0];
      const dx = next.x - this.x;
      const dy = next.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (d <= step) {
        this.x = next.x;
        this.y = next.y;
        this.path.shift();
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        this.angle += wrap(Math.atan2(dy, dx) - this.angle) * Math.min(1, dt * 7);
        moving = true;
        this.stepped += step;
        if (this.stepped > 22) {
          this.stepped = 0;
          this.game.sound.bossStep(this.x, this.y);
        }
      }
    } else if (this.facing !== null) {
      this.angle += wrap(this.facing - this.angle) * Math.min(1, dt * 5);
    }
    this.game.bossBody.setMark(null);
    this.game.bossBody.update({
      x: this.x,
      y: this.y,
      angle: this.angle,
      pose: moving ? "walk" : this.pose,
      moving,
      speed: this.speed / 60,
      dt,
      time: now,
      angry: this.angry,
      slap: this.slap,
      reach: this.reach,
    });
  }
}

// ----------------------------------------------------------------- the camera

// Where the scene's eye is and what it looks at. Cuts are instant; within a
// shot the eye glides and turns smoothly, and can lock onto Sir.
class Eye {
  constructor(game) {
    this.game = game;
    this.pos = { x: 0, y: 0, h: 1.6 };
    this.target = { x: 0, y: 0, h: 1.6 };
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.aim = { yaw: 0, pitch: 0 };
    this.track = null; // "boss" or { x, y, h } in cells/metres
    this.glide = 0; // seconds for the position to catch up; 0 snaps
    this.turn = 4;
    this.shake = 0;
  }

  // Cut to a new shot.
  cut({ at, h = 1.6, yaw = 0, pitch = 0, track = null }) {
    const p = C(at[0], at[1]);
    this.pos = { x: p.x, y: p.y, h };
    this.target = { ...this.pos };
    this.yaw = yaw;
    this.pitch = pitch;
    this.aim = { yaw, pitch };
    this.track = track;
    this.glide = 0;
  }

  moveTo(at, h, seconds) {
    const p = C(at[0], at[1]);
    this.target = { x: p.x, y: p.y, h: h ?? this.target.h };
    this.glide = seconds;
  }

  look(yaw, pitch = this.aim.pitch, turn = 4) {
    this.track = null;
    this.aim = { yaw, pitch };
    this.turn = turn;
  }

  follow(track, turn = 4) {
    this.track = track;
    this.turn = turn;
  }

  update(dt, now, actor) {
    if (this.glide > 0) {
      const k = Math.min(1, dt / this.glide) * 2.2;
      this.pos.x += (this.target.x - this.pos.x) * Math.min(1, k);
      this.pos.y += (this.target.y - this.pos.y) * Math.min(1, k);
      this.pos.h += (this.target.h - this.pos.h) * Math.min(1, k);
    }
    if (this.track) {
      const t = this.track === "boss" ? { x: actor.x, y: actor.y, h: 1.55 } : this.track;
      const dx = (t.x - this.pos.x) * U;
      const dz = (t.y - this.pos.y) * U;
      this.aim.yaw = Math.atan2(-dx, -dz);
      this.aim.pitch = Math.atan2(t.h - this.pos.h, Math.hypot(dx, dz));
    }
    this.yaw += wrap(this.aim.yaw - this.yaw) * Math.min(1, dt * this.turn);
    this.pitch += (this.aim.pitch - this.pitch) * Math.min(1, dt * this.turn);
    this.shake = Math.max(0, this.shake - dt * 2);
    const s = this.shake ** 2;
    const cam = this.game.camera;
    cam.position.set(this.pos.x * U + s * Math.sin(now * 47) * 0.06, this.pos.h + s * Math.sin(now * 61) * 0.04, this.pos.y * U);
    cam.rotation.set(this.pitch, this.yaw, this.roll + s * Math.sin(now * 39) * 0.04, "YXZ");
    this.game.sound.setListener({ x: this.pos.x, y: this.pos.y, yaw: this.yaw });
  }
}

// --------------------------------------------------------------- the runner

class Scene {
  constructor(game) {
    this.game = game;
    this.actor = new Actor(game);
    this.eye = new Eye(game);
    this.t = 0;
    this.done = false;
    this.fade = 0;
    this.fadeTo = 0;
    this.fadeRate = 1;
    this.gen = null;
    this.waiting = () => true;
  }

  begin() {
    this.gen = this.script();
    this.advance();
  }

  // Run the script until it asks to wait for something.
  advance() {
    for (let guard = 0; guard < 50; guard += 1) {
      const r = this.gen.next();
      if (r.done) {
        this.finish();
        return;
      }
      const v = r.value;
      if (typeof v === "number") {
        const until = this.t + v;
        this.waiting = () => this.t >= until;
        return;
      }
      if (typeof v === "function") {
        this.waiting = v;
        return;
      }
    }
  }

  update(dt, now) {
    if (this.done) return;
    this.t += dt;
    if (this.waiting()) this.advance();
    if (this.done) return;
    this.actor.update(dt, now);
    this.eye.update(dt, now, this.actor);
    this.fade += Math.sign(this.fadeTo - this.fade) * Math.min(Math.abs(this.fadeTo - this.fade), dt * this.fadeRate);
    this.game.el.fade.style.opacity = String(this.fade);
  }

  fadeOut(seconds) {
    this.fadeTo = 1;
    this.fadeRate = 1 / seconds;
    return seconds;
  }

  fadeIn(seconds) {
    this.fadeTo = 0;
    this.fadeRate = 1 / seconds;
    return 0;
  }

  // Sir speaks: a subtitle, his mutter, and time to read it.
  *boss(text, mood = "normal", seconds = null) {
    this.game.subtitle(text, mood, "Motu Sir");
    this.game.sound.voice(this.actor.x, this.actor.y, mood, Math.min(9, Math.max(2, Math.round(text.split(" ").length / 1.4))));
    yield seconds ?? readTime(text);
  }

  // What is going through your head.
  *think(text, seconds = null) {
    this.game.subtitle(text, "thought", "You");
    yield seconds ?? readTime(text);
  }

  *walk(at, speed = 92) {
    this.actor.speed = speed;
    this.actor.walkTo(C(at[0], at[1]));
    yield () => !this.actor.walking;
  }

  finish() {
    this.done = true;
  }

  skip() {
    if (!this.done) this.finish(true);
  }

  dispose() {}
}

// -------------------------------------------------------------------- intro

export class IntroScene extends Scene {
  constructor(game) {
    super(game);
    const g = game;
    // Everything starts open: it is closing time and the last customer has
    // just left.
    for (const id of ["wooden", "gate", "shutter"]) {
      g.doors[id].open = true;
      g.map.setDoorOpen(id, true);
      g.doorVisuals.anim[id] = 1;
    }
    g.doorVisuals.shutterLift = 2.7;
    this.fade = 1;
    this.begin();
  }

  *script() {
    const g = this.game;
    const a = this.actor;
    const e = this.eye;
    const sound = g.sound;
    const chair = SPOTS.playerChair;

    // At your desk, looking down at the letter.
    e.cut({ at: [chair.x / TILE, chair.y / TILE], h: 1.18, yaw: -0.42, pitch: -0.5 });
    this.fadeIn(1.4);
    yield 0.8;
    yield* this.think("6:00 PM. Six years in this branch. Six years of \"bas yeh last file hai, Sharma.\"");
    yield* this.think("Not any more. The letter's signed. Notice period? They can keep it. I'm walking out tonight and never coming back.");
    e.look(0.05, -0.1, 2);
    yield 1;

    // Something is moving in the cabin.
    sound.chairCreak(a.x, a.y);
    sound.cabinDoor(a.x, a.y);
    a.pose = "stand";
    e.follow("boss", 2.5);
    yield 0.8;
    a.speed = 92;
    a.walkTo(C(25.95, 15.2));
    yield* this.think("…Where's Motu Sir off to? He never leaves before the chai arrives.", 3);
    yield () => a.y < 17.2 * TILE;

    // Cut to the hall: the front of the branch, all three doors wide open.
    e.cut({ at: [18.6, 12.4], h: 1.55, yaw: 0, pitch: 0, track: "boss" });
    a.walkTo(C(16.9, 1.8));
    yield () => !a.walking;

    // The shutter.
    a.face(NORTH);
    a.pose = "reachUp";
    a.reach = 1;
    yield 0.5;
    g.doors.shutter.open = false;
    sound.shutterRoll(true);
    const pull = this.t;
    yield () => {
      a.reach = Math.max(0, 1 - (this.t - pull) / 1.4);
      return this.t - pull > 1.5;
    };
    sound.bang(a.x, a.y - 30);
    e.shake = 0.35;
    yield* this.think("No. No no no—", 1.2);
    sound.click(a.x - 60, a.y - 20);
    yield 0.35;
    sound.click(a.x + 60, a.y - 20);
    g.map.setDoorOpen("shutter", false);
    yield 0.5;

    // The gate.
    a.pose = "stand";
    yield* this.walk([16.9, 5.4]);
    a.face(NORTH);
    a.pose = "reach";
    yield 0.4;
    g.doors.gate.open = false;
    sound.gateSlide(true);
    yield 1.4;
    sound.bang(a.x, a.y - 20, 0.5);
    sound.click(a.x, a.y - 20);
    sound.keyJingle(a.x, a.y);
    g.map.setDoorOpen("gate", false);
    yield 0.6;

    // The wooden doors, from the inside.
    a.pose = "stand";
    yield* this.walk([16.9, 8.9]);
    a.face(NORTH);
    a.pose = "reach";
    yield 0.4;
    g.doors.wooden.open = false;
    sound.woodenDoors(false);
    yield 0.45;
    sound.bang(a.x, a.y - 20, 0.7);
    e.shake = 0.25;
    yield 0.5;
    a.pose = "reachUp";
    a.reach = 1;
    yield 0.3;
    sound.click(a.x, a.y - 20);
    yield 0.4;
    g.map.setDoorOpen("wooden", false);

    // He turns to the branch.
    a.pose = "stand";
    yield* this.walk([17.1, 9.7]);
    a.faceToward(e.pos.x, e.pos.y + 6 * TILE);
    a.angry = true;
    yield 0.4;
    yield* this.boss("Suno sab log! Kal audit hai. Aaj koi ghar nahi jaayega — jab tak main na bolun!", "shout", 3.8);
    yield* this.boss("Samjhe?!", "shout", 1.2);
    g.subtitle("Haan, sir…", "aside", "Everyone");
    sound.groan();
    yield 1.8;
    a.faceToward(chair.x, chair.y);
    a.pose = "point";
    yield* this.boss("Aur Sharma — tumhari files sabse zyada pending hain. Tum toh bilkul mat hilna.", "normal", 3.8);
    a.pose = "stand";
    a.angry = false;

    // Back to his cabin; back to your desk.
    a.speed = 100;
    a.walkTo(SPOTS.bossChair);
    yield () => a.y > 15.6 * TILE || !a.walking;
    e.cut({ at: [chair.x / TILE, chair.y / TILE], h: 1.18, yaw: -0.9, pitch: -0.05, track: "boss" });
    yield () => !a.walking;
    a.face(WEST);
    a.pose = "sit";
    sound.chairCreak(a.x, a.y);
    e.look(-0.1, -0.35, 1.5);
    yield* this.think("Shutter. Gate. Wooden doors. Teen taale.", 2.6);
    e.look(0.02, 0.02, 1.2);
    yield* this.think("Theek hai, Motu Sir. I don't have the keys… but I've got six years of jugaad.", 3.4);
    yield* this.think("Kuch na kuch kar lenge.", 2);
    g.showTitleFlash();
    sound.titleSting();
    yield 2.8;
  }

  finish(skipped = false) {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    // However the scene ended, the shift starts from the same place: every
    // door shut and locked, Sir at his desk, you in your chair.
    for (const id of ["wooden", "gate", "shutter"]) {
      g.doors[id].open = false;
      g.map.setDoorOpen(id, false);
      if (skipped) g.doorVisuals.anim[id] = 0;
    }
    g.doorVisuals.shutterLift = 0.95;
    g.el.fade.style.opacity = "0";
    g.endCinematic();
    g.beginShift(skipped);
  }
}

// ------------------------------------------------------------------- lockup

// The record room door does not exist in the game — it is always open, and
// nobody has shut it in years. Tonight somebody does.
function buildRecordRoomDoor(scene) {
  const own = [];
  const mat = (color, extra) => {
    const m = new THREE.MeshLambertMaterial({ color, ...extra });
    own.push(m);
    return m;
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  own.push(box);
  const wood = mat(0x5e3a22);
  const glass = mat(0x9fc4cc, { transparent: true, opacity: 0.25, depthWrite: false });
  const hinge = new THREE.Group();
  hinge.position.set(M(15), 0, M(31.5));
  const part = (m, sx, sy, sz, x, y) => {
    const mesh = new THREE.Mesh(box, m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, 0);
    hinge.add(mesh);
  };
  // A leaf 1.5m wide and 2.3 high, with a small window at head height —
  // just big enough for a face.
  part(wood, 0.5, 2.3, 0.05, 0.25, 1.15);
  part(wood, 0.5, 2.3, 0.05, 1.25, 1.15);
  part(wood, 0.5, 1.5, 0.05, 0.75, 0.75);
  part(wood, 0.5, 0.25, 0.05, 0.75, 2.175);
  part(glass, 0.5, 0.55, 0.02, 0.75, 1.775);
  part(mat(0xc9a13b), 0.04, 0.2, 0.1, 1.38, 1.0);
  const sign = document.createElement("canvas");
  sign.width = 256;
  sign.height = 64;
  const ctx = sign.getContext("2d");
  ctx.fillStyle = "#1c1a17";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#e2c070";
  ctx.font = "bold 26px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("RECORD ROOM", 128, 42);
  const texture = new THREE.CanvasTexture(sign);
  texture.colorSpace = THREE.SRGBColorSpace;
  own.push(texture);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), mat(0xffffff, { map: texture }));
  own.push(plate.geometry);
  plate.position.set(M(16), 2.5, M(31) - 0.01);
  plate.rotation.y = Math.PI;
  scene.add(hinge, plate);
  return {
    hinge,
    dispose() {
      scene.remove(hinge, plate);
      for (const thing of own) thing.dispose();
    },
  };
}

export class LockupScene extends Scene {
  constructor(game) {
    super(game);
    this.door = buildRecordRoomDoor(game.scene);
    this.doorAngle = -Math.PI * 0.47; // open, swung into the room
    this.doorTarget = this.doorAngle;
    this.fade = 1;
    this.fadeTo = 1;
    this.begin();
  }

  update(dt, now) {
    this.doorAngle += (this.doorTarget - this.doorAngle) * Math.min(1, dt * 9);
    this.door.hinge.rotation.y = this.doorAngle;
    super.update(dt, now);
  }

  *script() {
    const g = this.game;
    const a = this.actor;
    const e = this.eye;
    const sound = g.sound;

    // Sir, in the record room doorway, having just shoved you through it.
    a.x = 15.95 * TILE;
    a.y = 30.4 * TILE;
    a.angle = SOUTH;
    a.face(SOUTH);
    a.pose = "stand";
    a.angry = true;
    e.cut({ at: [15.95, 31.6], h: 1.5, yaw: Math.PI, pitch: -0.3 });
    yield 0.4;

    // Stumbling in, into the dust and the files.
    this.fadeIn(0.5);
    e.moveTo([15.9, 34.3], 1.25, 0.9);
    e.roll = 0.18;
    sound.thud();
    e.shake = 0.6;
    yield 0.9;
    e.roll = 0;
    yield* this.think("…Aah. Meri gaal.", 1.6);
    e.moveTo([15.9, 34.3], 1.6, 0.6);
    e.follow({ x: a.x, y: a.y, h: 1.75 }, 2.2);
    yield 1.2;

    yield* this.boss("Bahut bhaagne ka shauk hai na, Sharma? Ab yahan baitho — purane records ke saath.", "normal", 4.2);
    yield* this.boss("Baaki sab ko shaayad gyaarah baje jaane doon. Lekin tum…", "normal", 3.2);
    a.pose = "point";
    yield* this.boss("Tum toh aaj khaas taur pe nahi jaoge.", "shout", 3.2);
    a.pose = "stand";
    yield* this.boss("Aur yeh resignation letter? Notice period teen mahine ka hota hai, Sharma. Teen. Mahine.", "normal", 4.4);

    // The door.
    a.pose = "reach";
    yield 0.3;
    this.doorTarget = 0;
    yield 0.25;
    sound.bang(a.x, a.y + 30, 0.8);
    e.shake = 0.5;
    a.pose = "stand";
    yield 0.6;
    sound.keyJingle(a.x, a.y);
    yield 0.3;
    sound.click(a.x, a.y + 20);
    yield 0.3;
    sound.click(a.x, a.y + 20);
    yield 0.7;

    // One last look through the little window.
    a.angry = false;
    yield* this.boss("Good night, Sharma.", "aside", 2.2);
    a.speed = 80;
    a.walkTo(C(22.5, 29.8));
    e.follow({ x: 15.95 * TILE, y: 31 * TILE, h: 1.75 }, 1.5);
    yield 2.4;

    // And the light.
    sound.lightSwitch();
    g.world.ambient.intensity = 0.08;
    g.world.hemi.intensity = 0.06;
    for (const light of g.world.lights) light.intensity = 0;
    yield 1.4;
    yield* this.think("…Kal. Kal toh pakka.", 2.6);
    this.fadeOut(1.6);
    yield 1.8;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    g.el.fade.style.opacity = "1";
    g.endCinematic();
    g.finishLockup();
  }

  dispose() {
    this.door.dispose();
  }
}

// Long enough to read, never so long it drags.
function readTime(text) {
  return Math.min(5, Math.max(1.6, 0.9 + text.length * 0.045));
}

function wrap(a) {
  return ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}
