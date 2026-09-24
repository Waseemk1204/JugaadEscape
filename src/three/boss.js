// Motu Sir, in the flesh. Considerable flesh.
//
// M. K. Motwani, Branch Manager: white half-shirt straining over the belly, a
// maroon tie that stops well short of the belt, brown trousers hitched high,
// a bald crown with a horseshoe of hair, square specs, and the moustache that
// has signed off on a thousand loans. Built from primitives like everything
// else — silhouette and a waddle sell him better than polygons would.
//
// Built facing +x; the game turns him. Poses: walk, stand, sit, phone, pee,
// slap, and for the cutscenes reachUp (the shutter), reach (doors) and point. A floating "?" or "!" over his head says what he is thinking, because
// a stealth game you cannot read is just a dice roll.

import * as THREE from "three";
import { U } from "../../shared/bank-map.js";

const SEAT_H = 0.5;

export class Boss {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.disposables = [];
    this.phase = 0;
    this.build();
    scene.add(this.root);
  }

  own(thing) {
    this.disposables.push(thing);
    return thing;
  }

  build() {
    const mat = (color, extra = {}) => this.own(new THREE.MeshLambertMaterial({ color, ...extra }));
    const shirt = mat(0xf4f4ee);
    const skin = mat(0x9c6a47);
    const trousers = mat(0x5b4633);
    const black = mat(0x151515);
    const tie = mat(0x6d1a24);
    const hairMat = mat(0x2a2522);
    const box = this.own(new THREE.BoxGeometry(1, 1, 1));
    const sph = this.own(new THREE.SphereGeometry(0.5, 18, 14));
    const cyl = this.own(new THREE.CylinderGeometry(0.5, 0.5, 1, 14));
    const mesh = (geo, material, [sx, sy, sz], [x, y, z] = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, material);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      return m;
    };

    // Hips pivot: everything above the legs hangs off this.
    this.hips = new THREE.Group();
    this.hips.position.y = 0.86;
    this.root.add(this.hips);

    // Legs. Pivot at the hip; the shin hangs off a knee pivot.
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(0, 0, side * 0.15);
      thigh.add(mesh(cyl, trousers, [0.24, 0.46, 0.24], [0, -0.23, 0]));
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      knee.add(mesh(cyl, trousers, [0.2, 0.42, 0.2], [0, -0.21, 0]));
      knee.add(mesh(box, black, [0.3, 0.1, 0.15], [0.06, -0.43, 0]));
      thigh.add(knee);
      this.hips.add(thigh);
      this.legs.push({ thigh, knee });
    }

    // Torso: belt, belly, chest, tie.
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.torso.add(mesh(cyl, trousers, [0.62, 0.16, 0.66], [0.02, 0.02, 0]));
    this.torso.add(mesh(cyl, black, [0.66, 0.05, 0.7], [0.03, 0.1, 0]));
    this.torso.add(mesh(box, mat(0xc9a64a), [0.04, 0.05, 0.08], [0.36, 0.1, 0]));
    this.belly = mesh(sph, shirt, [0.78, 0.66, 0.74], [0.1, 0.36, 0]);
    this.torso.add(this.belly);
    this.torso.add(mesh(cyl, shirt, [0.6, 0.4, 0.66], [0, 0.56, 0]));
    this.torso.add(mesh(sph, shirt, [0.58, 0.3, 0.72], [0, 0.72, 0]));
    // Buttons down the front of the belly, one of them losing the battle.
    for (let i = 0; i < 4; i += 1) {
      const a = -0.5 + i * 0.32;
      this.torso.add(mesh(sph, mat(0xdddddd), [0.025, 0.025, 0.025], [0.1 + Math.cos(a) * 0.39, 0.36 + Math.sin(a) * 0.32, 0]));
    }
    // Tie: from the collar, over the chest, and stopping far short.
    const tieMesh = mesh(box, tie, [0.02, 0.36, 0.09], [0.35, 0.62, 0]);
    tieMesh.rotation.z = 0.35;
    this.torso.add(tieMesh);
    this.torso.add(mesh(box, tie, [0.05, 0.07, 0.1], [0.28, 0.82, 0]));
    // A pen in the shirt pocket.
    this.torso.add(mesh(box, mat(0x1d3f8f), [0.015, 0.1, 0.015], [0.3, 0.72, 0.16]));

    // Arms.
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0, 0.72, side * 0.38);
      shoulder.add(mesh(sph, shirt, [0.2, 0.2, 0.2]));
      shoulder.add(mesh(cyl, shirt, [0.15, 0.24, 0.15], [0, -0.12, 0]));
      const elbow = new THREE.Group();
      elbow.position.y = -0.26;
      elbow.add(mesh(cyl, skin, [0.11, 0.3, 0.11], [0, -0.14, 0]));
      elbow.add(mesh(sph, skin, [0.13, 0.13, 0.13], [0, -0.31, 0]));
      shoulder.add(elbow);
      this.torso.add(shoulder);
      this.arms.push({ shoulder, elbow, side });
    }
    // A mobile phone, only shown while he is on the landline… no — it is the
    // landline receiver, cream and chunky, in his right hand.
    this.receiver = mesh(box, mat(0xe7dcc0), [0.05, 0.2, 0.06], [0.04, -0.32, 0]);
    this.receiver.visible = false;
    this.arms[1].elbow.add(this.receiver);

    // Head.
    this.neck = new THREE.Group();
    this.neck.position.set(0.04, 0.86, 0);
    this.torso.add(this.neck);
    this.neck.add(mesh(cyl, skin, [0.18, 0.1, 0.18], [0, 0.02, 0]));
    // A double chin, because of course.
    this.neck.add(mesh(sph, skin, [0.26, 0.12, 0.26], [0.06, 0.07, 0]));
    const head = new THREE.Group();
    head.position.y = 0.2;
    this.neck.add(head);
    this.head = head;
    head.add(mesh(sph, skin, [0.3, 0.32, 0.29]));
    // Horseshoe of hair round the back and sides; the top is bare and shiny.
    head.add(mesh(sph, hairMat, [0.3, 0.16, 0.31], [-0.03, -0.02, 0]));
    head.add(mesh(sph, mat(0xa87552, { emissive: 0x2a1a10 }), [0.26, 0.2, 0.25], [0.005, 0.07, 0]));
    // Ears
    for (const side of [-1, 1]) head.add(mesh(sph, skin, [0.05, 0.08, 0.04], [0, 0, side * 0.15]));
    // Face, looking down +x.
    head.add(mesh(sph, skin, [0.06, 0.07, 0.06], [0.15, -0.01, 0])); // nose
    this.moustache = mesh(box, hairMat, [0.03, 0.035, 0.15], [0.145, -0.06, 0]);
    head.add(this.moustache);
    this.mouth = mesh(box, mat(0x5a2a22), [0.01, 0.015, 0.06], [0.14, -0.1, 0]);
    head.add(this.mouth);
    this.brows = [];
    for (const side of [-1, 1]) {
      head.add(mesh(sph, black, [0.03, 0.03, 0.03], [0.138, 0.04, side * 0.055]));
      // Square specs.
      head.add(mesh(box, black, [0.01, 0.055, 0.075], [0.152, 0.04, side * 0.055]));
      const brow = mesh(box, hairMat, [0.015, 0.018, 0.07], [0.148, 0.085, side * 0.055]);
      head.add(brow);
      this.brows.push({ brow, side });
    }
    head.add(mesh(box, black, [0.01, 0.01, 0.03], [0.152, 0.05, 0]));

    // The thought over his head: ? when he suspects, ! when he knows.
    this.markTextures = {};
    for (const [key, color] of [["?", "#ffd23f"], ["!", "#ff3b30"], ["z", "#9ecbff"]]) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.font = "900 54px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#111";
      const glyph = key === "z" ? "☎" : key;
      ctx.strokeText(glyph, 32, 36);
      ctx.fillStyle = color;
      ctx.fillText(glyph, 32, 36);
      const t = this.own(new THREE.CanvasTexture(canvas));
      t.colorSpace = THREE.SRGBColorSpace;
      this.markTextures[key] = t;
    }
    this.markMat = this.own(new THREE.SpriteMaterial({ map: this.markTextures["?"], depthTest: false, transparent: true }));
    this.mark = new THREE.Sprite(this.markMat);
    this.mark.scale.set(0.34, 0.34, 1);
    this.mark.position.y = 2.15;
    this.mark.renderOrder = 10;
    this.mark.visible = false;
    this.root.add(this.mark);

    this.root.traverse((o) => {
      if (o.isMesh) o.frustumCulled = true;
    });
  }

  setVisible(visible) {
    this.root.visible = visible;
  }

  setMark(key) {
    if (!key) {
      this.mark.visible = false;
      return;
    }
    this.mark.visible = true;
    this.markMat.map = this.markTextures[key];
  }

  // x, y in map pixels; angle is the map-plane heading.
  place(x, y, angle) {
    this.root.position.set(x * U, 0, y * U);
    this.root.rotation.y = -angle;
  }

  // pose: walk | stand | sit | phone | pee | slap
  update({ x, y, angle, headTurn = 0, pose = "stand", moving = false, speed = 1, dt, time, angry = false, slap = 0, reach = 1 }) {
    this.place(x, y, angle);
    const legs = this.legs;
    const [armL, armR] = this.arms;

    // Reset toward neutral.
    this.hips.position.y = 0.86;
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    for (const { thigh, knee } of legs) {
      thigh.rotation.set(0, 0, 0);
      knee.rotation.set(0, 0, 0);
    }
    for (const arm of this.arms) {
      arm.shoulder.rotation.set(arm.side * -0.18, 0, 0);
      arm.elbow.rotation.set(0, 0, 0.25);
    }
    this.receiver.visible = false;
    this.head.rotation.set(0, -headTurn, 0);

    if (pose === "walk" && moving) {
      // The waddle: short strides, a roll from side to side, and a bounce the
      // belly takes a moment to follow.
      this.phase += dt * 6.2 * speed;
      const s = Math.sin(this.phase);
      legs[0].thigh.rotation.z = s * 0.42;
      legs[1].thigh.rotation.z = -s * 0.42;
      legs[0].knee.rotation.z = -Math.max(0, -s) * 0.6;
      legs[1].knee.rotation.z = -Math.max(0, s) * 0.6;
      armL.shoulder.rotation.z = -s * 0.35;
      armR.shoulder.rotation.z = s * 0.35;
      this.hips.rotation.x = s * 0.07;
      this.hips.position.y = 0.86 + Math.abs(Math.cos(this.phase)) * 0.035;
      this.belly.position.y = 0.36 - Math.abs(Math.cos(this.phase - 0.5)) * 0.02;
    } else if (pose === "sit" || pose === "phone") {
      this.hips.position.y = SEAT_H + 0.08;
      for (const { thigh, knee } of legs) {
        thigh.rotation.z = Math.PI / 2;
        knee.rotation.z = -Math.PI / 2;
      }
      this.torso.rotation.z = -0.08; // leaning back, as is his right
      // Hands on the desk in front of him.
      armL.shoulder.rotation.z = 0.9;
      armR.shoulder.rotation.z = 0.9;
      armL.elbow.rotation.z = 0.6;
      armR.elbow.rotation.z = 0.6;
      if (pose === "phone") {
        armR.shoulder.rotation.set(-0.3, 0, 0.5);
        armR.elbow.rotation.set(0, 0, 2.5);
        this.receiver.visible = true;
        this.head.rotation.z = -0.25; // looking down at the desk
        this.torso.rotation.z = 0.05;
      }
    } else if (pose === "pee") {
      armL.shoulder.rotation.z = 0.55;
      armR.shoulder.rotation.z = 0.55;
      armL.elbow.rotation.z = 0.5;
      armR.elbow.rotation.z = 0.5;
      this.torso.rotation.z = -0.1;
      this.head.rotation.z = 0.15 + Math.sin(time * 0.7) * 0.05; // gazing at the ceiling
    } else if (pose === "slap") {
      // Wind up out to the side, then a flat swing across.
      const s = Math.min(1, slap);
      if (s < 0.6) {
        const k = s / 0.6;
        armR.shoulder.rotation.set(-1.9 * k, 0, 0.4 * k);
        armR.elbow.rotation.z = 0.5 * k;
        this.torso.rotation.y = 0.35 * k;
      } else {
        const k = Math.min(1, (s - 0.6) / 0.15);
        armR.shoulder.rotation.set(-1.9 + 2.2 * k, 0, 0.4 + 1.1 * k);
        armR.elbow.rotation.z = 0.5 - 0.4 * k;
        this.torso.rotation.y = 0.35 - 0.7 * k;
      }
    } else if (pose === "reachUp") {
      // Both hands up on the shutter's bottom bar, dragging it down: `reach`
      // runs 1 (arms overhead) to 0 (arms down at the floor).
      const lift = 0.6 + reach * 2.2;
      armL.shoulder.rotation.z = lift;
      armR.shoulder.rotation.z = lift;
      armL.elbow.rotation.z = 0.1;
      armR.elbow.rotation.z = 0.1;
      this.torso.rotation.z = reach < 0.3 ? (0.3 - reach) * 1.2 : 0; // bending to the floor lock
    } else if (pose === "reach") {
      // Both hands out in front: pulling a gate, slamming a door.
      armL.shoulder.rotation.z = 1.35;
      armR.shoulder.rotation.z = 1.35;
      armL.elbow.rotation.z = 0.25;
      armR.elbow.rotation.z = 0.25;
      this.torso.rotation.z = 0.08;
    } else if (pose === "point") {
      // Left hand on hip, right finger jabbing at you.
      armL.shoulder.rotation.set(0.5, 0, 0.1);
      armL.elbow.rotation.set(-1.6, 0, 0);
      armR.shoulder.rotation.set(0, 0, 1.45 + Math.sin(time * 9) * 0.08);
      armR.elbow.rotation.z = 0.05;
    } else {
      // Standing: hands on hips when he means business.
      armL.shoulder.rotation.set(0.5, 0, 0.1);
      armR.shoulder.rotation.set(-0.5, 0, 0.1);
      armL.elbow.rotation.set(-1.6, 0, 0);
      armR.elbow.rotation.set(1.6, 0, 0);
      this.hips.rotation.x = Math.sin(time * 1.3) * 0.015;
    }

    // Breathing, always.
    const breath = 1 + Math.sin(time * 2.1) * 0.015;
    this.belly.scale.set(0.78 * breath, 0.66, 0.74 * breath);

    // Brows down when he is cross.
    for (const { brow, side } of this.brows) brow.rotation.x = angry ? side * 0.5 : 0;
    this.mouth.scale.y = angry ? 0.035 + Math.abs(Math.sin(time * 14)) * 0.03 : 0.015;
    this.mark.position.y = (pose === "sit" || pose === "phone" ? 1.8 : 2.15) + Math.sin(time * 4) * 0.03;
  }

  dispose() {
    this.scene.remove(this.root);
    for (const thing of this.disposables) thing.dispose();
  }
}
