// Every jugaad tool in the game, as a little 3D model.
//
// Built from primitives, wire tubes and canvas-drawn labels like everything
// else in the branch — no model files. Each is modelled at real size, in
// metres, standing up and facing +z (towards whoever is looking at it). The
// same model is used for:
//
//   * the thing in your hand, first-person, bottom-right of the screen;
//   * the icon in your bag (rendered once to an image and cached);
//   * the thing on the floor when you drop it;
//   * the props in the world before you take them (the umbrella on the coat
//     stand, the extinguisher on the wall, the broom, Sir's keys).
//
// Models are built once per item and cloned; clones share geometry and
// materials, which live for the life of the page.

import * as THREE from "three";

// ------------------------------------------------------------------ helpers

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const SPH = new THREE.SphereGeometry(0.5, 16, 12);

const materials = new Map();
function mat(color, { shiny = 0, emissive = 0, transparent = false, opacity = 1, map = null, side = THREE.FrontSide } = {}) {
  const key = map ? null : `${color}|${shiny}|${emissive}|${transparent}|${opacity}|${side}`;
  if (key && materials.has(key)) return materials.get(key);
  const m = shiny
    ? new THREE.MeshPhongMaterial({ color, shininess: shiny, specular: 0x666666, emissive, transparent, opacity, map, side })
    : new THREE.MeshLambertMaterial({ color, emissive, transparent, opacity, map, side });
  if (transparent) m.depthWrite = false;
  if (key) materials.set(key, m);
  return m;
}

const STEEL = () => mat(0xc9ced3, { shiny: 80 });
const DARK_STEEL = () => mat(0x5d646b, { shiny: 60 });
const BRASS = () => mat(0xc9a13b, { shiny: 70 });
const BLACK = () => mat(0x18191c, { shiny: 30 });

function texture(w, h, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function mesh(geometry, material, [sx, sy, sz] = [1, 1, 1], [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
  const m = new THREE.Mesh(geometry, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

// A thin wire bent along a path: paperclips, pins, the hairpin.
function wire(points, radius, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z)), closed, "centripetal");
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 8), radius, 6, closed), material);
}

// Points round an arc, for bending wire.
function arc(cx, cy, r, from, to, steps = 6) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = from + ((to - from) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// A flat card with artwork on the front and a plain back.
function card(w, h, front, backColor = 0xf2efe6) {
  const edge = mat(0xe6e2d8);
  const faceMat = new THREE.MeshLambertMaterial({ map: front });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.0009), [edge, edge, edge, edge, faceMat, mat(backColor)]);
}

// Turned objects (bottles, umbrellas) from a profile of [radius, height].
function lathe(profile, material, segments = 24) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), material);
}

// A key: round bow with a hole, a shaft, and teeth.
function key(length, material, { bowColor = null } = {}) {
  const g = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(length * 0.14, length * 0.06, 8, 20), bowColor ? mat(bowColor, { shiny: 20 }) : material);
  bow.position.x = -length * 0.36;
  g.add(bow);
  g.add(mesh(BOX, material, [length * 0.62, length * 0.09, length * 0.035], [length * 0.13, 0, 0]));
  for (let i = 0; i < 4; i += 1) {
    const h = length * (0.06 + ((i * 7) % 3) * 0.025);
    g.add(mesh(BOX, material, [length * 0.07, h, length * 0.035], [length * (0.12 + i * 0.1), -length * 0.045 - h / 2, 0]));
  }
  return g;
}

// ------------------------------------------------------------------- models

const BUILDERS = {
  // Your phone: 8% battery, and the one alarm you ever set.
  phone() {
    const g = new THREE.Group();
    g.add(mesh(BOX, mat(0x1b1d22, { shiny: 60 }), [0.074, 0.155, 0.009]));
    const screen = texture(128, 256, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1b2a55");
      grad.addColorStop(1, "#51235e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText("6:07", w / 2, 78);
      ctx.font = "13px sans-serif";
      ctx.fillText("Thu, after hours", w / 2, 100);
      ctx.fillStyle = "#ff5a4e";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("8% · Battery low", w / 2, 18);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(10, 150, w - 20, 44);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("Mummy (14 missed calls)", w / 2, 168);
      ctx.font = "11px sans-serif";
      ctx.fillText("Beta, kab aa rahe ho?", w / 2, 184);
    });
    g.add(mesh(BOX, new THREE.MeshBasicMaterial({ map: screen }), [0.068, 0.146, 0.001], [0, 0, 0.0046]));
    g.add(mesh(BOX, BLACK(), [0.018, 0.022, 0.003], [-0.02, 0.058, -0.005]));
    return g;
  },

  visiting_card() {
    const front = texture(256, 156, (ctx, w, h) => {
      ctx.fillStyle = "#fbf8ef";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#12306b";
      ctx.fillRect(0, 0, 18, h);
      ctx.fillStyle = "#f2b632";
      ctx.fillRect(18, 0, 4, h);
      ctx.fillStyle = "#12306b";
      ctx.font = "bold 22px Georgia, serif";
      ctx.fillText("R. SHARMA", 36, 46);
      ctx.font = "italic 14px Georgia, serif";
      ctx.fillText("Assistant Manager", 36, 68);
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("BHARATIYA JUGAAD BANK", 36, 108);
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#555";
      ctx.fillText("Main Branch · Ph: 98•••• 4210", 36, 126);
    });
    return card(0.09, 0.055, front);
  },

  id_card() {
    const g = new THREE.Group();
    const front = texture(160, 256, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#12306b";
      ctx.fillRect(0, 0, w, 52);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("BJB · STAFF", w / 2, 32);
      ctx.fillStyle = "#b9c2cf";
      ctx.fillRect(45, 66, 70, 84);
      ctx.fillStyle = "#6b7686";
      ctx.beginPath();
      ctx.arc(80, 98, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(56, 120, 48, 30);
      ctx.fillStyle = "#111";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText("V. VERMA", w / 2, 176);
      ctx.font = "12px sans-serif";
      ctx.fillText("Cashier · EMP 0231", w / 2, 194);
      for (let x = 30; x < 130; x += 3) {
        ctx.fillRect(x, 212, (x * 7) % 3 === 0 ? 2 : 1, 28);
      }
    });
    g.add(card(0.054, 0.086, front, 0xffffff));
    // Lanyard: a red strap going up in a V to a clip.
    const strap = mat(0xb3261e);
    g.add(mesh(BOX, strap, [0.012, 0.09, 0.0015], [-0.018, 0.085, 0], [0, 0, -0.35]));
    g.add(mesh(BOX, strap, [0.012, 0.09, 0.0015], [0.018, 0.085, 0], [0, 0, 0.35]));
    g.add(mesh(BOX, STEEL(), [0.012, 0.012, 0.004], [0, 0.047, 0]));
    return g;
  },

  atm_card() {
    const front = texture(256, 162, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#0e2a5c");
      grad.addColorStop(1, "#1f6b8f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e0b64a";
      ctx.fillRect(26, 52, 38, 30);
      ctx.strokeStyle = "#9a7a22";
      ctx.strokeRect(34, 58, 22, 18);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("BJB DEBIT", 26, 34);
      ctx.font = "18px monospace";
      ctx.fillText("4532 •••• •••• 2019", 26, 112);
      ctx.font = "10px sans-serif";
      ctx.fillText("VALID THRU", 26, 132);
      ctx.font = "bold 13px monospace";
      ctx.fillText("07/19  EXPIRED", 90, 133);
      ctx.fillText("R SHARMA", 26, 152);
    });
    return card(0.0856, 0.054, front, 0x1a2e4a);
  },

  steel_ruler() {
    const face = texture(512, 48, (ctx, w, h) => {
      ctx.fillStyle = "#c9ced3";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1c1c1c";
      for (let mm = 0; mm <= 300; mm += 1) {
        const x = 8 + mm * 1.64;
        const len = mm % 10 === 0 ? 18 : mm % 5 === 0 ? 12 : 7;
        ctx.fillRect(x, 0, 1, len);
        if (mm % 10 === 0) {
          ctx.font = "10px sans-serif";
          ctx.fillText(String(mm / 10), x - 3, 30);
        }
      }
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("STAINLESS · 30 cm · MADE IN INDIA", 180, 44);
    });
    const edge = STEEL();
    return new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.028, 0.0012), [edge, edge, edge, edge, new THREE.MeshPhongMaterial({ map: face, shininess: 90, specular: 0x888888 }), edge]);
  },

  butter_knife() {
    const g = new THREE.Group();
    const steel = STEEL();
    g.add(mesh(BOX, steel, [0.1, 0.019, 0.0018], [0.05, 0, 0]));
    g.add(mesh(CYL, steel, [0.019, 0.0018, 0.019], [0.1, 0, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(BOX, steel, [0.012, 0.012, 0.005], [-0.004, -0.002, 0]));
    g.add(mesh(BOX, steel, [0.1, 0.016, 0.008], [-0.06, -0.004, 0]));
    g.add(mesh(CYL, steel, [0.016, 0.008, 0.016], [-0.11, -0.004, 0], [Math.PI / 2, 0, 0]));
    return g;
  },

  umbrella() {
    const g = new THREE.Group();
    // Closed and furled: widest in the middle, a ferrule at the tip.
    const cloth = mat(0x15161a, { shiny: 10 });
    g.add(lathe([[0.003, 0], [0.02, 0.06], [0.036, 0.2], [0.042, 0.34], [0.03, 0.5], [0.009, 0.57]], cloth));
    g.add(mesh(CYL, STEEL(), [0.007, 0.05, 0.007], [0, -0.02, 0]));
    g.add(mesh(CYL, mat(0x9b2c2c), [0.087, 0.012, 0.087], [0, 0.32, 0])); // the strap
    g.add(mesh(CYL, DARK_STEEL(), [0.011, 0.14, 0.011], [0, 0.64, 0]));
    // The crook handle — the whole reason it is here.
    const wood = mat(0x6b3f22, { shiny: 30 });
    const crook = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 10, 20, Math.PI), wood);
    crook.position.set(-0.038, 0.72, 0);
    g.add(crook);
    g.add(mesh(CYL, wood, [0.022, 0.05, 0.022], [0, 0.71, 0]));
    g.add(mesh(SPH, wood, [0.022, 0.022, 0.022], [-0.076, 0.72, 0]));
    g.position.y = -0.36;
    return wrap(g);
  },

  broom() {
    const g = new THREE.Group();
    // Phool jhaadu: a flat fan of grass, bound tight into a taped handle.
    const grass = mat(0xc7ad6e);
    const fan = lathe([[0.004, 0], [0.09, 0.02], [0.1, 0.12], [0.07, 0.32], [0.03, 0.5], [0.022, 0.56]], grass, 16);
    fan.scale.z = 0.35;
    g.add(fan);
    const strands = mat(0xb39a5c);
    for (let i = 0; i < 9; i += 1) {
      const x = -0.09 + i * 0.022;
      g.add(mesh(CYL, strands, [0.004, 0.08, 0.004], [x, -0.03, (i % 3 - 1) * 0.008], [0, 0, x * 1.4]));
    }
    const tape = [mat(0xb3261e), mat(0x1f4f8f), mat(0xb3261e)];
    g.add(mesh(CYL, mat(0x8a6a3a), [0.036, 0.36, 0.036], [0, 0.72, 0]));
    tape.forEach((m, i) => g.add(mesh(CYL, m, [0.04, 0.05, 0.04], [0, 0.6 + i * 0.1, 0])));
    g.position.y = -0.45;
    return wrap(g);
  },

  hairpin() {
    // A black bobby pin: one straight leg, one wavy, a U at the top.
    const black = mat(0x1a1a1a, { shiny: 60 });
    const points = [
      [0, 0], [0.03, 0], [0.058, 0],
      ...arc(0.058, 0.0022, 0.0022, -Math.PI / 2, Math.PI / 2, 5),
      [0.048, 0.0048], [0.04, 0.0034], [0.032, 0.0052], [0.024, 0.0036], [0.016, 0.0054], [0.006, 0.0042], [0, 0.006],
    ];
    const pin = wire(points, 0.0007, black);
    pin.position.set(-0.03, -0.003, 0);
    return wrap(pin);
  },

  safety_pin() {
    const g = new THREE.Group();
    const steel = STEEL();
    const pts = [[0.004, 0.0065], [0.02, 0.0062], [0.04, 0.0058], ...arc(0.046, 0.0033, 0.0033, Math.PI / 2, -Math.PI * 1.5 + 0.2, 10), [0.03, 0.0005], [0.005, 0]];
    g.add(wire(pts, 0.0006, steel));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.0033, 0.0006, 6, 16), steel);
    coil.position.set(0.046, 0.0033, 0);
    g.add(coil);
    g.add(mesh(BOX, steel, [0.008, 0.009, 0.0035], [0.002, 0.0035, 0]));
    g.position.x = -0.025;
    return wrap(g);
  },

  paperclip() {
    // The classic nested loops, 33mm of bent steel wire.
    const s = 0.001;
    const pts = [
      [6, 1.5],
      [26, 1.5], ...arc(26, 5.5, 4, -Math.PI / 2, Math.PI / 2, 8),
      [3, 9.5], ...arc(3, 6, 3.5, Math.PI / 2, Math.PI * 1.5, 8),
      [24, 2.5], ...arc(24, 5, 2.5, -Math.PI / 2, Math.PI / 2, 6),
      [9, 7.5],
    ].map(([x, y]) => [x * s - 0.016, y * s - 0.0055]);
    return wrap(wire(pts, 0.00045, STEEL()));
  },

  scissors() {
    const g = new THREE.Group();
    const steel = STEEL();
    const blade = new THREE.Shape();
    blade.moveTo(0, -0.004);
    blade.lineTo(0.1, -0.001);
    blade.lineTo(0.1, 0.0005);
    blade.lineTo(0, 0.005);
    blade.lineTo(0, -0.004);
    const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.0018, bevelEnabled: false });
    for (const [angle, z] of [[0.12, 0.001], [-0.12, -0.001]]) {
      const b = new THREE.Mesh(bladeGeo, steel);
      b.rotation.z = angle;
      b.position.z = z;
      g.add(b);
    }
    g.add(mesh(CYL, DARK_STEEL(), [0.006, 0.006, 0.006], [0, 0, 0], [Math.PI / 2, 0, 0]));
    // Orange plastic handles.
    const plastic = mat(0xe8742a, { shiny: 30 });
    for (const [y, sx] of [[0.018, 1], [-0.02, 1.35]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.004, 8, 20), plastic);
      ring.scale.x = sx;
      ring.position.set(-0.03, y, 0);
      g.add(ring);
      g.add(mesh(BOX, plastic, [0.022, 0.006, 0.005], [-0.012, y * 0.55, 0], [0, 0, -y * 12]));
    }
    g.position.x = -0.03;
    return wrap(g);
  },

  can() {
    const g = new THREE.Group();
    const label = texture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#b1121b";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.moveTo(0, 90);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, 84 + Math.sin(x / 20) * 8);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "900 30px Impact, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TOOFAN", 64, 48);
      ctx.fillText("TOOFAN", 192, 48);
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("COLA · 300 ml", 64, 68);
      ctx.fillText("COLA · 300 ml", 192, 68);
      ctx.fillStyle = "#f2b632";
      ctx.fillRect(0, 76, w, 3);
    });
    const alu = STEEL();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.106, 28, 1, true), new THREE.MeshPhongMaterial({ map: label, shininess: 70, specular: 0x777777 }));
    g.add(body);
    g.add(lathe([[0.033, 0.053], [0.028, 0.06], [0.026, 0.062], [0, 0.062]], alu));
    g.add(lathe([[0, -0.061], [0.026, -0.061], [0.033, -0.053]], alu));
    // The ring pull, and the dark mouth it opened.
    g.add(mesh(CYL, mat(0x111111), [0.012, 0.001, 0.008], [0, 0.0625, 0.008]));
    g.add(mesh(BOX, alu, [0.006, 0.001, 0.018], [0, 0.063, -0.004]));
    return g;
  },

  coconut_oil() {
    const g = new THREE.Group();
    const plastic = mat(0x2c6fcf, { shiny: 60, transparent: true, opacity: 0.55 });
    g.add(lathe([[0, -0.08], [0.028, -0.08], [0.03, -0.075], [0.03, 0.03], [0.022, 0.055], [0.012, 0.065], [0.012, 0.075]], plastic));
    // The oil inside, a little cloudy, about two-thirds full.
    g.add(lathe([[0, -0.078], [0.026, -0.078], [0.026, 0.01], [0, 0.01]], mat(0xf3e6a0, { transparent: true, opacity: 0.7 })));
    g.add(mesh(CYL, mat(0xf4f0e0, { shiny: 20 }), [0.03, 0.018, 0.03], [0, 0.083, 0]));
    const label = texture(256, 96, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1f7a3a";
      ctx.fillRect(0, 0, w, 10);
      ctx.fillRect(0, h - 10, w, 10);
      // A palm tree.
      ctx.fillStyle = "#6b4a2a";
      ctx.fillRect(34, 40, 5, 42);
      ctx.fillStyle = "#1f7a3a";
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.ellipse(36, 38, 22, 5, -0.9 + i * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#12306b";
      ctx.font = "bold 22px Georgia, serif";
      ctx.fillText("Shuddh", 74, 44);
      ctx.fillText("Nariyal Tel", 74, 70);
      ctx.font = "11px sans-serif";
      ctx.fillText("100% coconut · 200 ml", 74, 84);
    });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.05, 24, 1, true, -Math.PI * 0.55, Math.PI * 1.1), new THREE.MeshLambertMaterial({ map: label })));
    return g;
  },

  vaseline() {
    const g = new THREE.Group();
    g.add(mesh(CYL, mat(0xeeeeea, { shiny: 30 }), [0.062, 0.022, 0.062], [0, -0.004, 0]));
    const lid = texture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "#1f58a8";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("PETROLEUM", w / 2, 56);
      ctx.fillText("JELLY", w / 2, 78);
      ctx.font = "11px sans-serif";
      ctx.fillText("winter care · 50 g", w / 2, 98);
    });
    const blue = mat(0x1f58a8, { shiny: 40 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 28), [blue, new THREE.MeshPhongMaterial({ map: lid, shininess: 40 }), blue]);
    top.position.y = 0.012;
    g.add(top);
    // Shown lid-up, so the label faces the viewer.
    g.rotation.x = 0.9;
    return wrap(g);
  },

  achaar() {
    const g = new THREE.Group();
    // A steel dabba, lid off, full of mango pickle swimming in mustard oil.
    const steel = mat(0xd4d8dc, { shiny: 90 });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.055, 0.07, 28, 1, true), new THREE.MeshPhongMaterial({ color: 0xd4d8dc, shininess: 90, specular: 0x999999, side: THREE.DoubleSide })));
    g.add(mesh(CYL, steel, [0.11, 0.003, 0.11], [0, -0.035, 0]));
    g.add(mesh(CYL, mat(0xb8601a, { shiny: 80, transparent: true, opacity: 0.9 }), [0.112, 0.004, 0.112], [0, 0.022, 0]));
    const mango = [mat(0xe08a1e), mat(0xc4541a), mat(0xd9a032)];
    for (let i = 0; i < 12; i += 1) {
      const a = i * 2.4;
      const r = 0.012 + (i % 4) * 0.01;
      g.add(mesh(BOX, mango[i % 3], [0.016, 0.01, 0.012], [Math.cos(a) * r, 0.026 + (i % 2) * 0.004, Math.sin(a) * r], [i, i * 0.7, 0]));
    }
    // The lid, leaning against it.
    g.add(mesh(CYL, steel, [0.12, 0.012, 0.12], [0.075, 0.0, -0.02], [0, 0, 1.25]));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0025, 6, 20, Math.PI), steel);
    handle.position.set(0, 0.035, 0);
    g.add(handle);
    return g;
  },

  rubber_band() {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0017, 8, 32), mat(0xc98f5a, { shiny: 10 }));
    band.scale.set(1.2, 0.55, 1);
    return wrap(band);
  },

  drawer_key() {
    return wrap(key(0.05, BRASS()));
  },

  gate_key() {
    const g = new THREE.Group();
    g.add(key(0.08, DARK_STEEL(), { bowColor: 0x2b5f9e }));
    // A paper tag on a string: GRILL, in marker.
    const tagTex = texture(128, 64, (ctx, w, h) => {
      ctx.fillStyle = "#f3e7c1";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1a1a8a";
      ctx.font = "bold 30px 'Comic Sans MS', cursive";
      ctx.fillText("GRILL", 18, 44);
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.arc(10, 32, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    const tag = card(0.05, 0.025, tagTex, 0xf3e7c1);
    tag.position.set(-0.075, -0.03, 0);
    tag.rotation.z = -0.3;
    g.add(tag);
    g.add(wire([[-0.041, 0], [-0.06, -0.012], [-0.097, -0.026]], 0.0006, mat(0xeeeeee)));
    return wrap(g);
  },

  key_bunch() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0016, 8, 28), STEEL());
    g.add(ring);
    const kinds = [
      [0.06, BRASS(), null],
      [0.07, DARK_STEEL(), 0xb3261e],
      [0.05, STEEL(), null],
      [0.075, DARK_STEEL(), 0x1f4f8f],
      [0.055, BRASS(), 0x2f7a3a],
      [0.065, STEEL(), null],
    ];
    kinds.forEach(([length, material, bow], i) => {
      const k = key(length, material, { bowColor: bow });
      const a = -Math.PI / 2 + (i - 2.5) * 0.28;
      k.rotation.z = a;
      k.position.set(Math.cos(a) * (0.018 + length * 0.36), Math.sin(a) * (0.018 + length * 0.36), (i % 2) * 0.003 - 0.0015);
      g.add(k);
    });
    // The keychain: a red plastic tag with the branch code.
    const fobTex = texture(96, 128, (ctx, w, h) => {
      ctx.fillStyle = "#c62828";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("BJB", w / 2, 58);
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("MAIN", w / 2, 80);
      ctx.fillText("0147", w / 2, 98);
    });
    const fob = card(0.028, 0.038, fobTex, 0xc62828);
    fob.position.set(0.012, 0.035, 0.002);
    fob.rotation.z = -0.4;
    g.add(fob);
    return wrap(g);
  },

  fire_extinguisher() {
    const g = new THREE.Group();
    const red = mat(0xc4201a, { shiny: 70 });
    g.add(mesh(CYL, red, [0.15, 0.42, 0.15], [0, 0, 0]));
    g.add(mesh(SPH, red, [0.15, 0.08, 0.15], [0, 0.21, 0]));
    g.add(mesh(CYL, mat(0x222222), [0.155, 0.02, 0.155], [0, -0.205, 0]));
    const label = texture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#c4201a";
      ctx.textAlign = "center";
      ctx.font = "bold 26px sans-serif";
      ctx.fillText("FIRE", 70, 40);
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("अग्निशामक", 70, 66);
      ctx.fillStyle = "#111";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("ABC · 4 kg", 70, 94);
      ctx.font = "11px sans-serif";
      ctx.fillText("Refill due: 2016", 70, 114);
    });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0755, 0.0755, 0.14, 24, 1, true, -Math.PI * 0.55, Math.PI * 1.1), new THREE.MeshLambertMaterial({ map: label })));
    // Valve, handle, lever, gauge, hose and horn.
    const black = BLACK();
    g.add(mesh(CYL, DARK_STEEL(), [0.04, 0.05, 0.04], [0, 0.265, 0]));
    g.add(mesh(BOX, black, [0.12, 0.012, 0.03], [-0.03, 0.29, 0], [0, 0, 0.12]));
    g.add(mesh(BOX, black, [0.11, 0.01, 0.028], [-0.035, 0.31, 0], [0, 0, 0.3]));
    const gaugeTex = texture(64, 64, (ctx, w) => {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#c62828";
      ctx.beginPath();
      ctx.arc(32, 36, 20, Math.PI, Math.PI * 1.35);
      ctx.stroke();
      ctx.strokeStyle = "#2e7d32";
      ctx.beginPath();
      ctx.arc(32, 36, 20, Math.PI * 1.35, Math.PI * 1.7);
      ctx.stroke();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(32, 36);
      ctx.lineTo(18, 22);
      ctx.stroke();
      void w;
    });
    g.add(mesh(CYL, new THREE.MeshBasicMaterial({ map: gaugeTex }), [0.035, 0.01, 0.035], [0.012, 0.268, 0.026], [Math.PI / 2, 0, 0]));
    g.add(wire([[0.02, 0.27, 0], [0.07, 0.24, 0.01], [0.085, 0.1, 0.02], [0.08, -0.05, 0.03]], 0.008, black));
    g.add(mesh(CYL, black, [0.022, 0.05, 0.022], [0.078, -0.08, 0.03]));
    return g;
  },

  // Made with jugaad.
  pick_set() {
    const g = new THREE.Group();
    const black = mat(0x1a1a1a, { shiny: 60 });
    // The hairpin, straightened, with a tiny hook bent into the tip.
    g.add(wire([[-0.03, 0.003], [0.02, 0.003], [0.028, 0.003], [0.031, 0.006], [0.033, 0.009]], 0.0007, black));
    g.add(mesh(BOX, mat(0x2a2a2a), [0.012, 0.005, 0.003], [-0.034, 0.003, 0]));
    // The paperclip, bent into an L-shaped tension wrench.
    g.add(wire([[-0.028, -0.004], [0.012, -0.004], [0.015, -0.006], [0.015, -0.016]], 0.00045, STEEL()));
    return wrap(g);
  },

  crude_pick() {
    const g = new THREE.Group();
    const steel = STEEL();
    // The safety pin, opened out straight, still wearing its clasp.
    g.add(wire([[-0.025, 0.003], [0.02, 0.003], [0.026, 0.005]], 0.0006, steel));
    g.add(mesh(BOX, steel, [0.008, 0.009, 0.0035], [-0.027, 0.003, 0]));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.003, 0.0006, 6, 14), steel);
    coil.position.set(-0.018, 0.003, 0);
    g.add(coil);
    g.add(wire([[-0.028, -0.005], [0.012, -0.005], [0.015, -0.007], [0.015, -0.016]], 0.00045, steel));
    return wrap(g);
  },

  shim() {
    // A strip cut from the cola can and folded into an M: red print on one
    // side, bare aluminium on the other.
    const g = new THREE.Group();
    const printed = texture(64, 32, (ctx, w, h) => {
      ctx.fillStyle = "#b1121b";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = "900 14px Impact, sans-serif";
      ctx.fillText("OOFA", 8, 22);
    });
    const alu = STEEL();
    const face = new THREE.MeshLambertMaterial({ map: printed });
    const strip = (w, h, x, y, rz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.0005), [alu, alu, alu, alu, face, alu]);
      m.position.set(x, y, 0);
      m.rotation.z = rz;
      g.add(m);
    };
    strip(0.024, 0.036, 0, 0.006, 0);
    strip(0.012, 0.012, -0.006, -0.016, 0.5);
    strip(0.012, 0.012, 0.006, -0.016, -0.5);
    return wrap(g);
  },

  gulel() {
    const g = new THREE.Group();
    // A ruler for the arm, a rubber band for the sling, an eraser for the shot.
    const ruler = BUILDERS.steel_ruler();
    ruler.scale.set(0.7, 1, 1);
    ruler.rotation.z = Math.PI / 2;
    g.add(ruler);
    const band = mat(0xc98f5a);
    g.add(wire([[-0.012, 0.11, 0], [-0.006, 0.08, 0.02], [0, 0.06, 0.045]], 0.0022, band));
    g.add(wire([[0.012, 0.11, 0], [0.006, 0.08, 0.02], [0, 0.06, 0.045]], 0.0022, band));
    const eraser = new THREE.Group();
    eraser.add(mesh(BOX, mat(0xf2a3b3), [0.026, 0.016, 0.01], [0, 0, 0]));
    eraser.add(mesh(BOX, mat(0x2b5f9e), [0.011, 0.0162, 0.0102], [0.0075, 0, 0]));
    eraser.position.set(0, 0.058, 0.05);
    g.add(eraser);
    return wrap(g);
  },
};

// Wrap so a model's own transform is kept inside a parent the caller can
// freely position and rotate.
function wrap(object) {
  const g = new THREE.Group();
  g.add(object);
  return g;
}

// Items that should lie flat when dropped; the rest stand on their base.
const LIES_FLAT = new Set([
  "phone", "visiting_card", "id_card", "atm_card", "steel_ruler", "butter_knife", "umbrella", "broom", "hairpin",
  "safety_pin", "paperclip", "scissors", "rubber_band", "drawer_key", "gate_key", "key_bunch", "pick_set",
  "crude_pick", "shim", "gulel",
]);

// ------------------------------------------------------------------ public

const prototypes = new Map();

// Long, thin things (rulers, pins, the umbrella) are shown on the diagonal
// and allowed a bigger frame, or they vanish into a sliver.
const skinny = new Map();
function isSkinny(id) {
  if (!skinny.has(id)) {
    const dims = new THREE.Box3().setFromObject(itemModel(id)).getSize(new THREE.Vector3());
    const [a, b] = [dims.x, dims.y, dims.z].sort((p, q) => q - p);
    skinny.set(id, b / a < 0.35);
  }
  return skinny.get(id);
}

export function hasModel(id) {
  return Boolean(BUILDERS[id]);
}

// A fresh copy of an item's model, at real size, upright, facing +z.
export function itemModel(id) {
  if (!BUILDERS[id]) return null;
  let proto = prototypes.get(id);
  if (!proto) {
    proto = new THREE.Group();
    proto.add(BUILDERS[id]());
    prototypes.set(id, proto);
  }
  return proto.clone(true);
}

// The same, scaled and centred so its longest side is `size` metres.
export function fittedModel(id, size) {
  const model = itemModel(id);
  if (!model) return null;
  const box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const k = size / Math.max(dims.x, dims.y, dims.z, 1e-4);
  const inner = model;
  inner.position.sub(centre);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.scale.setScalar(k);
  return outer;
}

// Lying on the floor: flat things face-up, the rest stood on their base.
// Tiny things are shown a little larger than life so they can be found.
export function floorModel(id) {
  const model = itemModel(id);
  if (!model) return null;
  const holder = new THREE.Group();
  if (LIES_FLAT.has(id)) model.rotation.x = -Math.PI / 2;
  holder.add(model);
  const box = new THREE.Box3().setFromObject(holder);
  const dims = box.getSize(new THREE.Vector3());
  const k = Math.max(1, 0.1 / Math.max(dims.x, dims.z, 1e-4));
  holder.scale.setScalar(k);
  const scaled = new THREE.Box3().setFromObject(holder);
  const centre = scaled.getCenter(new THREE.Vector3());
  model.position.x -= centre.x / k;
  model.position.z -= centre.z / k;
  holder.position.y = -scaled.min.y + 0.002;
  const outer = new THREE.Group();
  outer.add(holder);
  return outer;
}

// ------------------------------------------------------------------- icons

// Each item rendered once, three-quarter view, to a transparent image for
// the bag. One small offscreen renderer does all of them.
const icons = new Map();
let iconKit = null;

export function itemIcon(id) {
  if (icons.has(id)) return icons.get(id);
  if (!BUILDERS[id]) return null;
  try {
    if (!iconKit) {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(128, 128, false);
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(1.5, 2, 2.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xbfd6ff, 1.2);
      rim.position.set(-2, 1, -1);
      scene.add(rim);
      const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 10);
      camera.position.set(0, 0, 1);
      iconKit = { renderer, scene, camera };
    }
    const { renderer, scene, camera } = iconKit;
    const thin = isSkinny(id);
    const model = fittedModel(id, thin ? 0.46 : 0.36);
    const pose = new THREE.Group();
    pose.add(model);
    pose.rotation.set(0.35, -0.55, thin ? 0.8 : LIES_FLAT.has(id) ? 0.25 : 0);
    scene.add(pose);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL("image/png");
    scene.remove(pose);
    icons.set(id, url);
    return url;
  } catch {
    icons.set(id, null);
    return null;
  }
}

// How an item sits in your right hand, first-person: longest side about
// 22cm, turned three-quarters towards you.
export function heldModel(id) {
  const thin = isSkinny(id);
  const model = fittedModel(id, thin ? 0.3 : 0.22);
  if (!model) return null;
  const hold = new THREE.Group();
  hold.add(model);
  model.rotation.set(0.25, -0.65, thin ? 0.9 : LIES_FLAT.has(id) ? 0.35 : 0.05);
  return hold;
}
