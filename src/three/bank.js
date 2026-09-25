// Bharatiya Jugaad Bank, in three dimensions.
//
// Built entirely from shared/bank-map.js: every wall cell becomes a wall,
// every piece of furniture in the plan becomes a desk or an almirah here. So
// what you bump into is always what you see.
//
// Static geometry is batched into one InstancedMesh per (shape, material) —
// a few dozen draw calls for the whole branch rather than a thousand. The
// handful of things that change (the umbrella leaving its stand, Sir's keys
// appearing on his desk, the fans, the wall clock) are ordinary meshes.
//
// No binary assets: every texture is drawn on a canvas.

import * as THREE from "three";
import { TILE, U, WALL_H, W, H, GRID, FURNITURE } from "../../shared/bank-map.js";
import { itemModel } from "./items.js";

export const TS = TILE * U; // 0.75m per cell

const cx = (cells) => cells * TS; // cell coordinate → metres

// ------------------------------------------------------------------ textures

function canvasTexture(w, h, draw, { repeat = null, nearest = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (nearest) {
    texture.magFilter = THREE.NearestFilter;
  }
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

function speckle(ctx, w, h, count, colors, size = 1) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

// Text on a canvas, for signs and posters. Lines are [text, size, color, weight].
export function signTexture(w, h, bg, lines, { border = null, font = "Georgia, serif" } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = Math.max(4, w / 60);
      ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
    }
    const total = lines.reduce((n, l) => n + l[1] * 1.25, 0);
    let y = (h - total) / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const [text, size, color, weight = "bold", face = font] of lines) {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${face}`;
      ctx.fillText(text, w / 2, y, w * 0.92);
      y += size * 1.25;
    }
  });
}

// ------------------------------------------------------------------ batching

// Collects boxes, cylinders and spheres by material, then builds one
// InstancedMesh per bucket.
class Batch {
  constructor() {
    this.buckets = new Map();
    this.geometries = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
      sph: new THREE.SphereGeometry(0.5, 14, 10),
    };
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.pos = new THREE.Vector3();
    this.scale = new THREE.Vector3();
  }

  add(kind, material, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
    const key = `${kind}|${material.uuid}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { kind, material, matrices: [] };
      this.buckets.set(key, bucket);
    }
    this.euler.set(rx, ry, rz, "YXZ");
    this.quat.setFromEuler(this.euler);
    this.pos.set(x, y, z);
    this.scale.set(sx, sy, sz);
    bucket.matrices.push(new THREE.Matrix4().compose(this.pos, this.quat, this.scale));
  }

  box(material, x, y, z, sx, sy, sz, ry = 0) {
    this.add("box", material, x, y, z, sx, sy, sz, ry);
  }

  build(group) {
    for (const bucket of this.buckets.values()) {
      const mesh = new THREE.InstancedMesh(this.geometries[bucket.kind], bucket.material, bucket.matrices.length);
      bucket.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  dispose() {
    for (const g of Object.values(this.geometries)) g.dispose();
  }
}

// ---------------------------------------------------------------------- world

export class BankWorld {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
    this.fans = [];
    this.people = [];
    this.props = {}; // container id → mesh that disappears when emptied
    this.batch = new Batch();
    this.buildMaterials();
    this.buildShell();
    this.buildFurniture();
    this.buildDecor();
    this.buildPeople();
    this.resignationLetter();
    this.buildLights();
    this.buildStreet();
    this.batch.build(this.group);
  }

  own(thing) {
    this.disposables.push(thing);
    return thing;
  }

  mat(color, extra = {}) {
    return this.own(new THREE.MeshLambertMaterial({ color, ...extra }));
  }

  buildMaterials() {
    // Vitrified floor tiles: beige, 60cm, with a faint speckle and grout.
    const floor = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "#d8cdb6";
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 900, ["rgba(150,130,100,0.25)", "rgba(255,255,255,0.3)", "rgba(120,100,80,0.18)"], 2);
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = `rgba(${170 + i * 10},${150 + i * 8},${120},0.12)`;
        ctx.fillRect((i % 2) * 64, Math.floor(i / 2) * 64, 64, 64);
      }
      ctx.fillStyle = "#a89c86";
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, 0, 2, h);
      ctx.fillRect(0, 63, w, 2);
      ctx.fillRect(63, 0, 2, h);
    }, { repeat: [(W * TS) / 1.2, (H * TS) / 1.2] });

    // Small white bathroom and pantry tiles.
    const smallTiles = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = "#e9ecea";
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 120, ["rgba(150,160,160,0.25)"], 1);
      ctx.fillStyle = "#b9c0bd";
      for (let i = 0; i < w; i += 16) {
        ctx.fillRect(i, 0, 1, h);
        ctx.fillRect(0, i, w, 1);
      }
    }, { repeat: [4, 4] });

    // Walls: government cream above, a dado of institutional green below,
    // a brown skirting line, and the grubby band where chairs hit.
    const wall = canvasTexture(32, 128, (ctx, w, h) => {
      ctx.fillStyle = "#e9dfc3";
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h * 0.66, 90, ["rgba(170,150,110,0.14)"], 1);
      ctx.fillStyle = "#8aa38a";
      ctx.fillRect(0, h * 0.66, w, h * 0.34);
      speckle(ctx, w, h, 60, ["rgba(60,80,60,0.18)"], 1);
      ctx.fillStyle = "#6c5a44";
      ctx.fillRect(0, h * 0.655, w, 2);
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = "rgba(90,80,60,0.12)";
      ctx.fillRect(0, h * 0.58, w, 6);
    });

    const ceiling = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = "#efece4";
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 300, ["rgba(160,150,130,0.25)"], 1);
      ctx.fillStyle = "#c9c3b5";
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, 0, 2, h);
    }, { repeat: [(W * TS) / 0.6, (H * TS) / 0.6] });

    const wood = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = "#8a5a36";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 1) {
        ctx.fillStyle = `rgba(${60 + Math.random() * 30},${35 + Math.random() * 20},20,${0.15 + Math.random() * 0.2})`;
        ctx.fillRect(0, y, w, 1);
      }
    });

    const doorWood = canvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = "#6b3f22";
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 1) {
        ctx.fillStyle = `rgba(40,20,10,${0.1 + Math.random() * 0.2})`;
        ctx.fillRect(x, 0, 1, h);
      }
      ctx.strokeStyle = "rgba(30,15,5,0.7)";
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, w - 16, h * 0.42);
      ctx.strokeRect(8, h * 0.52, w - 16, h * 0.4);
    });

    this.textures = { floor, smallTiles, wall, ceiling, wood, doorWood };
    Object.values(this.textures).forEach((t) => this.own(t));

    this.m = {
      wall: this.mat(0xffffff, { map: wall }),
      plaster: this.mat(0xe9dfc3),
      floor: this.mat(0xffffff, { map: floor }),
      tiles: this.mat(0xffffff, { map: smallTiles }),
      ceiling: this.mat(0xffffff, { map: ceiling }),
      wood: this.mat(0xffffff, { map: wood }),
      darkWood: this.mat(0x9b7a60, { map: wood }),
      doorWood: this.mat(0xffffff, { map: doorWood }),
      laminate: this.mat(0xcbb58f),
      steel: this.mat(0x7f8b86),
      godrej: this.mat(0x6f7f76),
      darkSteel: this.mat(0x3c4144),
      chrome: this.mat(0xb8bcbf),
      black: this.mat(0x1b1c1e),
      maroon: this.mat(0x5a1d22),
      navy: this.mat(0x1f2c45),
      beige: this.mat(0xd9d0bb),
      white: this.mat(0xf1f1ec),
      paper: this.mat(0xf6f3e8),
      red: this.mat(0xb3261e),
      blue: this.mat(0x3b6fb6),
      green: this.mat(0x3c7b3f),
      leaf: this.mat(0x2f6e2c),
      terracotta: this.mat(0xa4532f),
      granite: this.mat(0x2f2a28),
      skin: this.mat(0xb07a55),
      clothRed: this.mat(0xa8322a),
      fileBlue: this.mat(0x2b5f9e),
      fileKhaki: this.mat(0xc4a86a),
      fileRed: this.mat(0x9b2c2c),
      screen: this.mat(0x1d3a36, { emissive: 0x16302a }),
      tube: this.own(new THREE.MeshBasicMaterial({ color: 0xf8fbff })),
      glass: this.own(
        new THREE.MeshLambertMaterial({ color: 0xbfd8dc, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      ),
      frosted: this.own(
        new THREE.MeshLambertMaterial({ color: 0xe8f0f0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      ),
      aluminium: this.mat(0xa9aeb0),
      asphalt: this.mat(0x1a1b1f),
    };
  }

  // Floor, ceiling, walls, glass and the counter.
  buildShell() {
    const b = this.batch;
    const width = W * TS;
    const depth = H * TS;

    const floor = new THREE.Mesh(this.own(new THREE.PlaneGeometry(width, depth)), this.m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(width / 2, 0, depth / 2);
    this.group.add(floor);
    // Wet rooms get their own tiles.
    for (const [x0, y0, x1, y1] of [[1, 31, 10, 39], [24, 31, 33, 39]]) {
      const tiles = new THREE.Mesh(this.own(new THREE.PlaneGeometry((x1 - x0) * TS, (y1 - y0) * TS)), this.m.tiles);
      tiles.rotation.x = -Math.PI / 2;
      tiles.position.set(cx((x0 + x1) / 2), 0.004, cx((y0 + y1) / 2));
      this.group.add(tiles);
    }

    const ceiling = new THREE.Mesh(this.own(new THREE.PlaneGeometry(width, depth)), this.m.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(width / 2, WALL_H, depth / 2);
    this.group.add(ceiling);

    const open = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      return GRID[y][x] !== "#";
    };
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const ch = GRID[y][x];
        if (ch === "#") {
          let exposed = false;
          for (let dy = -1; dy <= 1 && !exposed; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (open(x + dx, y + dy)) exposed = true;
          // The front wall is seen from the street too.
          if (y === 0) exposed = true;
          if (exposed) b.box(this.m.wall, cx(x + 0.5), WALL_H / 2, cx(y + 0.5), TS, WALL_H, TS);
        } else if (ch === "g") {
          this.glassCell(x, y);
        } else if (ch === "c") {
          // Teller counter: a panelled front, a granite top, and a glass
          // screen with a speaking gap above.
          b.box(this.m.laminate, cx(x + 0.5), 0.52, cx(y + 0.5), TS, 1.04, TS * 0.7);
          b.box(this.m.granite, cx(x + 0.5), 1.06, cx(y + 0.5), TS, 0.04, TS * 0.95);
          b.box(this.m.glass, cx(x + 0.5), 1.62, cx(y + 0.3), TS * 0.98, 0.9, 0.02);
          b.box(this.m.aluminium, cx(x + 0.5), 2.09, cx(y + 0.3), TS, 0.05, 0.05);
          if (x % 3 === 0) b.box(this.m.aluminium, cx(x), 1.6, cx(y + 0.3), 0.04, 1.0, 0.05);
        } else if (ch === "S" || ch === "G" || ch === "W") {
          // Door lintels: a strip of wall over each opening.
          const lintelFrom = ch === "S" ? 2.9 : ch === "G" ? 2.7 : 2.62;
          b.box(this.m.plaster, cx(x + 0.5), (WALL_H + lintelFrom) / 2, cx(y + 0.5), TS, WALL_H - lintelFrom, TS);
        }
      }
    }
  }

  glassCell(x, y) {
    const b = this.batch;
    const isGlass = (tx, ty) => GRID[ty]?.[tx] === "g" || GRID[ty]?.[tx] === "#";
    const alongX = isGlass(x - 1, y) || isGlass(x + 1, y);
    const alongY = isGlass(x, y - 1) || isGlass(x, y + 1);
    const horizontal = alongX && !(alongY && !alongX);
    const px = cx(x + 0.5);
    const pz = cx(y + 0.5);
    const sx = horizontal ? TS : 0.02;
    const sz = horizontal ? 0.02 : TS;
    b.box(this.m.glass, px, 1.5, pz, sx, 2.7, sz);
    // A frosted band at eye height, as every cabin in India has — it hides
    // nothing, but it makes the glass read as glass.
    b.box(this.m.frosted, px, 1.45, pz, horizontal ? TS : 0.025, 0.28, horizontal ? 0.025 : TS);
    const rail = (y0) => b.box(this.m.aluminium, px, y0, pz, horizontal ? TS : 0.06, 0.05, horizontal ? 0.06 : TS);
    rail(0.1);
    rail(2.85);
    rail(0.95);
    if ((horizontal ? x : y) % 2 === 0) {
      b.box(this.m.aluminium, horizontal ? cx(x) : px, 1.5, horizontal ? pz : cx(y), 0.05, 3, 0.05);
    }
  }

  // ------------------------------------------------------------- furniture

  buildFurniture() {
    for (const f of FURNITURE) {
      const builder = this[`f_${f.type}`];
      if (!builder) continue;
      const box = {
        x0: cx(f.x),
        z0: cx(f.y),
        x1: cx(f.x + f.w),
        z1: cx(f.y + f.h),
        cx: cx(f.x + f.w / 2),
        cz: cx(f.y + f.h / 2),
        w: f.w * TS,
        d: f.h * TS,
      };
      builder.call(this, box, f);
    }
  }

  // A desk with chairs to the south. Pedestal of drawers on the east end.
  f_desk(o, f) {
    const b = this.batch;
    const h = 0.76;
    b.box(this.m.wood, o.cx, h, o.cz, o.w, 0.04, o.d);
    b.box(this.m.laminate, o.x0 + 0.03, h / 2, o.cz, 0.04, h, o.d * 0.95);
    b.box(this.m.laminate, o.cx - 0.2, h * 0.55, o.z0 + 0.04, o.w - 0.5, h * 0.7, 0.03);
    // Drawer pedestal
    b.box(this.m.laminate, o.x1 - 0.24, h / 2, o.cz, 0.46, h, o.d * 0.9);
    for (let i = 0; i < 3; i += 1) {
      b.box(this.m.beige, o.x1 - 0.24, 0.14 + i * 0.22, o.z1 - 0.02, 0.42, 0.18, 0.02);
      b.box(this.m.chrome, o.x1 - 0.24, 0.2 + i * 0.22, o.z1 - 0.005, 0.12, 0.02, 0.02);
    }
    // An old beige CRT, a keyboard, and the file stacks every desk has.
    b.box(this.m.beige, o.cx - 0.1, h + 0.2, o.z0 + 0.3, 0.42, 0.36, 0.4);
    b.box(this.m.screen, o.cx - 0.1, h + 0.21, o.z0 + 0.505, 0.33, 0.26, 0.01);
    b.box(this.m.beige, o.cx - 0.1, h + 0.03, o.z0 + 0.62, 0.44, 0.03, 0.16);
    const stacks = [this.m.fileKhaki, this.m.fileBlue, this.m.fileRed, this.m.paper];
    const hash = Math.floor(f.id.length + f.x * 7 + f.y * 3);
    for (let i = 0; i < 3; i += 1) {
      b.box(stacks[(hash + i) % stacks.length], o.x0 + 0.3, h + 0.04 + i * 0.05, o.z0 + 0.28 + (i % 2) * 0.03, 0.34, 0.045, 0.26, i * 0.1);
    }
    b.box(this.m.darkSteel, o.x1 - 0.35, h + 0.06, o.z0 + 0.22, 0.08, 0.12, 0.08);
  }

  // On your desk, where you can see it every time you sit down: the letter.
  resignationLetter() {
    const texture = this.own(canvasTexture(256, 340, (ctx, w, h) => {
      ctx.fillStyle = "#fbf8ef";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1c2a55";
      ctx.textAlign = "left";
      const line = (text, y, size = 13, weight = "normal") => {
        ctx.font = `${weight} ${size}px Georgia, serif`;
        ctx.fillText(text, 18, y, w - 30);
      };
      line("To,", 30);
      line("The Branch Manager,", 48);
      line("Bharatiya Jugaad Bank", 66);
      line("Sub: RESIGNATION —", 100, 15, "bold");
      line("with IMMEDIATE effect", 120, 15, "bold");
      line("Sir,", 152);
      line("Six years. No more.", 174);
      line("Notice period: please adjust", 196);
      line("against my 43 pending leaves.", 214);
      line("I am going home.", 244, 14, "bold");
      ctx.font = "italic 20px 'Brush Script MT', cursive";
      ctx.fillText("R. Sharma", 130, 300);
      ctx.strokeStyle = "rgba(28,42,85,0.6)";
      ctx.beginPath();
      ctx.moveTo(120, 306);
      ctx.lineTo(236, 302);
      ctx.stroke();
    }));
    const paper = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.21, 0.28)), this.own(new THREE.MeshLambertMaterial({ map: texture })));
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.12;
    paper.position.set(cx(10.3), 0.785, cx(24.75));
    this.group.add(paper);
    this.letter = paper;
  }

  f_tellerDesk(o, f) {
    this.f_desk(o, f);
    // The cash-counting machine lives on the middle counter.
    if (f.id === "teller-2") {
      const b = this.batch;
      b.box(this.m.darkSteel, o.cx + 0.35, 0.86, o.cz, 0.3, 0.2, 0.28);
      b.box(this.m.screen, o.cx + 0.35, 0.93, o.cz + 0.145, 0.12, 0.05, 0.01);
    }
  }

  // Office chairs face north, towards their desk.
  f_chair(o, f) {
    const b = this.batch;
    const seat = f.id.startsWith("teller") || f.id.startsWith("chair") ? this.m.maroon : this.m.navy;
    b.add("cyl", this.m.black, o.cx, 0.22, o.cz, 0.06, 0.4, 0.06);
    b.add("cyl", this.m.black, o.cx, 0.04, o.cz, 0.5, 0.05, 0.5);
    b.box(seat, o.cx, 0.46, o.cz, 0.46, 0.08, 0.44);
    const back = f.id === "visitor-chair" ? -1 : 1;
    b.box(seat, o.cx, 0.78, o.cz + back * 0.22, 0.44, 0.5, 0.06);
  }

  f_bossChair(o) {
    const b = this.batch;
    // High-backed, black, and facing west over the office.
    const x = cx(28.4);
    const z = cx(22);
    b.add("cyl", this.m.black, x, 0.22, z, 0.07, 0.4, 0.07);
    b.add("cyl", this.m.chrome, x, 0.04, z, 0.6, 0.05, 0.6);
    b.box(this.m.black, x, 0.48, z, 0.58, 0.12, 0.56);
    b.box(this.m.black, x + 0.3, 0.98, z, 0.1, 1.0, 0.58);
    b.box(this.m.black, x, 0.66, z - 0.3, 0.44, 0.06, 0.06);
    b.box(this.m.black, x, 0.66, z + 0.3, 0.44, 0.06, 0.06);
    void o;
  }

  f_almirah(o, f) {
    const b = this.batch;
    const h = f.id === "stationery" ? 1.85 : 1.98;
    b.box(this.m.godrej, o.cx, h / 2, o.cz, o.w, h, o.d);
    // The seam between the doors and a handle, on whichever face is the front.
    const facing = f.facing || "south";
    const front = {
      south: [o.cx, o.z1 + 0.005, 0.02, 0.012],
      north: [o.cx, o.z0 - 0.005, 0.02, 0.012],
      east: [o.x1 + 0.005, o.cz, 0.012, 0.02],
      west: [o.x0 - 0.005, o.cz, 0.012, 0.02],
    }[facing];
    const [fx, fz, sx, sz] = front;
    b.box(this.m.darkSteel, fx, h / 2, fz, sx === 0.02 ? 0.012 : sx, h * 0.96, sz === 0.02 ? 0.012 : sz);
    const along = facing === "south" || facing === "north";
    b.box(this.m.chrome, along ? fx + 0.06 : fx, h * 0.52, along ? fz : fz + 0.06, along ? 0.03 : 0.03, 0.16, 0.03);
    b.box(this.m.godrej, o.cx, 0.04, o.cz, o.w * 1.02, 0.08, o.d * 1.02);
  }

  f_photocopier(o) {
    const b = this.batch;
    b.box(this.m.beige, o.cx, 0.45, o.cz, o.w * 0.9, 0.9, o.d * 0.85);
    b.box(this.m.darkSteel, o.cx, 0.93, o.cz, o.w * 0.9, 0.06, o.d * 0.85);
    b.box(this.m.screen, o.cx + 0.3, 0.97, o.cz + 0.25, 0.2, 0.02, 0.1);
    b.box(this.m.paper, o.cx - 0.45, 0.6, o.cz, 0.24, 0.02, 0.3);
    b.box(this.m.paper, o.cx - 0.45, 0.63, o.cz, 0.24, 0.02, 0.3);
  }

  f_bossDesk(o) {
    const b = this.batch;
    const h = 0.78;
    b.box(this.m.darkWood, o.cx, h, o.cz, o.w + 0.1, 0.06, o.d + 0.1);
    b.box(this.m.darkWood, o.x0 + 0.03, h / 2, o.cz, 0.05, h, o.d);
    b.box(this.m.darkWood, o.cx, h / 2, o.z0 + 0.03, o.w, h, 0.05);
    b.box(this.m.darkWood, o.cx, h / 2, o.z1 - 0.03, o.w, h, 0.05);
    // Glass top, the Indian manager's desk signature.
    b.box(this.m.glass, o.cx, h + 0.035, o.cz, o.w + 0.08, 0.008, o.d + 0.08);
    // Monitor facing him (east), a landline, a calling bell, files.
    b.box(this.m.black, o.cx + 0.05, h + 0.25, o.cz - 0.2, 0.06, 0.34, 0.5);
    b.box(this.m.screen, o.cx + 0.085, h + 0.25, o.cz - 0.2, 0.01, 0.28, 0.44);
    b.box(this.m.black, o.cx + 0.1, h + 0.06, o.cz + 0.5, 0.2, 0.08, 0.24);
    b.add("sph", this.m.chrome, o.cx - 0.2, h + 0.05, o.cz + 0.2, 0.09, 0.07, 0.09);
    b.box(this.m.fileRed, o.cx - 0.1, h + 0.06, o.cz - 0.85, 0.3, 0.08, 0.24);
    b.box(this.m.fileKhaki, o.cx - 0.1, h + 0.13, o.cz - 0.85, 0.3, 0.06, 0.24);
    // Pen stand and calendar, on the visitor's side where you can reach them.
    b.add("cyl", this.m.darkSteel, o.x0 + 0.12, h + 0.08, cx(21), 0.08, 0.14, 0.08);
    b.box(this.m.paper, o.x0 + 0.14, h + 0.07, cx(23), 0.08, 0.12, 0.18, 0);
    // Nameplate facing the visitor.
    const plate = this.own(signTexture(256, 64, "#1c1a17", [["M. K. MOTWANI · BRANCH MANAGER", 22, "#e2c070"]]));
    const nameplate = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.34, 0.085)), this.own(new THREE.MeshBasicMaterial({ map: plate })));
    nameplate.position.set(o.x0 - 0.02, h + 0.1, o.cz + 0.1);
    nameplate.rotation.y = -Math.PI / 2;
    this.group.add(nameplate);

    // Sir's keys: on the desk only while he is out of the room.
    const keys = itemModel("key_bunch");
    keys.rotation.set(-Math.PI / 2, 0, 0.6);
    keys.position.set(cx(26.9), h + 0.045, cx(22));
    keys.scale.setScalar(1.2);
    keys.visible = false;
    this.group.add(keys);
    this.props["boss-keys"] = keys;
  }

  f_filing(o) {
    const b = this.batch;
    b.box(this.m.steel, o.cx, 0.68, o.cz, o.w * 0.9, 1.36, o.d);
    for (let i = 0; i < 4; i += 1) {
      b.box(this.m.chrome, o.x0 - 0.01, 0.2 + i * 0.32, o.cz, 0.02, 0.03, 0.16);
    }
  }

  f_reception(o) {
    const b = this.batch;
    b.box(this.m.laminate, o.cx, 0.5, o.cz, o.w, 1.0, o.d * 0.8);
    b.box(this.m.granite, o.cx, 1.02, o.cz, o.w + 0.05, 0.04, o.d);
    // The landline: cream, curly cord implied.
    b.box(this.m.beige, o.cx + 0.4, 1.08, o.cz, 0.22, 0.08, 0.2);
    b.box(this.m.beige, o.cx + 0.4, 1.14, o.cz, 0.24, 0.04, 0.06);
    b.box(this.m.paper, o.cx - 0.5, 1.05, o.cz, 0.3, 0.02, 0.22, 0.2);
    const sign = this.own(signTexture(256, 96, "#20355e", [["पूछताछ", 34, "#ffffff"], ["ENQUIRY", 26, "#f0d27a"]]));
    const plate = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.7, 0.26)), this.own(new THREE.MeshBasicMaterial({ map: sign })));
    plate.position.set(o.cx, 1.35, o.z0 + 0.02);
    plate.rotation.y = Math.PI;
    this.group.add(plate);
  }

  f_bench(o) {
    const b = this.batch;
    b.box(this.m.steel, o.cx, 0.44, o.cz, o.w, 0.04, o.d * 0.6);
    b.box(this.m.steel, o.cx, 0.7, o.cz + o.d * 0.3, o.w, 0.4, 0.03);
    for (const side of [-1, 1]) b.box(this.m.darkSteel, o.cx + side * (o.w / 2 - 0.1), 0.22, o.cz, 0.05, 0.44, o.d * 0.5);
  }

  f_cooler(o) {
    const b = this.batch;
    b.box(this.m.white, o.cx, 0.5, o.cz, 0.4, 1.0, 0.4);
    b.add("cyl", this.own(new THREE.MeshLambertMaterial({ color: 0x7fb5de, transparent: true, opacity: 0.7 })), o.cx, 1.22, o.cz, 0.3, 0.44, 0.3);
    b.box(this.m.blue, o.cx, 0.72, o.cz + 0.21, 0.06, 0.05, 0.03);
  }

  f_coatStand(o) {
    const b = this.batch;
    b.add("cyl", this.m.darkWood, o.cx, 0.9, o.cz, 0.05, 1.8, 0.05);
    b.add("cyl", this.m.darkWood, o.cx, 0.03, o.cz, 0.4, 0.05, 0.4);
    for (let i = 0; i < 4; i += 1) {
      b.box(this.m.darkWood, o.cx + Math.cos(i * 1.57) * 0.1, 1.72, o.cz + Math.sin(i * 1.57) * 0.1, 0.03, 0.03, 0.2, i * 1.57);
    }
    // The umbrella, hanging off a hook by its crook until someone takes it.
    const umbrella = itemModel("umbrella");
    umbrella.position.set(o.cx + 0.19, 1.3, o.cz);
    umbrella.rotation.z = 0.05;
    this.group.add(umbrella);
    this.props["coat-stand"] = umbrella;
  }

  f_extinguisher(o) {
    const g = itemModel("fire_extinguisher");
    g.position.y = 0.95;
    g.rotation.y = Math.PI / 2 + 0.3;
    g.position.x = o.cx;
    g.position.z = o.z0 + 0.1;
    this.group.add(g);
    this.props.extinguisher = g;
    this.batch.box(this.m.darkSteel, o.cx, 1.0, o.z0 + 0.01, 0.12, 0.3, 0.02);
    const sign = this.own(signTexture(128, 128, "#c62a22", [["FIRE", 30, "#fff"], ["अग्निशामक", 22, "#fff"]]));
    const plate = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.22, 0.22)), this.own(new THREE.MeshBasicMaterial({ map: sign })));
    plate.position.set(o.cx, 1.6, o.z0 + 0.005);
    this.group.add(plate);
  }

  f_plant(o) {
    const b = this.batch;
    b.add("cyl", this.m.terracotta, o.cx, 0.2, o.cz, 0.4, 0.4, 0.4);
    for (let i = 0; i < 7; i += 1) {
      b.add("sph", this.m.leaf, o.cx + Math.cos(i) * 0.12, 0.55 + (i % 3) * 0.2, o.cz + Math.sin(i * 1.7) * 0.12, 0.28, 0.2, 0.28);
    }
  }

  f_atm(o) {
    const b = this.batch;
    b.box(this.m.darkSteel, o.cx, 0.85, o.cz, o.w * 0.9, 1.7, o.d * 0.9);
    b.box(this.m.screen, o.cx + 0.15, 1.3, o.cz + 0.34, 0.3, 0.24, 0.01);
    b.box(this.m.chrome, o.cx + 0.15, 1.0, o.cz + 0.36, 0.3, 0.12, 0.05);
    const sign = this.own(signTexture(128, 64, "#e0492b", [["ATM", 38, "#fff"]]));
    const plate = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.5, 0.25)), this.own(new THREE.MeshBasicMaterial({ map: sign })));
    plate.position.set(o.cx, 1.85, o.cz + o.d * 0.46);
    this.group.add(plate);
  }

  f_pantryCounter(o) {
    const b = this.batch;
    b.box(this.m.laminate, o.cx, 0.44, o.cz, o.w * 0.9, 0.88, o.d);
    b.box(this.m.granite, o.cx, 0.9, o.cz, o.w, 0.04, o.d);
    // Electric kettle, steel glasses, a tray of Parle-G.
    b.add("cyl", this.m.chrome, o.cx, 1.02, o.z0 + 0.4, 0.16, 0.22, 0.16);
    for (let i = 0; i < 4; i += 1) b.add("cyl", this.m.chrome, o.cx - 0.08 + (i % 2) * 0.1, 0.97, o.z0 + 1.0 + i * 0.08, 0.06, 0.1, 0.06);
    b.box(this.m.fileKhaki, o.cx, 0.94, o.z0 + 2.1, 0.2, 0.04, 0.3);
  }

  f_fridge(o) {
    const b = this.batch;
    b.box(this.m.white, o.cx, 0.85, o.cz, o.w * 0.9, 1.7, o.d * 0.9);
    b.box(this.m.chrome, o.cx - 0.2, 1.1, o.z1 - 0.02, 0.03, 0.4, 0.03);
    b.box(this.m.darkSteel, o.cx, 1.25, o.z1 - 0.03, o.w * 0.88, 0.01, 0.01);
  }

  f_table(o) {
    const b = this.batch;
    b.box(this.m.laminate, o.cx, 0.74, o.cz, o.w, 0.04, o.d);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.box(this.m.darkSteel, o.cx + dx * (o.w / 2 - 0.05), 0.37, o.cz + dz * (o.d / 2 - 0.05), 0.04, 0.74, 0.04);
    }
    for (const side of [-1, 1]) b.add("cyl", this.m.red, o.cx + side * (o.w / 2 + 0.25), 0.22, o.cz, 0.34, 0.44, 0.34);
    b.add("cyl", this.m.chrome, o.cx, 0.82, o.cz, 0.24, 0.1, 0.24);
  }

  f_bin(o) {
    this.batch.add("cyl", this.m.green, o.cx, 0.22, o.cz, 0.36, 0.44, 0.36);
  }

  f_rack(o) {
    const b = this.batch;
    for (let i = 0; i < 5; i += 1) b.box(this.m.steel, o.cx, 0.1 + i * 0.5, o.cz, o.w, 0.03, o.d);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) b.box(this.m.darkSteel, o.cx + dx * (o.w / 2 - 0.03), 1.15, o.cz + dz * (o.d / 2 - 0.03), 0.04, 2.3, 0.04);
    // File bundles tied in red cloth, the eternal bank archive.
    const mats = [this.m.fileKhaki, this.m.clothRed, this.m.fileBlue, this.m.fileKhaki, this.m.paper];
    let k = Math.floor(o.cz * 10);
    for (let shelf = 0; shelf < 4; shelf += 1) {
      for (let x = o.x0 + 0.2; x < o.x1 - 0.2; x += 0.38) {
        k += 1;
        const h = 0.18 + (k % 3) * 0.06;
        b.box(mats[k % mats.length], x, 0.12 + shelf * 0.5 + h / 2, o.cz, 0.32, h, o.d * 0.75, (k % 5) * 0.03);
      }
    }
  }

  f_sinks(o) {
    const b = this.batch;
    b.box(this.m.granite, o.cx, 0.82, o.cz, o.w, 0.05, o.d);
    b.box(this.m.laminate, o.cx, 0.4, o.cz, o.w * 0.9, 0.8, o.d);
    for (const dz of [-0.4, 0.4]) {
      b.add("cyl", this.m.white, o.cx + 0.05, 0.84, o.cz + dz, 0.34, 0.06, 0.3);
      b.box(this.m.chrome, o.x0 + 0.06, 0.96, o.cz + dz, 0.04, 0.2, 0.03);
    }
    // Mirror
    b.box(this.own(new THREE.MeshLambertMaterial({ color: 0xcfe3ea, emissive: 0x1a2426 })), o.x0 - 0.37, 1.55, o.cz, 0.01, 0.8, o.d * 0.9);
  }

  f_urinal(o) {
    const b = this.batch;
    b.box(this.m.white, o.cx, 0.75, o.cz, 0.3, 0.6, 0.45);
    b.box(this.m.chrome, o.cx + 0.1, 1.2, o.cz, 0.04, 0.3, 0.04);
  }

  f_wc(o) {
    const b = this.batch;
    b.add("cyl", this.m.white, o.cx, 0.2, o.cz + 0.1, 0.4, 0.4, 0.5);
    b.box(this.m.white, o.cx, 0.42, o.cz + 0.1, 0.44, 0.04, 0.52);
    // Cistern high on the wall, the old kind with a chain.
    b.box(this.m.white, o.cx, 1.9, o.z0 + 0.14, 0.5, 0.3, 0.22);
    b.box(this.m.chrome, o.cx + 0.2, 1.5, o.z0 + 0.22, 0.01, 0.7, 0.01);
    // Partition
    b.box(this.m.laminate, o.x0 - 0.05, 1.0, o.cz, 0.04, 2.0, o.d * 1.2);
  }

  f_broomCorner(o) {
    const b = this.batch;
    b.add("cyl", this.m.blue, o.cx + 0.08, 0.16, o.cz + 0.1, 0.3, 0.32, 0.3);
    const broom = itemModel("broom");
    broom.position.set(o.cx - 0.12, 0.49, o.cz - 0.1);
    broom.rotation.set(0, 0.8, 0.12);
    this.group.add(broom);
    this.props["broom-corner"] = broom;
  }

  // --------------------------------------------------------------- decor

  // A flat sign on a wall. `face` is the direction the sign faces.
  wallSign(texture, x, y, z, w, h, face) {
    const rot = { north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 }[face];
    const mesh = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, h)), this.own(new THREE.MeshLambertMaterial({ map: this.own(texture) })));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    this.group.add(mesh);
    return mesh;
  }

  buildDecor() {
    // The bank's name over the counter, facing the customers.
    this.wallSign(
      signTexture(1024, 160, "#12306b", [["भारतीय जुगाड़ बैंक", 58, "#ffffff"], ["BHARATIYA JUGAAD BANK · KUCH NA KUCH KAR LENGE", 34, "#f2c14e"]]),
      cx(26.2), 2.3, cx(8) + 0.01, 4.4, 0.7, "south",
    );
    // Counter signs, hung above the glass.
    const counters = [["नकद · CASH", 4.2], ["पासबुक · PASSBOOK", 9.2], ["RTGS / NEFT", 14.2]];
    for (const [text, x] of counters) {
      const t = this.own(signTexture(256, 64, "#1f4f8f", [[text, 26, "#fff"]]));
      const m = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.9, 0.22)), this.own(new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })));
      m.position.set(cx(x), 2.3, cx(13.3));
      this.group.add(m);
    }
    // Posters.
    this.wallSign(
      signTexture(256, 360, "#f7f0dc", [
        ["ग्राहक कृपया ध्यान दें", 24, "#8c1c13"],
        ["Customers are requested", 20, "#222", "normal"],
        ["to count cash before", 20, "#222", "normal"],
        ["leaving the counter.", 20, "#222", "normal"],
        ["", 12, "#222"],
        ["Mistakes will not be", 18, "#444", "italic"],
        ["entertained later.", 18, "#444", "italic"],
      ], { border: "#8c1c13" }),
      cx(4.5), 1.7, cx(8) + 0.01, 0.8, 1.1, "south",
    );
    this.wallSign(
      signTexture(360, 200, "#ffffff", [["यहाँ थूकना मना है", 34, "#c1121f"], ["NO SPITTING", 30, "#111"], ["By Order", 18, "#444", "italic"]], { border: "#c1121f" }),
      cx(10.5), 1.6, cx(31) - 0.01, 0.9, 0.5, "north",
    );
    this.wallSign(
      signTexture(300, 400, "#fff8e0", [["आज बचाओ", 36, "#1b5e20"], ["कल सुरक्षित", 36, "#1b5e20"], ["SAVE TODAY,", 26, "#333"], ["SECURE TOMORROW", 26, "#333"], ["Fixed Deposit 7.1%*", 22, "#b71c1c"]], { border: "#1b5e20" }),
      cx(1) + 0.01, 1.7, cx(12), 0.75, 1.0, "east",
    );
    this.wallSign(
      signTexture(300, 200, "#fff3cd", [["शुभ लाभ", 52, "#b71c1c"], ["॥ श्री ॥", 30, "#e65100"]], { border: "#e65100" }),
      cx(33) - 0.01, 1.9, cx(22), 0.7, 0.46, "west",
    );
    this.wallSign(
      signTexture(512, 96, "#1c1a17", [["BRANCH MANAGER — KNOCK BEFORE ENTERING", 28, "#e2c070"]]),
      cx(23) - 0.02, 2.55, cx(22), 1.3, 0.24, "west",
    );
    this.wallSign(
      signTexture(360, 200, "#ffffff", [["STAFF ONLY", 40, "#111"], ["Washroom · Pantry · Records", 22, "#555", "normal"]]),
      cx(22), 2.2, cx(31) - 0.01, 0.8, 0.44, "north",
    );
    this.wallSign(
      signTexture(420, 300, "#fff", [["Working Hours", 30, "#12306b"], ["10:00 AM – 5:00 PM", 28, "#111"], ["", 10, "#111"], ["(Staff: till Sir says so)", 22, "#b71c1c", "italic"]], { border: "#12306b" }),
      cx(12) + 0.01, 1.8, cx(2), 0.9, 0.64, "east",
    );
    // Notice board on the office's west almirah wall.
    this.wallSign(
      canvasTexture(256, 180, (ctx, w, h) => {
        ctx.fillStyle = "#9c6b3e";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#c79a64";
        ctx.fillRect(8, 8, w - 16, h - 16);
        const notes = ["#fff", "#fff59d", "#ffcdd2", "#c8e6c9", "#fff"];
        notes.forEach((c, i) => {
          ctx.fillStyle = c;
          ctx.fillRect(20 + (i % 3) * 76, 18 + Math.floor(i / 3) * 80, 64, 70);
          ctx.fillStyle = "#555";
          for (let l = 0; l < 5; l += 1) ctx.fillRect(26 + (i % 3) * 76, 30 + Math.floor(i / 3) * 80 + l * 10, 50, 2);
          ctx.fillStyle = "#c62828";
          ctx.beginPath();
          ctx.arc(52 + (i % 3) * 76, 22 + Math.floor(i / 3) * 80, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }),
      cx(1) + 0.01, 1.6, cx(20.8), 1.1, 0.78, "east",
    );

    // The wall clock: its hands follow the game's own clock.
    const face = this.own(canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = "#fbfbf7";
      ctx.beginPath();
      ctx.arc(64, 64, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#222";
      ctx.stroke();
      ctx.fillStyle = "#222";
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        ctx.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 2, 4, 4);
      }
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("AJANTA", 64, 44);
    }));
    const clock = new THREE.Group();
    const disc = new THREE.Mesh(this.own(new THREE.CircleGeometry(0.22, 24)), this.own(new THREE.MeshBasicMaterial({ map: face })));
    clock.add(disc);
    const handMat = this.own(new THREE.MeshBasicMaterial({ color: 0x111111 }));
    this.clockHour = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.018, 0.12)), handMat);
    this.clockMinute = new THREE.Mesh(this.own(new THREE.PlaneGeometry(0.012, 0.18)), handMat);
    for (const hand of [this.clockHour, this.clockMinute]) {
      hand.geometry.translate(0, hand.geometry.parameters.height / 2 - 0.01, 0);
      hand.position.z = 0.003;
      clock.add(hand);
    }
    this.clockMinute.position.z = 0.005;
    clock.position.set(cx(16), 2.35, cx(31) - 0.02);
    clock.rotation.y = Math.PI;
    this.group.add(clock);

    // Tube lights on the ceiling.
    const tubes = [];
    for (let x = 3; x <= 30; x += 4.5) {
      for (const y of [10, 14.5, 19, 23.5, 28]) tubes.push([x, y]);
    }
    tubes.push([16.5, 2], [16.5, 5.6], [5, 34], [5, 37], [16, 34], [16, 37], [28, 34], [28, 37]);
    for (const [x, y] of tubes) {
      this.batch.box(this.m.white, cx(x), WALL_H - 0.03, cx(y), 1.3, 0.05, 0.14);
      this.batch.box(this.m.tube, cx(x), WALL_H - 0.065, cx(y), 1.2, 0.04, 0.05);
    }

    // Ceiling fans: brown, three blades, and never fast enough.
    for (const [x, y] of [[6, 11], [16, 11.5], [27, 11], [6, 22.5], [13, 22.5], [19, 26.5], [28, 22.5]]) {
      const fan = new THREE.Group();
      const rod = new THREE.Mesh(this.batch.geometries.cyl, this.m.darkWood);
      rod.scale.set(0.03, 0.4, 0.03);
      rod.position.y = -0.2;
      const hub = new THREE.Mesh(this.batch.geometries.cyl, this.m.darkWood);
      hub.scale.set(0.2, 0.1, 0.2);
      hub.position.y = -0.42;
      const blades = new THREE.Group();
      blades.position.y = -0.44;
      for (let i = 0; i < 3; i += 1) {
        const blade = new THREE.Mesh(this.batch.geometries.box, this.m.darkWood);
        blade.scale.set(0.62, 0.012, 0.12);
        blade.position.set(Math.cos((i * Math.PI * 2) / 3) * 0.4, 0, Math.sin((i * Math.PI * 2) / 3) * 0.4);
        blade.rotation.y = -(i * Math.PI * 2) / 3;
        blades.add(blade);
      }
      fan.add(rod, hub, blades);
      fan.position.set(cx(x), WALL_H, cx(y));
      this.group.add(fan);
      this.fans.push({ blades, speed: 5 + (x % 3) });
    }
  }

  // ------------------------------------------------------------- colleagues

  // Everyone else stuck here with you. They type, they sigh, they do not help.
  buildPeople() {
    const shirts = [0x8fb4d9, 0xe7d9b8, 0xd08c8c, 0xa7c49a, 0xf0f0f0];
    const hair = this.mat(0x1a1411);
    const seats = [
      { x: 3.7, y: 20.9, shirt: 0, bald: true },
      { x: 9.7, y: 20.9, shirt: 3, long: true },
      { x: 15.7, y: 20.9, shirt: 1 },
      { x: 3.7, y: 25.9, shirt: 2, long: true },
      { x: 15.7, y: 25.9, shirt: 4 },
      { x: 4.2, y: 15.7, shirt: 1 },
      { x: 14.2, y: 15.7, shirt: 3, long: true },
    ];
    for (const seat of seats) {
      const person = new THREE.Group();
      const shirt = this.mat(shirts[seat.shirt]);
      const torso = new THREE.Mesh(this.batch.geometries.box, shirt);
      torso.scale.set(0.4, 0.52, 0.24);
      torso.position.y = 0.82;
      const head = new THREE.Mesh(this.batch.geometries.sph, this.m.skin);
      head.scale.setScalar(0.22);
      head.position.y = 1.22;
      const top = new THREE.Mesh(this.batch.geometries.sph, hair);
      top.scale.set(0.23, seat.bald ? 0.08 : 0.14, 0.23);
      top.position.set(0, seat.bald ? 1.3 : 1.29, 0.02);
      person.add(torso, head, top);
      let bun = null;
      if (seat.long) {
        bun = new THREE.Mesh(this.batch.geometries.sph, hair);
        bun.scale.setScalar(0.11);
        bun.position.set(0, 1.24, 0.13);
        person.add(bun);
      }
      const arms = [];
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(this.batch.geometries.box, shirt);
        arm.scale.set(0.09, 0.09, 0.42);
        arm.position.set(side * 0.2, 0.84, -0.2);
        person.add(arm);
        arms.push(arm);
      }
      const legs = new THREE.Mesh(this.batch.geometries.box, this.m.navy);
      legs.scale.set(0.36, 0.14, 0.46);
      legs.position.set(0, 0.54, -0.18);
      person.add(legs);
      person.position.set(cx(seat.x), 0, cx(seat.y));
      this.group.add(person);
      // The day's work, for showing Sir at 11 PM: a manila file, hidden
      // until then.
      const file = new THREE.Mesh(this.batch.geometries.box, this.m.manila || this.mat(0xd9b779));
      file.scale.set(0.3, 0.24, 0.03);
      file.position.set(0, 1.18, -0.34);
      file.rotation.x = -0.35;
      file.visible = false;
      person.add(file);
      this.people.push({ person, arms, head, torso, top, bun, legs, file, standing: false, phase: seat.x * 1.7 + seat.y });
    }
  }

  // Out of the chair and on their feet: a colleague in the 11 PM queue.
  // (Built seated; this lifts the body and drops the arms and legs.)
  setStanding(p, standing = true) {
    if (p.standing === standing) return;
    p.standing = standing;
    const lift = standing ? 0.32 : -0.32;
    for (const part of [p.torso, p.head, p.top, p.bun, p.file]) if (part) part.position.y += lift;
    for (const [i, arm] of p.arms.entries()) {
      const side = i ? 1 : -1;
      if (standing) {
        arm.scale.set(0.09, 0.5, 0.09);
        arm.position.set(side * 0.26, 1.12, 0);
      } else {
        arm.scale.set(0.09, 0.09, 0.42);
        arm.position.set(side * 0.2, 0.84, -0.2);
      }
    }
    if (standing) {
      p.legs.scale.set(0.3, 0.88, 0.2);
      p.legs.position.set(0, 0.44, 0);
    } else {
      p.legs.scale.set(0.36, 0.14, 0.46);
      p.legs.position.set(0, 0.54, -0.18);
    }
  }

  // Holding the file up for Sir to see: both arms forward.
  showFile(p, show = true) {
    p.file.visible = show;
    for (const [i, arm] of p.arms.entries()) {
      const side = i ? 1 : -1;
      arm.rotation.x = show ? 1.25 : 0;
      arm.position.z = show ? -0.2 : 0;
      arm.position.x = side * (show ? 0.16 : 0.26);
    }
  }

  // ------------------------------------------------------------------ light

  buildLights() {
    this.ambient = new THREE.AmbientLight(0xfff6e6, 1.4);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.1);
    this.scene.add(this.ambient, this.hemi);
    this.lights = [];
    const spots = [[6, 11], [24, 11], [8, 22], [17, 26], [28, 22], [5, 35], [16, 35], [28, 35], [16.5, 3]];
    for (const [x, y] of spots) {
      // Hung well below the ceiling, so it lights the room rather than
      // burning a hole in the ceiling tiles above it.
      const light = new THREE.PointLight(0xf4f8ff, 5, 13, 1.2);
      light.position.set(cx(x), WALL_H - 1.0, cx(y));
      this.scene.add(light);
      this.lights.push(light);
    }
  }

  // Outside the shutter: a strip of night street, seen only when it goes up.
  buildStreet() {
    const road = new THREE.Mesh(this.own(new THREE.PlaneGeometry(W * TS, 8)), this.m.asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set((W * TS) / 2, 0.001, -4);
    this.group.add(road);
    const glow = new THREE.PointLight(0xffb566, 6, 9, 1.5);
    glow.position.set(cx(16.5), 3.5, -3);
    this.scene.add(glow);
    this.lights.push(glow);
    const night = this.own(canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i += 1) {
        ctx.fillStyle = Math.random() < 0.6 ? "#f2c36b" : "#9ec2ff";
        ctx.fillRect(Math.random() * w, 20 + Math.random() * (h - 40), 4, 5);
      }
    }));
    const backdrop = new THREE.Mesh(this.own(new THREE.PlaneGeometry(W * TS * 1.5, 7)), this.own(new THREE.MeshBasicMaterial({ map: night })));
    backdrop.position.set((W * TS) / 2, 3, -8);
    this.group.add(backdrop);
  }

  // ----------------------------------------------------------------- update

  update(time, dt) {
    for (const fan of this.fans) fan.blades.rotation.y -= fan.speed * dt;
    for (const p of this.people) {
      if (p.standing) continue;
      const t = time * 7 + p.phase;
      p.arms[0].position.y = 0.84 + Math.max(0, Math.sin(t)) * 0.015;
      p.arms[1].position.y = 0.84 + Math.max(0, Math.sin(t + 1.9)) * 0.015;
      p.head.rotation.y = Math.sin(time * 0.3 + p.phase) * 0.25;
    }
  }

  // minutes since midnight
  setClock(minutes) {
    const h = (minutes / 60) % 12;
    const m = minutes % 60;
    this.clockHour.rotation.z = -(h / 12) * Math.PI * 2;
    this.clockMinute.rotation.z = -(m / 60) * Math.PI * 2;
  }

  // A container's visible prop (umbrella, extinguisher, broom) goes when its
  // item is taken; Sir's keys appear only while he is out.
  setPropVisible(id, visible) {
    if (this.props[id]) this.props[id].visible = visible;
  }

  dispose() {
    this.scene.remove(this.group, this.ambient, this.hemi, ...this.lights);
    this.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    this.batch.dispose();
    for (const thing of this.disposables) thing.dispose();
  }
}
