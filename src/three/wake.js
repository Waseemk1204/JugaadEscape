// The end of a run that ran out of lives, seen through your own eyes.
//
// Black. Your eyes open — twice, the first time they do not stay open — and
// you are slumped against the wall of a small dark room, blood in your eyes.
// The torch clicks on. You look left: nothing. Right: nothing. Then slowly,
// because you already know, you look up. It is on the ceiling, directly over
// you, face down. It drops.
//
// Cut to black on the impact. The scene only moves the camera and the monster;
// the eyelids, the blood and the cut are HTML over it, driven from solo.js by
// the beats exported here. Everything is in metres.

import * as THREE from "three";
import { Monster } from "./monster.js";

export const WAKE = {
  OPEN_1: 1.0, // eyes crack open…
  SHUT: 1.7, // …and close again
  OPEN_2: 2.3, // then open for good
  TORCH: 3.2, // click
  LEFT: 3.7,
  RIGHT: 5.0,
  CENTRE: 6.3,
  UP: 6.9, // start looking up, slowly
  SEEN: 8.7, // it is there
  POUNCE: 9.4, // it drops
  CUT: 9.75, // black
  LENGTH: 11.2, // the card comes up
};

const CEILING = 2.55;
const EYE = 1.02; // sitting slumped against the wall
const ROOM = 4.2;

// A splash of dried blood: overlapping blots, a darker core and a few
// drips, on transparency. Drawn once; the walls and floor share it.
function bloodTexture(drips) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const blot = (x, y, r, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(70, 4, 3, ${alpha})`);
    g.addColorStop(0.7, `rgba(55, 3, 2, ${alpha * 0.8})`);
    g.addColorStop(1, "rgba(40, 2, 2, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blot(128, 110, 70, 0.9);
  for (let i = 0; i < 26; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const d = 30 + Math.random() * 80;
    blot(128 + Math.cos(a) * d, 110 + Math.sin(a) * d * 0.8, 6 + Math.random() * 22, 0.55 + Math.random() * 0.4);
  }
  if (drips) {
    ctx.strokeStyle = "rgba(60, 3, 2, 0.85)";
    for (let i = 0; i < 6; i += 1) {
      const x = 80 + Math.random() * 100;
      ctx.lineWidth = 3 + Math.random() * 4;
      ctx.beginPath();
      ctx.moveTo(x, 130);
      ctx.lineTo(x + (Math.random() - 0.5) * 6, 150 + Math.random() * 100);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ease = (x) => x * x * (3 - 2 * x);
const span = (t, from, to) => ease(Math.max(0, Math.min(1, (t - from) / (to - from))));

export class WakeScene {
  constructor(renderer, { width, height }) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(72, width / Math.max(1, height), 0.03, 40);
    this.scene.add(this.camera);
    this.disposables = [];
    this.t = 0;
    this.build();
  }

  own(thing) {
    this.disposables.push(thing);
    return thing;
  }

  build() {
    const scene = this.scene;
    const concrete = this.own(new THREE.MeshStandardMaterial({ color: 0x4a463e, roughness: 0.95 }));
    const stained = this.own(new THREE.MeshStandardMaterial({ color: 0x3a342b, roughness: 1 }));
    const bloodOn = (drips) =>
      this.own(new THREE.MeshStandardMaterial({ map: this.own(bloodTexture(drips)), transparent: true, roughness: 0.35, depthWrite: false }));
    const blood = bloodOn(false);
    const wallBlood = bloodOn(true);

    // A small concrete room. You are against the back wall (+z), facing -z.
    const floor = new THREE.Mesh(this.own(new THREE.PlaneGeometry(ROOM, ROOM)), stained);
    floor.rotation.x = -Math.PI / 2;
    const ceiling = new THREE.Mesh(this.own(new THREE.PlaneGeometry(ROOM, ROOM)), concrete);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = CEILING;
    scene.add(floor, ceiling);
    const wallGeo = this.own(new THREE.PlaneGeometry(ROOM, CEILING));
    for (const [x, z, ry] of [[0, -ROOM / 2, 0], [0, ROOM / 2, Math.PI], [-ROOM / 2, 0, Math.PI / 2], [ROOM / 2, 0, -Math.PI / 2]]) {
      const wall = new THREE.Mesh(wallGeo, concrete);
      wall.position.set(x, CEILING / 2, z);
      wall.rotation.y = ry;
      scene.add(wall);
    }
    // A shut metal door on the far wall, and blood: a smear on the left wall,
    // a pool by your legs, drag marks to the door.
    const door = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.9, 2.05, 0.06)), this.own(new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.6, metalness: 0.5 })));
    door.position.set(0.6, 1.03, -ROOM / 2 + 0.03);
    scene.add(door);
    const smear = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1.2, 1.2)), wallBlood);
    smear.position.set(-ROOM / 2 + 0.01, 1.1, -0.4);
    smear.rotation.y = Math.PI / 2;
    scene.add(smear);
    const pool = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1.3, 1.3)), blood);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0.25, 0.005, 1.1);
    scene.add(pool);
    for (let i = 0; i < 5; i += 1) {
      const mark = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.35, 0.6)), blood);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0.3 + (i - 2) * 0.07, 0.006, 0.2 - i * 0.45);
      scene.add(mark);
    }

    // Nothing lights the room but a sliver under the door, until the torch.
    const under = new THREE.PointLight(0x9fb4d8, 0.8, 3, 2);
    under.position.set(0.6, 0.05, -ROOM / 2 + 0.2);
    scene.add(under);
    this.ambient = new THREE.AmbientLight(0x1a1c22, 0.15);
    scene.add(this.ambient);
    this.torch = new THREE.SpotLight(0xfff1d6, 0, 12, 0.46, 0.45, 1.3);
    this.torch.position.set(0.12, -0.18, 0);
    this.torch.target.position.set(0, -0.5, -4);
    this.camera.add(this.torch, this.torch.target);

    // It, on the ceiling right over you: the whole model turned upside down
    // and hung from the ceiling, face toward the floor. Group rotation x = PI
    // maps (x, y, z) to (x, CEILING - y, -z), so its trail is laid out along
    // +z of its own world to run back toward the door in ours.
    this.monster = new Monster(scene);
    this.monster.setVisible(true);
    this.monster.group.rotation.x = Math.PI;
    this.monster.group.position.set(0, CEILING, 0);
    // Its head hangs just in front of your face (flipped frame z = -0.9 is
    // our z = +0.9); its body stretches away toward the door across the
    // ceiling (heading -PI/2 lays the trail out along the flipped +z).
    this.monsterZ = -0.9;
    this.monsterAngle = -Math.PI / 2;
    this.monster.place(0, this.monsterZ * 32, this.monsterAngle);
    this.rest = this.monster.group.position.clone();
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  // 0 shut .. 1 open, for the eyelids over the scene.
  eyes() {
    const t = this.t;
    if (t < WAKE.OPEN_1) return 0;
    if (t < WAKE.SHUT) return 0.45 * span(t, WAKE.OPEN_1, WAKE.OPEN_1 + 0.35) * (1 - span(t, WAKE.SHUT - 0.25, WAKE.SHUT));
    return span(t, WAKE.OPEN_2, WAKE.OPEN_2 + 0.6);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const B = WAKE;

    // Where you are looking: down at yourself, then left, right, back, and
    // slowly, slowly up.
    const left = span(t, B.LEFT, B.LEFT + 0.8) * (1 - span(t, B.RIGHT, B.RIGHT + 0.5));
    const right = span(t, B.RIGHT + 0.3, B.RIGHT + 1.0) * (1 - span(t, B.CENTRE, B.CENTRE + 0.6));
    const up = span(t, B.UP, B.SEEN);
    const yaw = left * 0.95 - right * 0.95;
    const groggy = t < B.TORCH ? Math.sin(t * 1.3) * 0.05 : 0;
    const pitch = -0.32 + span(t, B.OPEN_2, B.TORCH) * 0.26 + up * 1.35 + groggy;
    // Breathing, and a flinch when you see it.
    const breath = Math.sin(t * 2.4) * 0.012;
    const flinch = t > B.SEEN ? Math.min(1, (t - B.SEEN) * 4) * 0.12 : 0;
    this.camera.position.set(0.05, EYE + breath - flinch * 0.3, 1.45 + flinch * 0.1);
    this.camera.rotation.set(pitch, yaw, Math.sin(t * 0.7) * 0.03 * (1 - up), "YXZ");

    // The torch: a click, a stutter, then on.
    if (t >= B.TORCH) {
      const since = t - B.TORCH;
      const stutter = since < 0.35 ? (Math.sin(since * 70) > 0 ? 1 : 0.1) : 1;
      this.torch.intensity = 38 * stutter;
    }

    // It hangs there, twitching; then it drops onto you.
    const pounce = t >= B.POUNCE ? Math.min(1, (t - B.POUNCE) / (B.CUT - B.POUNCE)) : 0;
    this.monster.update({
      x: 0,
      y: this.monsterZ * 32,
      angle: this.monsterAngle,
      // Never "rearing": upside down, rearing would swing the head down
      // out of your sight line. The lunge below moves the whole body instead.
      charging: false,
      dt,
      time: t,
      intensity: t > B.SEEN ? 1.4 : 0.7,
    });
    // Face down at you, not the crown of its head: hung upside down, its
    // face has to point along its own +y, tipped back toward where you sit.
    this.monster.head.rotation.x = 1.2 + Math.sin(t * 9) * 0.04 + pounce * 0.1;
    if (pounce > 0) {
      // The whole body comes down at the camera, fast: measured once, from
      // where its head hung when it let go.
      if (!this.leap) {
        const head = this.monster.head.getWorldPosition(new THREE.Vector3());
        const target = this.camera.position.clone().add(new THREE.Vector3(0, 0.05, -0.2).applyEuler(this.camera.rotation));
        this.leap = target.sub(head);
      }
      // Stops just short of you, so its face fills the screen on the cut.
      this.monster.group.position.copy(this.rest).addScaledVector(this.leap, pounce * pounce * 0.85);
    }
    this.pounce = pounce;
  }

  get done() {
    return this.t >= WAKE.LENGTH;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.monster.dispose();
    this.scene.traverse((object) => {
      if (object.isMesh) object.geometry?.dispose?.();
    });
    for (const thing of this.disposables) thing.dispose();
  }
}
