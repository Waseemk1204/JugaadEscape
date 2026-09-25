// The happy ending, in three scenes.
//
//   1. The street. You crawl out under the half-raised shutter onto a busy
//      road at night — the branch's own front, its blue board and the ATM
//      glowing, shops and a chai tapri across the road, autos going both
//      ways. You flag one down, climb in, and look back: Motu Sir is under the
//      shutter, shaking his fist and promising to deal with you tomorrow.
//      "Kal milenge toh na!" The auto pulls away into the traffic.
//   2. Home. Your room: the fan, the lamp, the bed. The tie comes off.
//   3. The phone. You tell Motu Sir the resignation is on his desk, he starts
//      typing in capitals, you block him — and lie back with a sigh.
//
// A self-contained scene with its own three.js world and camera, drawn with
// the game's renderer. It runs as a cinematic (game.startCinematic) and owns
// its rendering. The phone is HTML over the top (#end-phone).

import * as THREE from "three";
import { Boss } from "./boss.js";
import { signTexture } from "./bank.js";

const HOME_X = 300; // the bedroom is built far off, out of sight of the street
const SIGNS = [
  ["शर्मा स्वीट्स", "SHARMA SWEETS", "#b3261e"],
  ["SAI MOBILE", "REPAIR · RECHARGE", "#1f4f8f"],
  ["गुप्ता जनरल स्टोर", "GUPTA GENERAL STORE", "#2f7a3a"],
  ["PHOTOCOPY", "XEROX · LAMINATION", "#e8742a"],
  ["श्री मेडिकल", "SHREE MEDICAL · 24 HRS", "#0f7b6c"],
  ["RAM BHAROSE", "HINDU HOTEL", "#8a2be2"],
  ["BHARAT", "TAILORS & DRAPERS", "#6d1a24"],
  ["LUCKY", "TOURS & TRAVELS", "#c9a13b"],
  ["JAIN", "HARDWARE & PAINTS", "#12306b"],
  ["पान भंडार", "PAAN BHANDAR", "#1f7a3a"],
];

function canvasTexture(w, h, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (v) => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};
const wrapAngle = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export class EndingScene {
  constructor(game) {
    this.game = game;
    this.renderer = game.renderer;
    this.audio = game.audio;
    this.ownsRender = true;
    this.disposables = [];
    this.loops = [];
    this.t = 0;
    this.done = false;
    this.fade = 1;
    this.fadeTo = 0;
    this.fadeRate = 1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1e);
    this.scene.fog = new THREE.Fog(0x0e1224, 25, 90);
    this.camera = new THREE.PerspectiveCamera(70, game.width / Math.max(1, game.height), 0.05, 200);
    this.eye = { x: 0, y: 0.55, z: 0.7, yaw: 0, pitch: -0.05, roll: 0 };
    this.eyeTo = { ...this.eye };
    this.eyeRate = 3;
    this.box = this.own(new THREE.BoxGeometry(1, 1, 1));
    this.cyl = this.own(new THREE.CylinderGeometry(0.5, 0.5, 1, 16));
    this.sph = this.own(new THREE.SphereGeometry(0.5, 14, 10));
    this.mats = new Map();

    this.buildStreet();
    this.traffic = this.buildTraffic();
    this.hero = this.buildAuto(0xf2c200, true);
    this.hero.position.set(40, 0, -6.4);
    this.scene.add(this.hero);
    this.heroSpeed = 0;
    this.buildHome();

    this.boss = new Boss(this.scene);
    this.boss.setMark(null);

    this.phone = this.phoneDom();
    this.startStreetSound();
    this.gen = this.script();
    this.waiting = () => true;
  }

  own(thing) {
    this.disposables.push(thing);
    return thing;
  }

  mat(color, extra = {}) {
    const key = `${color}|${JSON.stringify(extra)}`;
    if (!this.mats.has(key)) this.mats.set(key, this.own(new THREE.MeshLambertMaterial({ color, ...extra })));
    return this.mats.get(key);
  }

  part(material, [sx, sy, sz], [x, y, z], parent = this.scene, geo = this.box, rot = null) {
    const m = new THREE.Mesh(geo, material);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    return m;
  }

  sign(texture, w, h, x, y, z, rotY = 0, parent = this.scene, emissive = false) {
    const material = this.own(emissive ? new THREE.MeshBasicMaterial({ map: this.own(texture) }) : new THREE.MeshLambertMaterial({ map: this.own(texture) }));
    const m = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, h)), material);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    parent.add(m);
    return m;
  }

  // ------------------------------------------------------------- the street

  buildStreet() {
    const r = rng(0x1d1a);
    const s = this.scene;

    // Sky with a city glow on the horizon, and a moon.
    const sky = this.own(canvasTexture(16, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#05081a");
      g.addColorStop(0.6, "#1a1d3f");
      g.addColorStop(1, "#5a3a4a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }));
    const dome = new THREE.Mesh(this.own(new THREE.SphereGeometry(150, 24, 12)), this.own(new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false })));
    s.add(dome);
    this.part(this.own(new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false })), [5, 5, 5], [-40, 45, -110], s, this.sph);

    // Road, kerbs painted black-and-yellow, pavements.
    this.part(this.mat(0x1c1d21), [200, 0.02, 9], [0, 0, -8]);
    const kerbTex = this.own(canvasTexture(64, 8, (ctx) => {
      for (let i = 0; i < 8; i += 1) {
        ctx.fillStyle = i % 2 ? "#111" : "#f2c200";
        ctx.fillRect(i * 8, 0, 8, 8);
      }
    }));
    kerbTex.wrapS = THREE.RepeatWrapping;
    kerbTex.repeat.set(100, 1);
    const kerb = this.own(new THREE.MeshLambertMaterial({ map: kerbTex }));
    this.part(kerb, [200, 0.18, 0.25], [0, 0.09, -3.6]);
    this.part(kerb, [200, 0.18, 0.25], [0, 0.09, -12.4]);
    this.part(this.mat(0x55524c), [200, 0.16, 3.5], [0, 0.08, -1.8]);
    this.part(this.mat(0x55524c), [200, 0.16, 3], [0, 0.08, -14]);
    for (let x = -96; x < 100; x += 6) this.part(this.mat(0xe8e2c8), [2.4, 0.03, 0.14], [x, 0.02, -8]);

    // The branch itself: the same cream and institutional green as inside,
    // an upper floor with barred windows, the board, the ATM.
    const wall = this.mat(0xe0d4b4);
    const dado = this.mat(0x7f987f);
    this.part(wall, [7.6, 3.4, 0.6], [-6.8, 1.7, 0.3]);
    this.part(wall, [7.6, 3.4, 0.6], [6.8, 1.7, 0.3]);
    this.part(dado, [7.62, 1, 0.62], [-6.8, 0.5, 0.3]);
    this.part(dado, [7.62, 1, 0.62], [6.8, 0.5, 0.3]);
    this.part(wall, [21.2, 4.2, 0.6], [0, 5.5, 0.3]);
    this.part(this.mat(0xc9bb96), [21.4, 0.2, 1], [0, 3.45, 0.1]);
    for (const x of [-7, -2.4, 2.4, 7]) {
      this.part(this.mat(0x1b2230, { emissive: 0x0c1220 }), [1.6, 1.4, 0.05], [x, 5.6, -0.02]);
      for (let i = 0; i < 5; i += 1) this.part(this.mat(0x2a2d31), [0.03, 1.4, 0.03], [x - 0.6 + i * 0.3, 5.6, -0.06]);
      // Window ACs on the outer windows; the banner covers the middle two.
      if (Math.abs(x) > 5) this.part(this.mat(0xdddddd), [0.8, 0.45, 0.4], [x + 0.45, 4.7, -0.2]);
    }
    // Inside, bright tube light; the shutter half up; the lintel.
    this.part(this.own(new THREE.MeshBasicMaterial({ color: 0xe8f0f4 })), [6, 2.9, 0.05], [0, 1.45, 1.6]);
    this.part(this.mat(0xc9bfa6), [6, 0.55, 0.6], [0, 3.15, 0.3]);
    const shutterTex = this.own(canvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = "#6c7a73";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 6) {
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(0, y, w, 2);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(0, y + 4, w, 2);
      }
    }));
    shutterTex.wrapS = shutterTex.wrapT = THREE.RepeatWrapping;
    shutterTex.repeat.set(4, 1);
    // Up to his chest height: he heaved it higher to come and shout.
    this.part(this.own(new THREE.MeshLambertMaterial({ map: shutterTex })), [6, 0.85, 0.06], [0, 2.47, 0.02]);
    const spill = new THREE.SpotLight(0xeef4ff, 30, 12, 0.9, 0.6, 1.4);
    spill.position.set(0, 0.8, 1.2);
    spill.target.position.set(0, 0, -4);
    s.add(spill, spill.target);
    // The board, lit from below by two little lamps.
    this.sign(signTexture(1024, 160, "#12306b", [["भारतीय जुगाड़ बैंक", 58, "#ffffff"], ["BHARATIYA JUGAAD BANK · MAIN BRANCH", 36, "#f2c14e"]]), 9.5, 1.5, 0, 4.1, -0.05, Math.PI, s, true);
    this.dressBank();

    // The ATM kiosk, next door, glowing.
    this.part(this.mat(0xe0492b, { emissive: 0x5a1208 }), [2.6, 3, 2], [5, 1.5, -1.2]);
    this.part(this.own(new THREE.MeshBasicMaterial({ color: 0xfff6e6 })), [1.6, 2.2, 0.05], [5, 1.3, -2.21]);
    this.sign(signTexture(256, 96, "#e0492b", [["ATM · 24x7", 40, "#fff"]]), 2.2, 0.6, 5, 2.75, -2.23, Math.PI, s, true);
    const atmLight = new THREE.PointLight(0xffe6d0, 6, 8, 1.5);
    atmLight.position.set(5, 2, -3);
    s.add(atmLight);
    // A plastic chair for the guard who went home hours ago; a sleeping dog.
    this.part(this.mat(0x2b6fb6), [0.45, 0.05, 0.45], [-2.8, 0.55, -1.2]);
    this.part(this.mat(0x2b6fb6), [0.45, 0.45, 0.05], [-2.8, 0.8, -0.98]);
    this.part(this.mat(0x9a7450), [0.7, 0.3, 0.32], [-4.2, 0.3, -2.2]);
    this.part(this.mat(0x9a7450), [0.25, 0.22, 0.24], [-3.8, 0.34, -2.35]);

    // The rest of the street: shopfronts both sides, some shut for the night,
    // some still lit and busy.
    this.shopRow(3.0, Math.PI, r, [-96, -11], true);
    this.shopRow(3.0, Math.PI, r, [11, 96], true);
    this.shopRow(-16.6, 0, r, [-96, 96], false);

    // Street lamps: sodium orange. Electric poles with the obligatory tangle.
    let lit = 0;
    for (let x = -52.5; x <= 60; x += 15) {
      for (const z of [-3.3, -12.8]) {
        this.part(this.mat(0x3a3d42), [0.12, 6, 0.12], [x + (z < -5 ? 7 : 0), 3, z], s, this.cyl);
        this.part(this.mat(0x3a3d42), [0.1, 0.1, 1.4], [x + (z < -5 ? 7 : 0), 6, z + (z < -5 ? 0.7 : -0.7)]);
        this.part(this.own(new THREE.MeshBasicMaterial({ color: 0xffb35c })), [0.4, 0.12, 0.25], [x + (z < -5 ? 7 : 0), 5.92, z + (z < -5 ? 1.3 : -1.3)]);
        if (lit < 6 && Math.abs(x) <= 30) {
          const lamp = new THREE.PointLight(0xffa64d, 16, 18, 1.4);
          lamp.position.set(x + (z < -5 ? 7 : 0), 5.6, z + (z < -5 ? 1.3 : -1.3));
          s.add(lamp);
          lit += 1;
        }
      }
    }
    const wireMat = this.own(new THREE.LineBasicMaterial({ color: 0x111111 }));
    for (let i = 0; i < 7; i += 1) {
      const pts = [];
      const y0 = 5.4 + r() * 0.8;
      const z0 = -3.3 - r() * 9.5;
      for (let x = -70; x <= 70; x += 7.5) pts.push(new THREE.Vector3(x, y0 - Math.abs(Math.sin((x + i * 3) / 7.5 * Math.PI)) * 0.7, z0 + Math.sin(x * 0.3 + i) * 0.3));
      const line = new THREE.Line(this.own(new THREE.BufferGeometry().setFromPoints(pts)), wireMat);
      s.add(line);
    }

    // The chai tapri across the road, still going: a cart, a kettle, a bulb,
    // and two men having the day's last cup.
    const tapri = new THREE.Group();
    this.part(this.mat(0x2f6ea8), [1.8, 0.9, 0.8], [0, 0.6, 0], tapri);
    this.part(this.mat(0x7a4a24), [2.1, 0.05, 1.1], [0, 2.05, 0], tapri);
    for (const x of [-0.9, 0.9]) this.part(this.mat(0x5a3a1a), [0.05, 1.5, 0.05], [x, 1.3, 0.4], tapri);
    this.part(this.mat(0xc9ced3, { emissive: 0x111111 }), [0.25, 0.3, 0.25], [0.4, 1.2, 0], tapri, this.cyl);
    this.part(this.own(new THREE.MeshBasicMaterial({ color: 0xffe9a8 })), [0.12, 0.16, 0.12], [0, 1.85, 0.2], tapri, this.sph);
    const bulb = new THREE.PointLight(0xffd690, 7, 7, 1.6);
    bulb.position.set(0, 1.8, 0.6);
    tapri.add(bulb);
    this.sign(signTexture(256, 64, "#f2c200", [["☕ CHAI 10/-", 34, "#6d1a24"]]), 1.6, 0.4, 0, 2.3, 0.56, 0, tapri);
    this.person(tapri, -1.4, 0.8, 0.2, 0x3b6fb6);
    this.person(tapri, 1.5, 0.9, -0.6, 0xe8742a);
    this.part(this.mat(0x6b4a2a), [1.4, 0.4, 0.35], [-1.6, 0.25, 1.1], tapri);
    tapri.position.set(-6, 0.16, -14.2);
    s.add(tapri);

    // Parked two-wheelers along the kerb.
    for (const [x, c] of [[-9, 0xb3261e], [-8, 0x1f1f1f], [8.4, 0x2b5f9e], [9.6, 0xdddddd], [-22, 0x2f7a3a], [16, 0xb3261e]]) {
      const bike = new THREE.Group();
      this.part(this.mat(c, { emissive: 0x080808 }), [1.3, 0.4, 0.35], [0, 0.55, 0], bike);
      this.part(this.mat(0x111111), [0.5, 0.12, 0.3], [0.2, 0.82, 0], bike);
      for (const wx of [-0.55, 0.55]) this.part(this.mat(0x111111), [0.5, 0.12, 0.5], [wx, 0.26, 0], bike, this.cyl, [Math.PI / 2, 0, 0]);
      bike.rotation.y = 0.35;
      bike.position.set(x, 0.16, -3.0);
      s.add(bike);
    }

    s.add(new THREE.HemisphereLight(0x5a6aa8, 0x2a1c14, 0.9));
    s.add(new THREE.AmbientLight(0x6a5a70, 0.5));
  }

  // No Indian branch front is ever bare: a flex banner shouting about gold
  // loans, marigold garlands left over from the last puja, a mango-leaf toran
  // over the door, and a string of fairy lights along the ledge.
  dressBank() {
    const s = this.scene;

    // The flex banner, tied across the first floor with a bit of sag.
    const flex = canvasTexture(1024, 240, (ctx, w, h) => {
      const bg = ctx.createLinearGradient(0, 0, w, 0);
      bg.addColorStop(0, "#c8102e");
      bg.addColorStop(0.55, "#e8491d");
      bg.addColorStop(1, "#f2b632");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      // Rays behind the offer badge.
      ctx.save();
      ctx.translate(120, 120);
      for (let i = 0; i < 16; i += 1) {
        ctx.rotate(Math.PI / 8);
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.08)" : "rgba(255,230,120,0.18)";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(260, -40);
        ctx.lineTo(260, 40);
        ctx.fill();
      }
      ctx.restore();
      // Starburst badge.
      ctx.fillStyle = "#ffe14d";
      ctx.beginPath();
      for (let i = 0; i < 24; i += 1) {
        const r = i % 2 ? 62 : 84;
        const a = (i / 24) * Math.PI * 2;
        ctx[i ? "lineTo" : "moveTo"](120 + Math.cos(a) * r, 120 + Math.sin(a) * r);
      }
      ctx.fill();
      ctx.fillStyle = "#c8102e";
      ctx.textAlign = "center";
      ctx.font = "900 30px Impact, 'Arial Black', sans-serif";
      ctx.fillText("OFFER!", 120, 116);
      ctx.font = "bold 17px sans-serif";
      ctx.fillText("सीमित समय", 120, 142);
      // Headline.
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.font = "900 62px Impact, 'Arial Black', sans-serif";
      ctx.fillText("GOLD LOAN", 232, 88);
      ctx.fillStyle = "#ffe14d";
      ctx.font = "bold 44px sans-serif";
      ctx.fillText("सिर्फ़ 15 मिनट में!", 232, 142);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("Home Loan @ 8.4%*  •  Zero Balance A/c  •  Aadhaar Camp Every Sat.", 232, 186, w - 250);
      ctx.font = "italic 15px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText("*T&C apply. Loan sanction subject to Branch Manager's mood.", 232, 216, w - 250);
      // Eyelets.
      ctx.fillStyle = "#ddd";
      for (const [x, y] of [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12]]) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // Facing the street (-z), like every sign on this front.
    const banner = this.sign(flex, 9.2, 2.15, 0, 6.3, -0.12, Math.PI, s);
    banner.rotation.z = -0.012;
    // Ropes from the eyelets to the wall.
    const rope = this.mat(0xe8e2c8);
    for (const [x, y] of [[-4.62, 7.35], [4.62, 7.35], [-4.62, 5.25], [4.62, 5.25]]) {
      this.part(rope, [0.5, 0.015, 0.015], [x + Math.sign(x) * 0.24, y, -0.08], s, this.box, [0, 0, -Math.sign(x) * Math.sign(y - 6.3) * 0.3]);
    }

    // Marigold garlands, swagged in loops under the blue board.
    const orange = this.mat(0xf28c1c, { emissive: 0x3a1a00 });
    const yellow = this.mat(0xf6c21a, { emissive: 0x3a2c00 });
    const leaf = this.mat(0x2f7a2a);
    const swags = 5;
    const left = -4.6;
    const span = 9.2 / swags;
    for (let i = 0; i < swags; i += 1) {
      for (let k = 0; k <= 12; k += 1) {
        const t = k / 12;
        const x = left + (i + t) * span;
        const y = 3.38 - Math.sin(t * Math.PI) * 0.34;
        this.part(k % 2 ? yellow : orange, [0.11, 0.11, 0.11], [x, y, -0.18], s, this.sph);
      }
      // A hanging tassel at each join.
      for (let k = 0; k < 4; k += 1) this.part(k % 2 ? yellow : orange, [0.1, 0.1, 0.1], [left + i * span, 3.3 - k * 0.1, -0.18], s, this.sph);
    }

    // Mango-leaf toran across the top of the shutter.
    for (let x = -2.9; x <= 2.9; x += 0.26) {
      const l = this.part(leaf, [0.09, 0.26, 0.012], [x, 2.78, -0.08], s, this.box, [0, 0, (x * 7) % 0.3 - 0.15]);
      l.position.y -= Math.abs(Math.sin(x)) * 0.03;
    }
    this.part(this.mat(0x8a5a2a), [5.9, 0.02, 0.02], [0, 2.92, -0.08]);

    // Fairy lights along the ledge, twinkling in three colours.
    this.fairy = [0xff4d4d, 0x4dff6a, 0xffd24d, 0x4db8ff].map((c) => this.own(new THREE.MeshBasicMaterial({ color: c })));
    this.fairyColours = [0xff4d4d, 0x4dff6a, 0xffd24d, 0x4db8ff];
    for (let i = 0; i < 64; i += 1) {
      const x = -10.4 + i * 0.33;
      const y = 3.62 - Math.abs(Math.sin(i * 0.5)) * 0.08;
      this.part(this.fairy[i % 4], [0.06, 0.06, 0.06], [x, y, -0.45], s, this.sph);
    }
  }

  person(parent, x, h, z, shirt) {
    const g = new THREE.Group();
    this.part(this.mat(0x2a2a3a), [0.3, h * 0.55, 0.22], [0, h * 0.27, 0], g);
    this.part(this.mat(shirt), [0.4, h * 0.45, 0.25], [0, h * 0.72, 0], g);
    this.part(this.mat(0x8a5a3a), [0.2, 0.22, 0.2], [0, h + 0.07, 0], g, this.sph);
    g.position.set(x, 0, z);
    parent.add(g);
    return g;
  }

  // A run of two-storey shop buildings along one side of the road.
  shopRow(z, rotY, r, [x0, x1], near) {
    let x = x0;
    let k = near ? 3 : 0;
    while (x < x1) {
      const w = 5 + r() * 3;
      const h = 6 + r() * 5;
      const [hi, en, colour] = SIGNS[k % SIGNS.length];
      const lit = r() < 0.55;
      const face = this.own(canvasTexture(256, 320, (ctx, cw, ch) => {
        const tone = ["#d9c9a8", "#b8c6c9", "#e0b8a0", "#c7d1b0", "#d4c0d8"][Math.floor(r() * 5)];
        ctx.fillStyle = tone;
        ctx.fillRect(0, 0, cw, ch);
        // Upper floors: windows, some lit, balcony railings, an AC unit.
        for (let fy = 0; fy < 2; fy += 1) {
          for (let wx = 0; wx < 3; wx += 1) {
            ctx.fillStyle = r() < 0.4 ? "#f4c46a" : "#1d2430";
            ctx.fillRect(26 + wx * 76, 26 + fy * 70, 46, 44);
            ctx.fillStyle = "#333";
            for (let bx = 0; bx < 5; bx += 1) ctx.fillRect(26 + wx * 76 + bx * 11, 26 + fy * 70, 2, 44);
          }
          ctx.fillStyle = "#555";
          ctx.fillRect(14, 72 + fy * 70, cw - 28, 4);
        }
        ctx.fillStyle = "#ddd";
        ctx.fillRect(190, 150, 40, 22);
        // Ground floor: the shop, shutter down or open and lit.
        if (lit) {
          ctx.fillStyle = "#fff1c9";
          ctx.fillRect(18, 214, cw - 36, 100);
          ctx.fillStyle = "#b07a3a";
          for (let i = 0; i < 6; i += 1) ctx.fillRect(28 + i * 35, 240 + (i % 2) * 20, 26, 30);
        } else {
          ctx.fillStyle = "#6f7a78";
          ctx.fillRect(18, 214, cw - 36, 100);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          for (let y = 214; y < 314; y += 6) ctx.fillRect(18, y, cw - 36, 2);
        }
        // The signboard.
        ctx.fillStyle = colour;
        ctx.fillRect(10, 176, cw - 20, 36);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(hi, cw / 2, 192);
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(en, cw / 2, 206);
      }));
      const building = new THREE.Mesh(this.box, [
        this.mat(0x8a8070), this.mat(0x8a8070), this.mat(0x6a6258), this.mat(0x6a6258),
        this.own(new THREE.MeshLambertMaterial({ map: face, emissive: lit ? 0x221a08 : 0x000000 })),
        this.mat(0x8a8070),
      ]);
      building.scale.set(w, h, 5);
      building.position.set(x + w / 2, h / 2, z + (rotY === 0 ? -2.5 : 2.5));
      building.rotation.y = rotY === 0 ? 0 : Math.PI;
      this.scene.add(building);
      x += w + 0.3;
      k += 1;
    }
  }

  // --------------------------------------------------------------- autos

  // An auto-rickshaw facing -x: yellow body with a green stripe, black
  // canopy, three wheels, a driver, and a nimbu-mirchi for luck.
  buildAuto(color, hero = false) {
    const g = new THREE.Group();
    const body = this.mat(color, { emissive: 0x100c00 });
    const black = this.mat(0x151515);
    this.part(body, [2.3, 0.7, 1.3], [0.15, 0.6, 0], g);
    this.part(this.mat(0x2f8a3a), [2.32, 0.12, 1.32], [0.15, 0.78, 0], g);
    this.part(body, [0.6, 0.95, 0.95], [-1.15, 0.75, 0], g);
    this.part(black, [2.0, 0.08, 1.45], [0.1, 1.95, 0], g);
    this.part(black, [1.9, 0.9, 0.04], [0.15, 1.5, 0.7], g).scale.y = 0.35;
    this.part(black, [1.9, 0.9, 0.04], [0.15, 1.5, -0.7], g).scale.y = 0.35;
    this.part(black, [0.06, 0.9, 1.4], [1.1, 1.5, 0], g);
    this.part(this.own(new THREE.MeshLambertMaterial({ color: 0xbfd8dc, transparent: true, opacity: 0.35 })), [0.04, 0.7, 1.0], [-0.95, 1.5, 0], g, this.box, [0, 0, 0.2]);
    for (const [x, z] of [[-0.9, 0.7], [-0.9, -0.7], [1.08, 0.7], [1.08, -0.7]]) this.part(black, [0.05, 1.1, 0.05], [x, 1.4, z], g);
    for (const [x, z] of [[-1.25, 0], [0.85, 0.62], [0.85, -0.62]]) this.part(black, [0.44, 0.18, 0.44], [x, 0.22, z], g, this.cyl, [Math.PI / 2, 0, 0]);
    this.part(this.own(new THREE.MeshBasicMaterial({ color: 0xfff6d0 })), [0.08, 0.16, 0.16], [-1.47, 0.95, 0], g, this.sph);
    this.part(this.own(new THREE.MeshBasicMaterial({ color: 0xff3a2a })), [0.04, 0.08, 0.3], [1.27, 0.7, 0], g);
    // Rear seat, and the driver with his khaki shirt.
    this.part(this.mat(0x5a1d22), [0.55, 0.15, 1.2], [0.6, 0.9, 0], g);
    this.part(this.mat(0x5a1d22), [0.12, 0.5, 1.2], [0.9, 1.15, 0], g);
    const driver = new THREE.Group();
    this.part(this.mat(0xb09a6a), [0.35, 0.5, 0.42], [0, 1.2, 0], driver);
    this.part(this.mat(0x8a5a3a), [0.22, 0.24, 0.22], [0, 1.6, 0], driver, this.sph);
    this.part(this.mat(0x1a1a1a), [0.24, 0.08, 0.24], [0, 1.72, 0], driver, this.sph);
    driver.position.x = -0.45;
    g.add(driver);
    this.part(black, [0.05, 0.05, 0.7], [-0.85, 1.15, 0], g);
    // Nimbu-mirchi, hung from the front.
    this.part(this.mat(0xe8d43a), [0.07, 0.07, 0.07], [-1.02, 1.62, 0.25], g, this.sph);
    for (let i = 0; i < 3; i += 1) this.part(this.mat(0x2f8a3a), [0.02, 0.09, 0.02], [-1.02, 1.52 - i * 0.06, 0.25], g, this.cyl);
    if (hero) {
      const lamp = new THREE.SpotLight(0xfff0c0, 20, 20, 0.5, 0.5, 1.3);
      lamp.position.set(-1.5, 0.95, 0);
      lamp.target.position.set(-8, 0, 0);
      g.add(lamp, lamp.target);
    }
    return g;
  }

  buildTraffic() {
    const r = rng(0xa070);
    const cars = [];
    const colours = [0xf2c200, 0xf2c200, 0x1f1f1f, 0xf2c200, 0x2f8a3a];
    for (let i = 0; i < 7; i += 1) {
      const eastbound = i % 2 === 0;
      const auto = this.buildAuto(colours[i % colours.length]);
      auto.rotation.y = eastbound ? Math.PI : 0;
      auto.position.set(-80 + r() * 160, 0, eastbound ? -10.9 : -8.6);
      this.scene.add(auto);
      cars.push({ auto, speed: (6 + r() * 5) * (eastbound ? 1 : -1) });
    }
    return cars;
  }

  // ------------------------------------------------------------------ home

  buildHome() {
    const g = new THREE.Group();
    g.position.x = HOME_X;
    this.home = g;
    const wall = this.mat(0xcfe0c8);
    this.part(this.mat(0xb89a7a), [3.8, 0.05, 3.6], [0, 0, -0.1], g);
    this.part(this.mat(0xf1efe6), [3.8, 0.05, 3.6], [0, 2.8, -0.1], g);
    this.part(wall, [3.8, 2.8, 0.1], [0, 1.4, -1.9], g);
    this.part(wall, [0.1, 2.8, 3.6], [-1.9, 1.4, -0.1], g);
    this.part(wall, [0.1, 2.8, 3.6], [1.9, 1.4, -0.1], g);
    this.part(wall, [3.8, 2.8, 0.1], [0, 1.4, 1.7], g);
    // The window, with a grill and the city beyond.
    const night = this.own(canvasTexture(128, 96, (ctx, w, h) => {
      ctx.fillStyle = "#0b1030";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i += 1) {
        ctx.fillStyle = Math.random() < 0.6 ? "#f4c46a" : "#9ec2ff";
        ctx.fillRect(Math.random() * w, 30 + Math.random() * 60, 3, 3);
      }
      ctx.fillStyle = "#fff4d6";
      ctx.beginPath();
      ctx.arc(100, 18, 7, 0, Math.PI * 2);
      ctx.fill();
    }));
    this.sign(night, 1.4, 1.0, 0.5, 1.6, -1.84, 0, g, true);
    for (let i = 0; i < 6; i += 1) this.part(this.mat(0x3a3a3a), [0.02, 1.0, 0.02], [-0.2 + i * 0.28, 1.6, -1.8], g);
    this.part(this.mat(0xb3462e), [0.5, 1.3, 0.04], [-0.45, 1.55, -1.78], g);
    this.part(this.mat(0xb3462e), [0.5, 1.3, 0.04], [1.45, 1.55, -1.78], g);
    // The bed: frame, mattress, a checked blanket, the pillow.
    const blanket = this.own(canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = "#2f5aa8";
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      for (let i = 0; i < 64; i += 16) {
        ctx.fillRect(i, 0, 6, 64);
        ctx.fillRect(0, i, 64, 6);
      }
    }));
    this.part(this.mat(0x6b4226), [1.4, 0.35, 2.1], [-1.1, 0.2, -0.75], g);
    this.part(this.mat(0xf2efe6), [1.3, 0.2, 2.0], [-1.1, 0.47, -0.75], g);
    this.part(this.own(new THREE.MeshLambertMaterial({ map: blanket })), [1.34, 0.08, 1.2], [-1.1, 0.6, -0.35], g);
    this.part(this.mat(0xffffff), [0.8, 0.14, 0.4], [-1.1, 0.62, -1.55], g);
    this.part(this.mat(0x6b4226), [1.4, 0.9, 0.08], [-1.1, 0.75, -1.84], g);
    // Side table and the lamp.
    this.part(this.mat(0x6b4226), [0.45, 0.55, 0.45], [-0.15, 0.28, -1.6], g);
    this.part(this.mat(0x333333), [0.1, 0.3, 0.1], [-0.15, 0.7, -1.6], g, this.cyl);
    this.lampShade = this.part(this.mat(0xfff0c8, { emissive: 0xffd27a }), [0.32, 0.22, 0.32], [-0.15, 0.95, -1.6], g, this.own(new THREE.CylinderGeometry(0.3, 0.5, 1, 16)));
    this.lamp = new THREE.PointLight(0xffc27a, 7, 7, 1.4);
    this.lamp.position.set(-0.15, 1.0, -1.45);
    g.add(this.lamp);
    this.moon = new THREE.PointLight(0x6a88ff, 0, 6, 1.5);
    this.moon.position.set(0.5, 1.8, -1.2);
    g.add(this.moon);
    this.homeAmbient = new THREE.AmbientLight(0xfff0e0, 0.35);
    this.homeAmbient.position.x = HOME_X;
    this.scene.add(this.homeAmbient);
    // The chair the tie lands on, and the steel almirah every Indian home has.
    this.part(this.mat(0x7a4a24), [0.5, 0.05, 0.5], [1.3, 0.5, -1.2], g);
    this.part(this.mat(0x7a4a24), [0.5, 0.55, 0.05], [1.3, 0.78, -1.45], g);
    for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) this.part(this.mat(0x5a3a1a), [0.04, 0.5, 0.04], [1.3 + dx, 0.25, -1.2 + dz], g);
    this.chairTie = this.part(this.mat(0x6d1a24), [0.09, 0.7, 0.02], [1.3, 0.72, -1.49], g);
    this.chairTie.visible = false;
    this.part(this.mat(0x7f8b86), [0.9, 1.9, 0.55], [1.6, 0.95, 0.4], g);
    // Wall calendar and a photo.
    this.sign(signTexture(200, 280, "#fff8e0", [["शुभ लाभ", 40, "#b71c1c"], ["2026", 30, "#333"], ["SEPTEMBER", 22, "#333"]], { border: "#e65100" }), 0.45, 0.62, 1.84, 1.7, -0.9, -Math.PI / 2, g);
    this.sign(signTexture(200, 160, "#6b4226", [["Mummy · Papa", 22, "#fff"], ["& me", 18, "#fff", "italic"]], { border: "#c9a13b" }), 0.5, 0.4, -1.84, 1.7, 0.4, Math.PI / 2, g);
    // Ceiling fan.
    this.fan = new THREE.Group();
    this.part(this.mat(0x6b4226), [0.04, 0.35, 0.04], [0, -0.17, 0], this.fan, this.cyl);
    this.part(this.mat(0x6b4226), [0.22, 0.1, 0.22], [0, -0.36, 0], this.fan, this.cyl);
    this.fanBlades = new THREE.Group();
    this.fanBlades.position.y = -0.38;
    for (let i = 0; i < 3; i += 1) {
      const blade = this.part(this.mat(0x6b4226), [0.65, 0.012, 0.13], [Math.cos((i * Math.PI * 2) / 3) * 0.42, 0, Math.sin((i * Math.PI * 2) / 3) * 0.42], this.fanBlades);
      blade.rotation.y = -(i * Math.PI * 2) / 3;
    }
    this.fan.add(this.fanBlades);
    this.fan.position.set(-0.3, 2.78, -0.6);
    g.add(this.fan);
    this.scene.add(g);

    // The tie, in your hand, for the moment you pull it off.
    // Maroon with thin gold diagonal stripes, the office uniform.
    const stripes = this.own(canvasTexture(32, 128, (ctx, w, h) => {
      ctx.fillStyle = "#6d1a24";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#c9a13b";
      ctx.lineWidth = 2;
      for (let y = -32; y < h + 32; y += 14) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + 16);
        ctx.stroke();
      }
    }));
    const tieMat = this.own(new THREE.MeshLambertMaterial({ map: stripes }));
    this.tie = new THREE.Group();
    const blade = new THREE.Shape();
    blade.moveTo(-0.018, 0.06);
    blade.lineTo(0.018, 0.06);
    blade.lineTo(0.032, -0.2);
    blade.lineTo(0, -0.24);
    blade.lineTo(-0.032, -0.2);
    blade.lineTo(-0.018, 0.06);
    const bladeMesh = new THREE.Mesh(this.own(new THREE.ShapeGeometry(blade)), tieMat);
    bladeMesh.material.side = THREE.DoubleSide;
    this.tie.add(bladeMesh);
    this.part(tieMat, [0.04, 0.035, 0.02], [0, 0.07, 0.004], this.tie);
    this.chairTie.material = tieMat;
    this.tie.visible = false;
    this.camera.add(this.tie);
    this.scene.add(this.camera);
  }

  // -------------------------------------------------------------- the phone

  phoneDom() {
    const $ = (s) => document.querySelector(s);
    const root = $("#end-phone");
    return {
      root,
      chat: $("#end-phone-chat"),
      input: $("#end-phone-input"),
      status: $("#end-phone-status"),
      dialog: $("#end-phone-dialog"),
      toast: $("#end-phone-toast"),
      blockButton: $("#end-phone-block"),
    };
  }

  phoneReset() {
    const p = this.phone;
    p.chat.innerHTML = "";
    p.input.textContent = "";
    p.status.textContent = "online";
    p.dialog.classList.add("hidden");
    p.toast.classList.add("hidden");
    p.blockButton.classList.remove("pressed");
    p.root.classList.remove("blocked");
  }

  bubble(text, mine) {
    const b = document.createElement("div");
    b.className = `bubble ${mine ? "mine" : "theirs"}`;
    b.textContent = text;
    const meta = document.createElement("span");
    meta.className = "bubble-meta";
    meta.textContent = mine ? "11:52 PM ✓✓" : "11:52 PM";
    b.append(meta);
    this.phone.chat.append(b);
    this.phone.chat.scrollTop = this.phone.chat.scrollHeight;
    return b;
  }

  // Type a message out, send it.
  *type(text) {
    const input = this.phone.input;
    for (let i = 1; i <= text.length; i += 1) {
      input.textContent = text.slice(0, i);
      if (i % 2 === 0) this.audio.tone({ freq: 1800 + Math.random() * 400, type: "sine", duration: 0.02, gain: 0.02 });
      yield 0.035;
    }
    yield 0.25;
    input.textContent = "";
    this.bubble(text, true);
    this.audio.tone({ freq: 700, type: "sine", duration: 0.08, gain: 0.05, slideTo: 1400 });
    yield 0.7;
  }

  // ------------------------------------------------------------- the script

  say(text, speaker = "You", mood = "normal") {
    this.game.subtitle(text, mood, speaker);
  }

  think(text) {
    this.game.subtitle(text, "thought", "You");
  }

  look(yaw, pitch, rate = 3) {
    this.eyeTo.yaw = yaw;
    this.eyeTo.pitch = pitch;
    this.eyeRate = rate;
  }

  move(x, y, z, rate = 3) {
    this.eyeTo.x = x;
    this.eyeTo.y = y;
    this.eyeTo.z = z;
    this.eyeRate = rate;
  }

  cut(x, y, z, yaw, pitch) {
    Object.assign(this.eye, { x, y, z, yaw, pitch, roll: 0 });
    Object.assign(this.eyeTo, this.eye);
  }

  *script() {
    const hero = this.hero;

    // 1 · Out under the shutter.
    this.cut(0, 0.5, 0.9, 0, -0.1);
    this.fadeTo = 0;
    this.fadeRate = 1.2;
    this.move(0, 0.55, -0.9, 1.6);
    this.crawling = true;
    yield 1.3;
    this.crawling = false;
    this.move(0, 1.62, -1.6, 2.5);
    this.look(0, 0.02, 2);
    this.think("Bahar. Main BAHAR hoon.");
    yield 1.7;

    // An auto, coming down the road.
    this.look(-1.05, -0.02, 2.2);
    this.heroSpeed = -10;
    yield 0.6;
    this.say("AUTO! Auto bhaiya!", "You", "shout");
    this.honk(true);
    yield () => hero.position.x < 7;
    this.braking = true;
    yield () => Math.abs(hero.position.x - 0.8) < 0.15;
    this.braking = false;
    this.heroSpeed = 0; // stopped dead, not creeping forward
    this.look(-0.2, -0.12, 3);
    this.say("Kahan chalna hai, sahab?", "Auto-wala");
    this.honk(false);
    yield 1.6;

    // Climb in.
    this.move(0.7, 1.4, -4.6, 2.4);
    this.say("Sector 12! Jaldi chalo — double paisa dunga!", "You", "shout");
    yield 1.2;
    // Settle into the back seat: the driver's shoulders, and the road ahead
    // through the windshield past him.
    this.move(hero.position.x + 0.68, 1.36, -6.4 - 0.2, 3.5);
    this.look(Math.PI / 2 - 0.08, -0.07, 3.5);
    yield 2.2;

    // One look back — leaning out of the open side of the auto. He is under
    // the shutter, and he is not coming out.
    this.bossOn = true;
    const lean = { x: hero.position.x + 0.3, z: -6.4 + 0.66 };
    this.move(lean.x, 1.38, lean.z, 3);
    this.eyeRate = 2.4;
    this.watchBoss = true;
    yield 1.0;
    this.say("Oyye! Tujhe toh kal bataata hoon!", "Motu Sir", "shout");
    this.audio.tone({ freq: 190, type: "sawtooth", duration: 0.5, gain: 0.05, slideTo: 230 });
    yield 1.8;
    this.heroSpeed = -1;
    this.pullingAway = true;
    this.say("Kal milenge toh na!", "You", "shout");
    yield 2.0;
    this.watchBoss = false;
    this.look(Math.PI / 2, 0.0, 1.6);
    yield 2.4;
    this.fadeTo = 1;
    this.fadeRate = 1.1;
    yield 1.1;

    // 2 · Home.
    this.pullingAway = false;
    this.heroSpeed = 0;
    this.stopStreetSound();
    this.startHomeSound();
    this.cut(HOME_X + 0.55, 1.6, 1.3, 0.25, -0.08);
    this.fadeTo = 0;
    this.fadeRate = 0.9;
    yield 1.2;
    this.think("Pehle yeh phaansi ka phanda utaaro.");
    this.tie.visible = true;
    this.tieT = 0;
    yield 2.2;
    this.tie.visible = false;
    this.chairTie.visible = true;
    this.audio.noise({ duration: 0.12, gain: 0.08, filter: 1200 });
    yield 0.4;
    this.move(HOME_X - 0.4, 1.02, -0.6, 2.2);
    this.look(0.1, -0.2, 2);
    yield 1.4;
    this.audio.noise({ duration: 0.3, gain: 0.08, filter: 500 }); // the mattress

    // 3 · The phone.
    this.phoneReset();
    this.phone.root.classList.remove("hidden");
    requestAnimationFrame(() => this.phone.root.classList.add("show"));
    yield 0.9;
    yield* this.type("Sir, aapki table pe ek letter rakha hai.");
    yield* this.type("Resignation hai. With immediate effect. 🙏");
    yield* this.type("Notice period meri 43 pending leaves se adjust kar lena.");
    this.phone.status.textContent = "typing…";
    yield 1.6;
    this.bubble("SHARMA!!! KAL SUBAH 9 BAJE MERI CABIN MEIN—", false);
    this.audio.tone({ freq: 880, type: "sine", duration: 0.12, gain: 0.06 });
    this.audio.tone({ freq: 1320, type: "sine", duration: 0.16, gain: 0.05, delay: 0.1 });
    this.phone.status.textContent = "typing…";
    yield 1.4;
    this.phone.dialog.classList.remove("hidden");
    yield 1.0;
    this.phone.blockButton.classList.add("pressed");
    this.audio.tone({ freq: 300, type: "square", duration: 0.08, gain: 0.05 });
    yield 0.35;
    this.phone.dialog.classList.add("hidden");
    this.phone.root.classList.add("blocked");
    this.phone.status.textContent = "blocked";
    this.phone.toast.classList.remove("hidden");
    yield 1.6;
    this.phone.root.classList.remove("show");
    yield 0.5;
    this.phone.root.classList.add("hidden");

    // Lie back. The fan. The sigh.
    // Head on the pillow, eyes on the fan going round.
    const head = { x: HOME_X - 1.05, y: 0.78, z: -1.2 };
    const fan = { x: HOME_X - 0.3, y: 2.4, z: -0.6 };
    this.move(head.x, head.y, head.z, 1.8);
    this.look(Math.atan2(-(fan.x - head.x), -(fan.z - head.z)), Math.atan2(fan.y - head.y, Math.hypot(fan.x - head.x, fan.z - head.z)), 1.6);
    yield 1.6;
    this.sigh();
    this.think("Haaaah… sukoon.");
    yield 2.6;
    this.audio.tone({ freq: 2200, type: "square", duration: 0.02, gain: 0.06 });
    this.lampOff = true;
    yield 1.2;
    this.think("Kal se… koi Motu Sir nahi.");
    this.chord();
    yield 2.6;
    this.fadeTo = 1;
    this.fadeRate = 0.7;
    yield 1.6;
  }

  // ---------------------------------------------------------------- update

  update(dt, now) {
    if (this.done) return;
    this.t += dt;
    let guard = 0;
    while (this.waiting() && guard < 20) {
      guard += 1;
      const r = this.gen.next();
      if (r.done) {
        this.finish();
        return;
      }
      const v = r.value;
      if (typeof v === "number") {
        const until = this.t + v;
        this.waiting = () => this.t >= until;
      } else if (typeof v === "function") {
        this.waiting = v;
      } else {
        this.waiting = () => true;
      }
    }

    // Traffic, both ways, wrapping round the ends of the street.
    for (const car of this.traffic) {
      car.auto.position.x += car.speed * dt;
      if (car.auto.position.x > 90) car.auto.position.x = -90;
      if (car.auto.position.x < -90) car.auto.position.x = 90;
    }
    // The hero auto: rolls in, brakes, and later pulls away with you in it.
    // Braking: ease in to a stop right in front of you.
    if (this.braking) {
      const to = (0.8 - this.hero.position.x) * Math.min(1, dt * 1.6);
      this.heroSpeed = to / Math.max(dt, 1e-3);
    }
    if (this.pullingAway) this.heroSpeed = Math.max(-11, this.heroSpeed - dt * 3.2);
    const dx = this.heroSpeed * dt;
    this.hero.position.x += dx;
    if (this.pullingAway) {
      this.eye.x += dx;
      this.eyeTo.x += dx;
    }
    this.engine(Math.abs(this.heroSpeed));

    // Motu Sir, under the shutter, shaking his fist.
    this.boss.setVisible(Boolean(this.bossOn));
    if (this.bossOn) {
      this.boss.update({ x: 0, y: 0.4 * 32, angle: -Math.PI / 2, pose: "slap", slap: 0.25 + Math.abs(Math.sin(now * 5)) * 0.3, dt, time: now, angry: true });
    }

    // The fairy lights chase each other along the ledge.
    if (this.fairy) {
      this.fairy.forEach((m, i) => {
        const on = Math.sin(now * 5 - i * 1.6) > -0.2;
        m.color.setHex(on ? this.fairyColours[i] : 0x221a14);
      });
    }

    // Home: the fan never stops, the lamp goes off, the tie comes off.
    this.fanBlades.rotation.y -= dt * 9;
    if (this.lampOff) {
      this.lamp.intensity += (0 - this.lamp.intensity) * Math.min(1, dt * 10);
      this.homeAmbient.intensity += (0.06 - this.homeAmbient.intensity) * Math.min(1, dt * 4);
      this.moon.intensity += (3 - this.moon.intensity) * Math.min(1, dt * 2);
      this.lampShade.material.emissive?.setHex(0x221a10);
    }
    if (this.tie.visible) {
      this.tieT += dt;
      const k = this.tieT;
      // Up from the collar, a tug side to side, then flung off to the right.
      const up = smooth(k / 0.7);
      const fling = smooth((k - 1.4) / 0.6);
      this.tie.position.set(0.07 + Math.sin(k * 9) * 0.02 * (1 - fling) + fling * 0.5, -0.42 + up * 0.26 + fling * 0.1, -0.36);
      this.tie.rotation.set(0, 0, Math.sin(k * 7) * 0.2 - fling * 1.6);
    }

    // The eye. While looking back, it stays on Sir as the auto moves off.
    if (this.watchBoss) {
      this.eyeTo.yaw = Math.atan2(-(0 - this.eye.x), -(0.4 - this.eye.z));
      this.eyeTo.pitch = Math.atan2(1.6 - this.eye.y, Math.hypot(this.eye.x, 0.4 - this.eye.z));
    }
    const k = Math.min(1, dt * this.eyeRate);
    for (const key of ["x", "y", "z"]) this.eye[key] += (this.eyeTo[key] - this.eye[key]) * k;
    this.eye.yaw += wrapAngle(this.eyeTo.yaw - this.eye.yaw) * k;
    this.eye.pitch += (this.eyeTo.pitch - this.eye.pitch) * k;
    const crawl = this.crawling ? Math.sin(now * 9) * 0.03 : 0;
    const ride = this.pullingAway ? Math.sin(now * 23) * 0.008 + Math.sin(now * 7) * 0.006 : 0;
    this.camera.position.set(this.eye.x, this.eye.y + crawl + ride, this.eye.z);
    this.camera.rotation.set(this.eye.pitch, this.eye.yaw, crawl * 0.6 + ride * 2, "YXZ");

    this.fade += Math.sign(this.fadeTo - this.fade) * Math.min(Math.abs(this.fadeTo - this.fade), dt * this.fadeRate);
    this.game.el.fade.style.opacity = String(this.fade);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  // --------------------------------------------------------------- sound

  // Traffic: a low rumble, and horns — this is an Indian street.
  startStreetSound() {
    const ctx = this.audio.ctx;
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
    out.connect(this.audio.master);
    this.streetBus = out;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const rumble = ctx.createBufferSource();
    rumble.buffer = buffer;
    rumble.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0.09;
    rumble.connect(lp);
    lp.connect(g);
    g.connect(out);
    rumble.start();
    this.loops.push(rumble);
    // The hero auto's two-stroke putt-putt.
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 28;
    const eg = ctx.createGain();
    eg.gain.value = 0.0;
    const ef = ctx.createBiquadFilter();
    ef.type = "lowpass";
    ef.frequency.value = 400;
    osc.connect(ef);
    ef.connect(eg);
    eg.connect(out);
    osc.start();
    this.loops.push(osc);
    this.engineOsc = osc;
    this.engineGain = eg;
    this.hornTimer = setInterval(() => {
      if (this.done || !this.streetBus) return;
      if (Math.random() < 0.7) this.honk(Math.random() < 0.5, 0.35 + Math.random() * 0.4);
    }, 900);
  }

  engine(speed) {
    if (!this.engineOsc || !this.audio.ctx) return;
    const t = this.audio.ctx.currentTime;
    const running = this.pullingAway || this.braking || Math.abs(this.heroSpeed) > 0.5 ? 1 : 0.4;
    this.engineOsc.frequency.setTargetAtTime(24 + speed * 4, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 * running, t, 0.2);
  }

  honk(double = false, gain = 1) {
    const out = this.streetBus || this.audio.master;
    const f = 380 + Math.random() * 260;
    this.audio.tone({ freq: f, type: "square", duration: 0.18, gain: 0.03 * gain, out });
    this.audio.tone({ freq: f * 1.26, type: "square", duration: 0.18, gain: 0.025 * gain, out });
    if (double) {
      this.audio.tone({ freq: f, type: "square", duration: 0.22, gain: 0.03 * gain, delay: 0.26, out });
      this.audio.tone({ freq: f * 1.26, type: "square", duration: 0.22, gain: 0.025 * gain, delay: 0.26, out });
    }
  }

  stopStreetSound() {
    clearInterval(this.hornTimer);
    for (const n of this.loops) {
      try {
        n.stop();
      } catch {
        // already stopped
      }
    }
    this.loops = [];
    if (this.streetBus) {
      const bus = this.streetBus;
      this.streetBus = null;
      bus.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.2);
      setTimeout(() => bus.disconnect(), 1200);
    }
    this.engineOsc = null;
  }

  // Home: the fan's whoosh and crickets outside.
  startHomeSound() {
    const ctx = this.audio.ctx;
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    out.connect(this.audio.master);
    this.homeBus = out;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const fan = ctx.createBufferSource();
    fan.buffer = buffer;
    fan.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    fan.connect(lp);
    lp.connect(g);
    g.connect(out);
    fan.start();
    this.loops.push(fan);
    this.cricketTimer = setInterval(() => {
      if (!this.homeBus) return;
      for (let i = 0; i < 3; i += 1) this.audio.tone({ freq: 4200, type: "sine", duration: 0.04, gain: 0.008, delay: i * 0.07, out: this.homeBus });
    }, 1100);
  }

  sigh() {
    const out = this.homeBus || this.audio.master;
    this.audio.noise({ duration: 1.6, gain: 0.12, filter: 900, out });
    this.audio.tone({ freq: 220, type: "sine", duration: 1.4, gain: 0.03, slideTo: 150, out });
  }

  chord() {
    for (const [f, d] of [[262, 0], [330, 0.15], [392, 0.3], [523, 0.5]]) {
      this.audio.tone({ freq: f, type: "triangle", duration: 2.2, gain: 0.06, attack: 0.1, delay: d });
    }
  }

  // ---------------------------------------------------------------- end

  skip() {
    this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.game.el.fade.style.opacity = "1";
    this.game.finishEscape();
  }

  dispose() {
    this.stopStreetSound();
    clearInterval(this.cricketTimer);
    if (this.homeBus) {
      const bus = this.homeBus;
      this.homeBus = null;
      bus.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.2);
      setTimeout(() => bus.disconnect(), 1200);
    }
    this.phone.root.classList.remove("show");
    this.phone.root.classList.add("hidden");
    this.boss.dispose();
    this.camera.remove(this.tie);
    this.scene.traverse((o) => {
      if (o.isMesh && o.geometry !== this.box && o.geometry !== this.cyl && o.geometry !== this.sph) o.geometry?.dispose?.();
    });
    for (const thing of this.disposables) thing.dispose?.();
  }
}
