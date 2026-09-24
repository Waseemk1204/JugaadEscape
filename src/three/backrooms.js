// "The Lobby" — an endless Backrooms level, generated in chunks around the
// player from a seed.
//
// Generation is a pure function of (seed, chunkX, chunkY), so walking away and
// coming back rebuilds exactly the same rooms. There is no boundary: the world
// simply keeps going, which is the whole point of the place.
//
// The horror here is not darkness. The Lobby is *lit* — flat, buzzing,
// migraine-yellow fluorescent light with no shadows and no landmarks.

import * as THREE from "three";
import { TILE, U, CHUNK, WALL_H, PLAYER_RADIUS, hash, LobbyMaze } from "../../shared/lobby.js";

export { TILE, U, CHUNK, WALL_H, PLAYER_RADIUS } from "../../shared/lobby.js";

export const TS = TILE * U; // 1.5m
export const FOG_COLOR = 0x6f6030;

// One chunk out in every direction is 24m of guaranteed geometry, which the fog
// hides the end of. Two would double the draw calls for nothing visible.
const VIEW_CHUNKS = 1;
const MAX_PANEL_LIGHTS = 6; // real lights; the rest are emissive-only

// ------------------------------------------------------------------ world

export class Backrooms extends LobbyMaze {
  constructor(scene, seed = Math.floor(Math.random() * 1e9)) {
    super(seed);
    this.scene = scene;
    this.chunks = new Map(); // "cx,cy" -> built chunk record
    this.buildMaterials();
    this.buildLights();
  }

  // ------------------------------------------------------------- materials

  buildMaterials() {
    const pixel = (size, draw) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      draw(canvas.getContext("2d"), size);
      const t = new THREE.CanvasTexture(canvas);
      // Canvas textures are sRGB; without this three treats them as linear and
      // the whole level comes out muddy brown instead of sickly yellow.
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapNearestFilter;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      return t;
    };

    // The canonical yellowed wallpaper: a repeating arrow motif, grubby.
    const wallpaper = pixel(32, (ctx, s) => {
      ctx.fillStyle = "#c9b469";
      ctx.fillRect(0, 0, s, s);
      // The canonical Level 0 motif: a chevron over a thin stem, repeated
      // until it stops meaning anything. The stem is one pixel so the pattern
      // reads as an arrow rather than a little figure.
      ctx.fillStyle = "rgba(122,100,44,0.45)";
      for (let y = 0; y < s; y += 8) {
        for (let x = 0; x < s; x += 8) {
          ctx.fillRect(x + 3, y + 1, 1, 1);
          ctx.fillRect(x + 2, y + 2, 3, 1);
          ctx.fillRect(x + 1, y + 3, 5, 1);
          ctx.fillRect(x + 3, y + 4, 1, 3);
        }
      }
      // A second, offset pass at half strength: the pattern never lines up
      // with the tiles, so no wall is ever quite the same as another.
      ctx.fillStyle = "rgba(122,100,44,0.2)";
      for (let y = 4; y < s; y += 8) {
        for (let x = 4; x < s; x += 8) {
          ctx.fillRect(x + 3, y + 2, 3, 1);
          ctx.fillRect(x + 3, y + 3, 1, 2);
        }
      }
      // Grime and old water damage.
      for (let i = 0; i < 90; i += 1) {
        ctx.fillStyle = `rgba(88,70,28,${0.06 + Math.random() * 0.2})`;
        ctx.fillRect(Math.floor(Math.random() * s), Math.floor(Math.random() * s), 1, 1);
      }
      ctx.fillStyle = "rgba(96,78,32,0.22)";
      ctx.fillRect(0, s - 6, s, 6);
    });

    // Worn, faintly damp carpet.
    const carpet = pixel(32, (ctx, s) => {
      ctx.fillStyle = "#9c8a46";
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 1) {
        for (let x = 0; x < s; x += 1) {
          const v = Math.random();
          if (v > 0.5) {
            ctx.fillStyle = `rgba(62,52,20,${(v - 0.5) * 0.8})`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      ctx.fillStyle = "rgba(54,45,18,0.3)";
      ctx.fillRect(4, 18, 12, 9);
      ctx.fillRect(21, 5, 7, 6);
    });

    const ceiling = pixel(32, (ctx, s) => {
      ctx.fillStyle = "#b9a862";
      ctx.fillRect(0, 0, s, s);
      // Suspended-tile grid.
      ctx.fillStyle = "rgba(78,66,28,0.5)";
      ctx.fillRect(0, 0, s, 1);
      ctx.fillRect(0, 0, 1, s);
      ctx.fillRect(0, s >> 1, s, 1);
      ctx.fillRect(s >> 1, 0, 1, s);
      for (let i = 0; i < 30; i += 1) {
        ctx.fillStyle = `rgba(70,58,24,${0.06 + Math.random() * 0.14})`;
        ctx.fillRect(Math.floor(Math.random() * s), Math.floor(Math.random() * s), 2, 1);
      }
    });

    // Box faces get UV 0..1 whatever their size, so a wall face (1.5m x 2.7m)
    // would stretch the motif vertically by nearly two. These repeats undo that
    // and bring the pattern down to a believable wallpaper scale.
    wallpaper.repeat.set(2, 3.6);
    carpet.repeat.set(2, 2);

    const litMat = (map) => new THREE.MeshPhongMaterial({ shininess: 0, specular: 0x000000, map });
    this.materials = {
      wall: litMat(wallpaper),
      floor: litMat(carpet),
      ceiling: litMat(ceiling),
      // Panels are unlit so they always read as the light source itself.
      panel: new THREE.MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false, fog: false }),
      panelDead: new THREE.MeshBasicMaterial({ color: 0x5c5433, toneMapped: false, fog: false }),
    };
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  }

  // A handful of real point lights follow the player, snapping to the nearest
  // ceiling panels. Everything beyond them is carried by ambient light, which
  // is exactly right here: the Lobby has no shadows to speak of.
  buildLights() {
    this.ambient = new THREE.AmbientLight(0xf3e2a0, 0.24);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xfff0bb, 0x6a5b2a, 0.16);
    this.scene.add(this.hemi);
    this.blackout = 0; // 0 lit, 1 dead
    this.panelLights = [];
    for (let i = 0; i < MAX_PANEL_LIGHTS; i += 1) {
      const light = new THREE.PointLight(0xfff3cf, 0, 11, 2);
      light.visible = false;
      this.scene.add(light);
      this.panelLights.push(light);
    }
  }

  // ------------------------------------------------------------- streaming

  update(playerX, playerY, time, dt = 0.016) {
    const pcx = Math.floor(playerX / TILE / CHUNK);
    const pcy = Math.floor(playerY / TILE / CHUNK);

    for (let dy = -VIEW_CHUNKS; dy <= VIEW_CHUNKS; dy += 1) {
      for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx += 1) {
        const key = this.key(pcx + dx, pcy + dy);
        if (!this.chunks.has(key)) this.buildChunk(pcx + dx, pcy + dy);
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > VIEW_CHUNKS + 1 || Math.abs(chunk.cy - pcy) > VIEW_CHUNKS + 1) {
        this.disposeChunk(key, chunk);
      }
    }

    this.updateLights(playerX, playerY, time, dt);
  }

  buildChunk(cx, cy) {
    const cells = this.cellsFor(cx, cy);
    const group = new THREE.Group();
    const walls = [];
    const floors = [];
    const ceilings = [];
    const livePanels = [];
    const deadPanels = [];
    const panelSpots = [];

    for (let ly = 0; ly < CHUNK; ly += 1) {
      for (let lx = 0; lx < CHUNK; lx += 1) {
        const tx = cx * CHUNK + lx;
        const ty = cy * CHUNK + ly;
        const x = (tx * TILE + TILE / 2) * U;
        const z = (ty * TILE + TILE / 2) * U;
        if (cells[ly][lx] === "#") {
          walls.push([x, WALL_H / 2, z]);
          continue;
        }
        floors.push([x, -0.1, z]);
        ceilings.push([x, WALL_H + 0.1, z]);
        // Fluorescent panels on a rigid grid. The regularity is the point: it
        // gives you a rhythm that looks like a landmark and never is.
        if (((tx % 4) + 4) % 4 === 0 && ((ty % 4) + 4) % 4 === 0) {
          const roll = hash(this.seed ^ 0x4c17, tx, ty);
          const dead = roll < 0.18;
          (dead ? deadPanels : livePanels).push([x, WALL_H - 0.03, z]);
          if (!dead) {
            panelSpots.push({
              x: tx * TILE + TILE / 2,
              y: ty * TILE + TILE / 2,
              wx: x,
              wz: z,
              // Unstable panels stutter; the rest just breathe.
              unstable: roll > 0.72,
              phase: roll * 100,
            });
          }
        }
      }
    }

    const add = (positions, material, sx, sy, sz) => {
      if (!positions.length) return;
      const mesh = new THREE.InstancedMesh(this.boxGeometry, material, positions.length);
      const matrix = new THREE.Matrix4();
      positions.forEach(([x, y, z], i) => {
        matrix.makeScale(sx, sy, sz);
        matrix.setPosition(x, y, z);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    };

    add(walls, this.materials.wall, TS, WALL_H, TS);
    add(floors, this.materials.floor, TS, 0.2, TS);
    add(ceilings, this.materials.ceiling, TS, 0.2, TS);
    add(livePanels, this.materials.panel, TS * 0.66, 0.06, TS * 0.66);
    add(deadPanels, this.materials.panelDead, TS * 0.66, 0.06, TS * 0.66);

    this.scene.add(group);
    this.chunks.set(this.key(cx, cy), { cx, cy, cells, group, panelSpots });
  }

  disposeChunk(key, chunk) {
    this.scene.remove(chunk.group);
    chunk.group.traverse((obj) => {
      if (obj.isInstancedMesh) obj.dispose();
    });
    this.chunks.delete(key);
  }

  // Kill the lights.
  //
  // Pulling the last fuse does not switch the power on, it switches this
  // level's off — the Lobby's flat, shadowless, migraine-yellow glare is the
  // thing that has been making the torch pointless, and taking it away is what
  // turns the last leg into a chase through a dark maze with one beam.
  setBlackout(on) {
    this.blackoutTarget = on ? 1 : 0;
  }

  // Move the small pool of real lights onto the panels nearest the player, and
  // flicker them. Inconsistent flicker is the single most recognisable thing
  // about this place.
  updateLights(px, py, time, dt = 0.016) {
    // Eased, so the lights die down the corridor rather than snapping off.
    const target = this.blackoutTarget ?? 0;
    this.blackout += (target - this.blackout) * Math.min(1, dt * 1.6);
    const lit = 1 - this.blackout;
    this.ambient.intensity = 0.02 + 0.22 * lit;
    this.hemi.intensity = 0.015 + 0.145 * lit;
    this.materials.panel.color.setRGB(
      0.06 + 0.94 * lit,
      0.055 + 0.905 * lit,
      0.05 + 0.796 * lit,
    );

    const candidates = [];
    for (const chunk of this.chunks.values()) {
      for (const spot of chunk.panelSpots) {
        candidates.push({ spot, d: (spot.x - px) ** 2 + (spot.y - py) ** 2 });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.panelLights.length; i += 1) {
      const light = this.panelLights[i];
      const entry = candidates[i];
      if (!entry) {
        light.visible = false;
        continue;
      }
      const { spot } = entry;
      light.visible = true;
      light.position.set(spot.wx, WALL_H - 0.15, spot.wz);
      let level = 0.9 + Math.sin(time * 3.1 + spot.phase) * 0.06;
      if (spot.unstable) {
        // Mains-hum stutter: mostly on, dropping out for a frame or two at
        // irregular intervals.
        const s = Math.sin(time * 13.7 + spot.phase * 7) * Math.sin(time * 4.3 + spot.phase);
        if (s > 0.86) level *= 0.12;
        else if (s > 0.8) level *= 0.55;
      }
      if (this.blackout > 0.02) {
        // Dead, except for the occasional convulsion in one tube somewhere —
        // just enough to show you a room you would rather not have seen.
        const twitch = Math.sin(time * 2.3 + spot.phase * 11) * Math.sin(time * 0.61 + spot.phase);
        level *= twitch > 0.97 ? (1 - this.blackout) + 0.55 : Math.max(0, 1 - this.blackout * 1.25);
      }
      light.intensity = 3.2 * level;
    }
  }

  dispose() {
    for (const [key, chunk] of [...this.chunks]) this.disposeChunk(key, chunk);
    this.cellCache.clear();
    this.boxGeometry.dispose();
    for (const material of Object.values(this.materials)) {
      material.map?.dispose();
      material.dispose();
    }
    this.scene.remove(this.ambient, this.hemi);
    for (const light of this.panelLights) this.scene.remove(light);
  }
}
