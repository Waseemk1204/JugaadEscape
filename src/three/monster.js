// The visible half of the thing in the Lobby.
//
// It is built here rather than downloaded. The whole project ships as text —
// no binary assets, one vendored library — and a rigged horror model would drag
// in a licence, a loader, and several megabytes onto a free host for something
// the player sees for four seconds at a time in near darkness. What actually
// sells a monster at that distance is silhouette, proportion and motion, and
// those are cheap.
//
// So: a face drawn pixel by pixel onto a canvas, a curtain of hair that moves a
// beat behind the skull, and a long body that drags itself along the floor
// behind the head instead of walking. It crawls low while it is wandering and
// rears up when it comes for you.

import * as THREE from "three";
import { U } from "../../shared/lobby.js";

const SEGMENTS = 10;
const SEG_SPACING = 0.32; // metres between body segments
const TRAIL_SAMPLES = 300;
const FLOOR = 0.15; // how high off the carpet the body lies

// Crawling height versus reared-up height, in metres. Reared, the head clears
// a standing person's eyeline — which is the moment you want to be running.
const HEAD_LOW = 0.46;
const HEAD_HIGH = 1.62;
// How many segments behind the head carry any of that lift. Past this the body
// is simply lying on the floor, which is what makes it read as dragged rather
// than walked.
const NECK = 3;

// ------------------------------------------------------------------ the face

// Drawn once at 128px and filtered to nearest, so it stays sharp and slightly
// wrong rather than softening into a smudge.
//
// Exported because the same canvas is thrown at the whole screen when you die:
// the face you have been catching glimpses of at the end of a corridor, at
// four hundred times the size, for half a second.
export function createFaceCanvas(pixels = 128) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext("2d");
  // Everything below is written in 128-space; the transform is what lets the
  // same drawing serve a 128px texture on the model and a screen-filling one
  // when it takes you.
  ctx.scale(pixels / size, pixels / size);

  // Skin: bloodless, blotched, faintly green in the hollows.
  ctx.fillStyle = "#b9b2a6";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(${90 + Math.random() * 40},${84 + Math.random() * 40},${76 + Math.random() * 30},${Math.random() * 0.3})`;
    ctx.fillRect(x, y, 2, 2);
  }
  // Sunken temples and cheeks.
  const hollow = ctx.createRadialGradient(size / 2, size * 0.52, size * 0.1, size / 2, size * 0.52, size * 0.62);
  hollow.addColorStop(0, "rgba(0,0,0,0)");
  hollow.addColorStop(1, "rgba(24,20,18,0.85)");
  ctx.fillStyle = hollow;
  ctx.fillRect(0, 0, size, size);

  // Where the eyes should be: nothing. Two holes bored into the skull, with
  // no shine and nothing looking back out of them.
  //
  // Eyes give a face a direction, and a direction is information — you can
  // tell whether it has clocked you. Taking them away leaves a head that is
  // clearly pointed at you and gives you no way to know what it has noticed,
  // which is worse in every way that matters.
  const socket = (cx, cy, rx, ry) => {
    ctx.fillStyle = "#070506";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // A soft bruise around the rim so the hole reads as sunken rather than
    // painted on.
    const bruise = ctx.createRadialGradient(cx, cy, rx * 0.8, cx, cy, rx * 2.1);
    bruise.addColorStop(0, "rgba(22,14,16,0.9)");
    bruise.addColorStop(1, "rgba(22,14,16,0)");
    ctx.fillStyle = bruise;
    ctx.beginPath();
    ctx.arc(cx, cy, rx * 2.1, 0, Math.PI * 2);
    ctx.fill();
    // The hole again on top, so the gradient does not wash it out.
    ctx.fillStyle = "#050304";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  // Not a matching pair: one sits lower and wider than the other.
  socket(42, 52, 14, 17);
  socket(87, 54, 16, 18.5);

  // The grin: too wide for the face, teeth drawn as gaps in the dark.
  ctx.fillStyle = "#120d0d";
  ctx.beginPath();
  ctx.moveTo(24, 84);
  ctx.quadraticCurveTo(64, 78, 104, 84);
  ctx.quadraticCurveTo(64, 116, 24, 84);
  ctx.fill();
  ctx.fillStyle = "#cdc6b4";
  for (let i = 0; i < 11; i += 1) {
    const x = 27 + i * 7.2;
    const top = 84 + Math.sin(i * 1.7) * 1.5;
    const h = 5 + Math.random() * 5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + 5, top);
    ctx.lineTo(x + 2.5, top + h);
    ctx.fill();
  }
  // Shadow under the jaw so the bottom of the face falls away into the dark
  // rather than ending in a flat pale chin.
  const jaw = ctx.createLinearGradient(0, 96, 0, size);
  jaw.addColorStop(0, "rgba(18,14,13,0)");
  jaw.addColorStop(1, "rgba(14,11,10,0.92)");
  ctx.fillStyle = jaw;
  ctx.fillRect(0, 96, size, size - 96);

  // Creases running from the corners of the mouth up past the eyes.
  ctx.strokeStyle = "rgba(30,22,20,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 84);
  ctx.lineTo(14, 44);
  ctx.moveTo(104, 84);
  ctx.lineTo(114, 44);
  ctx.stroke();

  return canvas;
}

// The whole head, for the moment it fills the screen.
//
// The model's 128px face texture alone is not this: blown up to fill a display
// it is a couple of enormous soft shapes with no silhouette around them, which
// is why the flash read as an abstract smear rather than a face. This composes
// the face inside its curtain of hair, at eight times the resolution, on
// black — so what lands on screen is recognisably the thing you have been
// catching glimpses of down corridors.
export function createScareCanvas(pixels = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext("2d");
  const u = pixels / 100; // work in percentages of the frame

  ctx.fillStyle = "#030304";
  ctx.fillRect(0, 0, pixels, pixels);

  // The curtain: a shade lighter than the background, so the head has an
  // outline. Pure black on pure black is invisible, and without a silhouette
  // the face reads as something floating in a void rather than as a head.
  ctx.fillStyle = "#0d0b11";
  ctx.beginPath();
  ctx.moveTo(-2 * u, 108 * u);
  ctx.lineTo(2 * u, 26 * u);
  ctx.quadraticCurveTo(50 * u, -24 * u, 98 * u, 26 * u);
  ctx.lineTo(102 * u, 108 * u);
  ctx.closePath();
  ctx.fill();
  // Strands breaking the outline, so it is hair and not a hood.
  for (let i = 0; i < 34; i += 1) {
    const x = -2 * u + (i / 33) * 104 * u;
    const w = (1.4 + Math.random() * 3) * u;
    const top = (18 + Math.random() * 30) * u;
    ctx.fillStyle = i % 3 ? "#0d0b11" : "#090810";
    ctx.fillRect(x, top, w, pixels - top);
  }

  // The face, filling most of the frame. It is the only thing anyone is going
  // to register in half a second, so it gets the room.
  const face = createFaceCanvas(1024);
  const inset = 13 * u;
  // Centred vertically in the square, so the head sits in the middle of the
  // screen rather than riding high with a band of black under its chin.
  ctx.drawImage(face, inset, inset, pixels - inset * 2, pixels - inset * 2);

  // A light vignette — enough to soften the corners into the hair, not enough
  // to swallow the face.
  const vignette = ctx.createRadialGradient(50 * u, 50 * u, 34 * u, 50 * u, 50 * u, 82 * u);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, pixels, pixels);

  return canvas;
}

function createFaceTexture() {
  const texture = new THREE.CanvasTexture(createFaceCanvas());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

// ------------------------------------------------------------------- the body

export class Monster {
  constructor(scene, { scale = 1 } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.scale.setScalar(scale);
    this.trail = [];
    this.rear = 0; // 0 crawling, 1 reared up
    this.build();
    this.group.visible = false;
    scene.add(this.group);
  }

  build() {
    const skin = new THREE.MeshPhongMaterial({ color: 0x9d968a, shininess: 0, specular: 0x000000 });
    // The hair is unlit and near-black so it stays a hole in the world however
    // the torch falls on it.
    const hair = new THREE.MeshBasicMaterial({ color: 0x090708, toneMapped: false, side: THREE.DoubleSide });
    this.faceTexture = createFaceTexture();
    const face = new THREE.MeshPhongMaterial({ map: this.faceTexture, shininess: 0, specular: 0x000000 });

    // ---- head. Box faces are ordered +x, -x, +y, -y, +z, -z; the model looks
    // down -z, so the face goes on the last one.
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.46), [skin, skin, skin, skin, skin, face]);
    this.head.add(skull);

    // ---- hair: flat panels hanging from the crown, longer at the back. Each
    // one sways on its own clock so the curtain never moves as a single sheet.
    this.hairStrands = [];
    const strand = (x, z, length, width) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), hair);
      // The pivot is the top edge, so it hangs rather than floating.
      mesh.geometry.translate(0, -length / 2, 0);
      mesh.position.set(x, 0.3, z);
      this.head.add(mesh);
      this.hairStrands.push({ mesh, phase: Math.random() * 6.28 });
      return mesh;
    };
    // The fringe hangs at the sides of the face and stops above the eyes. It
    // has to part: a curtain across the whole skull hides the one thing on this
    // model worth seeing, and all you get is a black rectangle with arms.
    for (const t of [-0.24, -0.17, 0.17, 0.24]) {
      strand(t, -0.255, 0.3 + Math.random() * 0.12, 0.16);
    }
    // A few short wisps that do cross the face, so it is framed rather than
    // cleanly exposed.
    for (const t of [-0.08, 0.06]) {
      strand(t, -0.255, 0.16 + Math.random() * 0.1, 0.05);
    }
    // The long curtain down its back, which is most of the silhouette.
    for (let i = 0; i < 9; i += 1) {
      const t = (i / 8 - 0.5) * 0.5;
      strand(t, 0.24, 1.15 + Math.random() * 0.45, 0.19);
    }
    for (const z of [-0.12, 0.04, 0.18]) {
      strand(-0.26, z, 0.85 + Math.random() * 0.35, 0.17);
      strand(0.26, z, 0.85 + Math.random() * 0.35, 0.17);
    }
    // The crown, or the top face of the skull catches the ceiling panels and
    // reads as a pale flat cap sitting on its head.
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.52), hair);
    crown.position.y = 0.3;
    this.head.add(crown);

    this.group.add(this.head);

    // ---- body: a chain that drags behind the head instead of walking.
    this.segments = [];
    const segGeometry = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < SEGMENTS; i += 1) {
      const taper = 1 - (i / SEGMENTS) * 0.6;
      const mesh = new THREE.Mesh(segGeometry, skin);
      mesh.scale.set(0.34 * taper, 0.24 * taper, 0.4 * taper);
      this.group.add(mesh);
      this.segments.push(mesh);
    }

    // ---- arms: long, thin, reaching ahead of the head like something pulling
    // itself forward.
    this.arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.4), skin);
      upper.position.z = -0.2;
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.38), skin);
      fore.position.z = -0.57;
      arm.add(upper, fore);
      for (let f = 0; f < 3; f += 1) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.13), skin);
        finger.position.set((f - 1) * 0.038, 0, -0.81);
        finger.rotation.x = 0.25;
        arm.add(finger);
      }
      arm.position.set(side * 0.19, 0, 0);
      this.group.add(arm);
      this.arms.push({ arm, side });
    }
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  // `x`/`y` are in map pixels, `angle` its heading, `charging` whether it is
  // coming for the player. `intensity` scales how violently it moves.
  // Drop it somewhere with its body already laid out behind it, rather than
  // letting the trail stretch from wherever it used to be.
  place(x, y, angle) {
    const wx = x * U;
    const wz = y * U;
    this.trail.length = 0;
    for (let i = 0; i < 80; i += 1) {
      const back = i * 0.05;
      this.trail.push({ x: wx - Math.cos(angle) * back, z: wz - Math.sin(angle) * back });
    }
  }

  update({ x, y, angle, charging, dt, time, intensity = 1 }) {
    const wx = x * U;
    const wz = y * U;

    // Trail: every frame, remember where the head was. The body samples it.
    const last = this.trail[0];
    const step = last ? Math.hypot(last.x - wx, last.z - wz) : Infinity;
    // A jump this big is a teleport, not a stride.
    if (step > 2) this.place(x, y, angle);
    else if (step > 0.05) {
      this.trail.unshift({ x: wx, z: wz });
      if (this.trail.length > TRAIL_SAMPLES) this.trail.pop();
    }

    // It rears up to charge and flattens to the floor to prowl.
    const rearTarget = charging ? 1 : 0;
    this.rear += (rearTarget - this.rear) * Math.min(1, dt * 3.2);
    const headY = HEAD_LOW + (HEAD_HIGH - HEAD_LOW) * this.rear;

    // A fast, shallow twitch on top of a slow sway: the head never settles.
    const twitch = Math.sin(time * 11 + Math.sin(time * 3.1) * 2) * 0.035 * intensity;
    this.head.position.set(wx, headY + twitch, wz);
    this.head.rotation.set(0, -angle - Math.PI / 2, 0, "YXZ");
    // Tilted forward while crawling so the face looks up at you from the floor,
    // and levelled off as it rises.
    this.head.rotation.x = (1 - this.rear) * -0.55 + Math.sin(time * 0.8) * 0.05;
    this.head.rotation.z = Math.sin(time * 1.7) * 0.12 * intensity;

    for (const { mesh, phase } of this.hairStrands) {
      // The hair lags the skull and keeps moving after it stops. Small angles:
      // the curtain has to stay closed or it reads as a handful of dark blades.
      mesh.rotation.x = Math.sin(time * 2.4 + phase) * 0.06 + this.rear * 0.06;
      mesh.rotation.z = Math.sin(time * 1.9 + phase * 1.3) * 0.07;
      mesh.scale.y = 1 + Math.sin(time * 1.1 + phase) * 0.04;
    }

    this.placeSegments(headY, time, intensity);
    this.placeArms(time, intensity);
  }

  // Walk back along the trail, dropping a segment every SEG_SPACING metres.
  placeSegments(headY, time, intensity) {
    let travelled = 0;
    let index = 0;
    let next = SEG_SPACING;
    let previous = this.trail[0];
    if (!previous) return;

    for (let s = 0; s < this.segments.length; s += 1) {
      while (index < this.trail.length - 1 && travelled < next) {
        const a = this.trail[index];
        const b = this.trail[index + 1];
        travelled += Math.hypot(b.x - a.x, b.z - a.z);
        previous = b;
        index += 1;
      }
      const segment = this.segments[s];
      // Only the first few segments carry any of the head's lift — past the
      // neck the body is simply lying on the carpet being dragged along, which
      // is the whole silhouette. Letting the lift decay over the full length
      // instead stacks the segments into a column under the head.
      const lift = Math.max(0, 1 - s / NECK);
      segment.position.set(
        previous.x,
        FLOOR + (headY - HEAD_LOW) * lift * 0.62 + Math.sin(time * 6 - s * 0.9) * 0.018 * intensity,
        previous.z,
      );
      // Each segment faces the one in front of it.
      const ahead = s === 0 ? this.trail[0] : this.segments[s - 1].position;
      segment.rotation.y = Math.atan2(ahead.x - previous.x, ahead.z - previous.z);
      next += SEG_SPACING;
    }
  }

  placeArms(time, intensity) {
    for (const { arm, side } of this.arms) {
      const head = this.head.position;
      // They hang from the shoulders, below and behind the skull, and reach
      // along the floor — this thing pulls itself rather than walking.
      arm.position.set(
        head.x + Math.sin(this.head.rotation.y) * 0.1,
        Math.max(0.18, head.y - 0.86),
        head.z + Math.cos(this.head.rotation.y) * 0.1,
      );
      arm.rotation.order = "YXZ";
      // Alternating, and out of time with each other.
      const reach = Math.sin(time * 3.6 + (side > 0 ? Math.PI : 0)) * 0.5 * intensity;
      arm.rotation.y = this.head.rotation.y + side * (0.5 + reach * 0.16);
      // Angled down at the carpet, not held out in front like a sleepwalker.
      arm.rotation.x = 0.34 + reach * 0.22 - this.rear * 0.5;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      if (object.isMesh) object.geometry.dispose();
    });
    this.faceTexture.dispose();
  }
}
