// The way out of the bank, seen through your own eyes.
//
// You crawl out under the half-raised shutter and keep going: out into the
// street at night, towards the lights of the city. A second in you look back
// over your shoulder, and Motu Sir is standing under the shutter, lit by the
// tube lights behind him, shaking his fist and shouting about 9 AM sharp. He
// does not follow — he would have to crouch.
//
// Its own small scene, drawn with the game's renderer and its own camera; the
// player never gets control back. Everything is in metres. The street runs
// down -z, the shutter is at z = 0.

import * as THREE from "three";
import { Boss } from "./boss.js";
import { signTexture } from "./bank.js";

export const ESCAPE = {
  LENGTH: 10.5, // seconds, fade included
  THROUGH: 0.9, // out of the door
  LOOK_BACK: 0.95, // turn round the moment you are through the door
  LOOKING: 2, // how long you hold the look
  TURN: 0.7, // seconds to turn round (each way)
  FADE_AT: 8.6,
};

const SPEED = 6.2; // metres per second, running for your life
const EYE = 1.62;

// Lit windows, some warm, some cold, most dark: one texture shared by every
// building, offset per face so no two look alike.
function windowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, 256, 512);
  for (let y = 8; y < 512; y += 24) {
    for (let x = 8; x < 256; x += 20) {
      const r = Math.random();
      ctx.fillStyle = r < 0.22 ? "#f4c46a" : r < 0.32 ? "#bcd6ff" : r < 0.36 ? "#ffe9b0" : "#151922";
      ctx.fillRect(x, y, 12, 14);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class EscapeScene {
  constructor(renderer, { width, height }) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1c);
    this.scene.fog = new THREE.Fog(0x0a0f1c, 18, 95);
    this.camera = new THREE.PerspectiveCamera(74, width / Math.max(1, height), 0.05, 200);
    this.disposables = [];
    this.t = 0;
    this.build();
  }

  own(thing) {
    this.disposables.push(thing);
    return thing;
  }

  build() {
    const rng = random(0x51a7e);
    const scene = this.scene;
    const std = (color, extra = {}) => this.own(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));

    // Street: wet asphalt down the middle, pavements either side, a dashed line.
    const road = new THREE.Mesh(this.own(new THREE.PlaneGeometry(12, 220)), std(0x14161b, { roughness: 0.35, metalness: 0.2 }));
    road.rotation.x = -Math.PI / 2;
    road.position.z = -100;
    scene.add(road);
    for (const side of [-1, 1]) {
      const pavement = new THREE.Mesh(this.own(new THREE.BoxGeometry(4, 0.14, 220)), std(0x2b2c30));
      pavement.position.set(side * 8, 0.07, -100);
      scene.add(pavement);
    }
    const dashGeo = this.own(new THREE.PlaneGeometry(0.16, 2.2));
    const dashMat = this.own(new THREE.MeshBasicMaterial({ color: 0xd8c27a }));
    for (let z = -4; z > -210; z -= 6) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.012, z);
      scene.add(dash);
    }

    // Behind you: the branch. A blank wall, the shutter half up, and tube
    // light pouring out under it.
    const wallMat = std(0x3a3632);
    const wallLeft = new THREE.Mesh(this.own(new THREE.BoxGeometry(14, 9, 0.6)), wallMat);
    wallLeft.position.set(-7.6, 4.5, 0.3);
    const wallRight = wallLeft.clone();
    wallRight.position.x = 7.6;
    const lintel = new THREE.Mesh(this.own(new THREE.BoxGeometry(1.2, 6.6, 0.6)), wallMat);
    lintel.position.set(0, 2.4 + 3.3, 0.3);
    scene.add(wallLeft, wallRight, lintel);
    // Inside: cold tube light, bright through the opening.
    const inside = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1.2, 2.4)), this.own(new THREE.MeshBasicMaterial({ color: 0xe8f0f4, toneMapped: false })));
    inside.position.set(0, 1.2, 1.4);
    inside.rotation.y = Math.PI;
    scene.add(inside);
    const spill = new THREE.SpotLight(0xeef4ff, 40, 16, 0.55, 0.6, 1.3);
    spill.position.set(0, 2.1, 1.2);
    spill.target.position.set(0, 0, -6);
    scene.add(spill, spill.target);
    // The shutter, rolled half way up over the opening.
    const shutter = new THREE.Mesh(this.own(new THREE.BoxGeometry(1.3, 0.45, 0.06)), std(0x6c7a73, { metalness: 0.4, roughness: 0.6 }));
    shutter.position.set(0, 2.2, -0.05);
    scene.add(shutter);
    // And the bank's board over it.
    const board = this.own(signTexture(1024, 160, "#12306b", [["भारतीय जुगाड़ बैंक", 58, "#ffffff"], ["BHARATIYA JUGAAD BANK", 40, "#f2c14e"]]));
    const sign = new THREE.Mesh(this.own(new THREE.PlaneGeometry(6, 0.95)), this.own(new THREE.MeshBasicMaterial({ map: board, toneMapped: false })));
    sign.position.set(0, 3.5, -0.02);
    sign.rotation.y = Math.PI;
    scene.add(sign);

    // The city: blocks either side of the street, towers further off.
    const windows = this.own(windowTexture());
    const blockGeo = this.own(new THREE.BoxGeometry(1, 1, 1));
    for (const side of [-1, 1]) {
      let z = -6;
      while (z > -210) {
        const depth = 8 + rng() * 10;
        const width = 7 + rng() * 6;
        const height = 8 + rng() * (z < -60 ? 50 : 22);
        const map = windows.clone();
        map.needsUpdate = true;
        map.repeat.set(width / 8, height / 16);
        map.offset.set(rng(), rng());
        this.own(map);
        const material = this.own(
          new THREE.MeshStandardMaterial({ color: 0x1a1d24, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.9, roughness: 0.9 }),
        );
        const block = new THREE.Mesh(blockGeo, material);
        block.scale.set(width, height, depth);
        block.position.set(side * (10 + width / 2), height / 2, z - depth / 2);
        scene.add(block);
        z -= depth + 1 + rng() * 3;
      }
    }
    // A skyline at the end of the street, where you are running to.
    for (let i = 0; i < 16; i += 1) {
      const height = 30 + rng() * 70;
      const map = windows.clone();
      map.needsUpdate = true;
      map.repeat.set(1.5, height / 14);
      map.offset.set(rng(), rng());
      this.own(map);
      const tower = new THREE.Mesh(
        blockGeo,
        this.own(new THREE.MeshStandardMaterial({ color: 0x151821, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1, roughness: 1 })),
      );
      tower.scale.set(8 + rng() * 8, height, 8);
      tower.position.set(-60 + i * 8 + rng() * 4, height / 2, -190 - rng() * 20);
      scene.add(tower);
    }

    // Street lamps down both sides; the nearest few actually light the road.
    const poleMat = std(0x30343a, { metalness: 0.6, roughness: 0.4 });
    const poleGeo = this.own(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 8));
    const armGeo = this.own(new THREE.BoxGeometry(1.4, 0.08, 0.12));
    const glowMat = this.own(new THREE.MeshBasicMaterial({ color: 0xffdca0, toneMapped: false }));
    const glowGeo = this.own(new THREE.BoxGeometry(0.5, 0.1, 0.3));
    let lit = 0;
    for (let z = -8; z > -200; z -= 14) {
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(side * 6.4, 2.6, z);
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(side * 5.8, 5.15, z);
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(side * 5.3, 5.05, z);
        scene.add(pole, arm, glow);
        if (lit < 6 && side === (lit % 2 ? 1 : -1)) {
          const lamp = new THREE.PointLight(0xffd79a, 26, 22, 1.6);
          lamp.position.set(side * 5.3, 4.9, z);
          scene.add(lamp);
          lit += 1;
        }
      }
    }
    scene.add(new THREE.HemisphereLight(0x3a4a70, 0x0c0c10, 0.6));

    // Motu Sir, under the shutter, facing the street. He does not come out.
    const catchLight = new THREE.PointLight(0xb8c8ff, 6, 5, 1.6);
    catchLight.position.set(0.3, 1.9, -1.8);
    scene.add(catchLight);
    this.boss = new Boss(scene);
    this.boss.setMark(null);
    this.bossAt = { x: 0, z: 0.35 };
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  // Seconds the look back holds for, 0..1 of the way round.
  lookBackAmount(t) {
    const start = ESCAPE.LOOK_BACK;
    const hold = start + ESCAPE.TURN + ESCAPE.LOOKING;
    const ease = (x) => x * x * (3 - 2 * x);
    if (t < start) return 0;
    if (t < start + ESCAPE.TURN) return ease((t - start) / ESCAPE.TURN);
    if (t < hold) return 1;
    if (t < hold + ESCAPE.TURN) return 1 - ease((t - hold) / ESCAPE.TURN);
    return 0;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;

    // Out through the door, then straight down the middle of the street.
    // Slower while looking back: nobody runs flat out over their shoulder.
    const back = this.lookBackAmount(t);
    this.distance = (this.distance || 0) + dt * SPEED * (t < ESCAPE.THROUGH ? 0.85 : 1 - back * 0.3);
    const z = 1.2 - this.distance;
    // A running stride: bounce, sway, and a lean into it.
    const stride = t * 9.4;
    const bob = Math.abs(Math.sin(stride)) * 0.075;
    const sway = Math.sin(stride / 2) * 0.05;
    // Drifting toward the kerb and back, the way a panicked runner does.
    const x = Math.sin(t * 0.45) * 0.9 + sway;
    this.camera.position.set(x, EYE - 0.05 + bob, z);

    // Looking back over the right shoulder: turn most of the way round and
    // drop the gaze to the doorway.
    const yaw = -back * Math.PI * 0.92;
    const toDoor = Math.atan2(EYE - 1.35, Math.max(1, -z));
    const pitch = -0.04 - back * toDoor * 0.9 + Math.sin(stride) * 0.012;
    this.camera.rotation.set(pitch, yaw, Math.sin(stride / 2) * 0.02 * (1 - back), "YXZ");
    // The eye locks onto it: the view narrows while you are looking back.
    const fov = 74 - back * 36;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.stride = stride;

    // Shaking his fist: the wind-up of a slap, over and over.
    this.boss.update({
      x: this.bossAt.x * 32,
      y: this.bossAt.z * 32,
      angle: -Math.PI / 2,
      pose: "slap",
      slap: 0.25 + Math.abs(Math.sin(t * 5)) * 0.3,
      dt,
      time: t,
      angry: true,
    });
  }

  get looking() {
    return this.lookBackAmount(this.t) > 0.6;
  }

  get done() {
    return this.t >= ESCAPE.LENGTH;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.boss.dispose();
    this.scene.traverse((object) => {
      if (object.isMesh) object.geometry?.dispose?.();
    });
    for (const thing of this.disposables) thing.dispose();
  }
}
