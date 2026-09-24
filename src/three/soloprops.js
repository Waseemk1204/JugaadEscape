// The two things in the Lobby that are not the Lobby: three fuse boxes and the
// door they open.
//
// Wandering an infinite level with no goal is a tech demo, not a game. These
// give the space a direction without ever telling you the way.

import * as THREE from "three";
import { TILE, U, WALL_H } from "./backrooms.js";

export const FUSE_COUNT = 3;
export const FUSE_REACH = 46; // map pixels
export const FUSE_HOLD_MS = 1400;

// Fuse boxes sit this far out, on spread bearings, so no two are a short hop
// apart and getting to one is a walk through a lot of maze even when you know
// which way it is.
const FUSE_MIN_TILES = 60;  // ~90m
const FUSE_MAX_TILES = 110; // ~165m
const EXIT_MIN_TILES = 40;
const EXIT_MAX_TILES = 62;

// Fuse boxes sit a long way out, so the compass being a bearing rather than a
// route is what keeps a run long. It never goes dark.

export class SoloProps {
  constructor(scene, level, rng) {
    this.scene = scene;
    this.level = level;
    this.rng = rng;
    this.fuses = [];
    this.exit = null;
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  // `origin` is the player's spawn, in map pixels.
  place(origin) {
    // Bearings are evenly spread then jittered, so the three are never bunched.
    const base = this.rng() * Math.PI * 2;
    for (let i = 0; i < FUSE_COUNT; i += 1) {
      const angle = base + (i / FUSE_COUNT) * Math.PI * 2 + (this.rng() - 0.5) * 0.8;
      const tiles = FUSE_MIN_TILES + this.rng() * (FUSE_MAX_TILES - FUSE_MIN_TILES);
      const spot = this.level.findOpenSpot(
        Math.round((origin.x + Math.cos(angle) * tiles * TILE) / TILE),
        Math.round((origin.y + Math.sin(angle) * tiles * TILE) / TILE),
      );
      const fuse = { id: i, x: spot.x, y: spot.y, done: false, mesh: this.buildFuseBox(spot) };
      this.fuses.push(fuse);
    }

    const angle = base + Math.PI + (this.rng() - 0.5) * 1.2;
    const tiles = EXIT_MIN_TILES + this.rng() * (EXIT_MAX_TILES - EXIT_MIN_TILES);
    const spot = this.level.findOpenSpot(
      Math.round((origin.x + Math.cos(angle) * tiles * TILE) / TILE),
      Math.round((origin.y + Math.sin(angle) * tiles * TILE) / TILE),
    );
    this.exit = { x: spot.x, y: spot.y, open: false, mesh: this.buildExit(spot) };
    this.exit.mesh.visible = false;
  }

  // A grey steel box with a red lever, and a light above it so it is findable
  // from across a bay without a waypoint marker.
  buildFuseBox(spot) {
    const group = new THREE.Group();
    const steel = new THREE.MeshPhongMaterial({ color: 0x6e737a, shininess: 0, specular: 0x000000 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.22), steel);
    body.position.y = 1.35;
    group.add(body);

    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.26, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xc83431, toneMapped: false }),
    );
    lever.position.set(0, 1.35, -0.16);
    lever.rotation.x = 0.5;
    group.add(lever);
    group.userData.lever = lever;

    // Conduit running up into the ceiling: it explains why it is here.
    const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.09, WALL_H - 1.75, 0.09), steel);
    conduit.position.y = 1.75 + (WALL_H - 1.75) / 2;
    group.add(conduit);

    const indicator = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xff5a4c, toneMapped: false, fog: false }),
    );
    indicator.position.set(0.2, 1.62, -0.13);
    group.add(indicator);
    group.userData.indicator = indicator;

    const glow = new THREE.PointLight(0xff6a58, 1.6, 6, 2);
    glow.position.set(0, 1.7, 0);
    group.add(glow);
    group.userData.glow = glow;

    group.position.set(spot.x * U, 0, spot.y * U);
    this.group.add(group);
    return group;
  }

  // The way out: a doorway that is simply *there*, in the middle of a bay,
  // leading nowhere you can see. It should look wrong, not welcoming.
  buildExit(spot) {
    const group = new THREE.Group();
    const frame = new THREE.MeshPhongMaterial({ color: 0x2a2620, shininess: 0, specular: 0x000000 });
    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.3), frame);
    jambL.position.set(-0.6, 1.1, 0);
    const jambR = jambL.clone();
    jambR.position.x = 0.6;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.18, 0.3), frame);
    lintel.position.y = 2.29;
    group.add(jambL, jambR, lintel);

    // Pure black, unlit, no fog: a hole rather than a surface.
    const voidPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 2.2),
      new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: false, side: THREE.DoubleSide }),
    );
    voidPanel.position.y = 1.1;
    group.add(voidPanel);

    const glow = new THREE.PointLight(0x9fe8c8, 2.4, 8, 2);
    glow.position.set(0, 1.6, 0.4);
    group.add(glow);
    group.userData.glow = glow;

    group.position.set(spot.x * U, 0, spot.y * U);
    this.group.add(group);
    return group;
  }

  // What the compass should point at.
  //
  // It always points at something. Gating it on distance made the first
  // several minutes of a run a directionless walk, which is not the same
  // feeling as being lost — the maze does that on its own, because knowing
  // which way a fuse lies tells you nothing about how to get there through it.
  nearestTo(x, y) {
    if (this.exit?.open) return { ...this.exit, kind: "exit", inRange: true };
    let best = null;
    let bestDistance = Infinity;
    for (const fuse of this.fuses) {
      if (fuse.done) continue;
      const d = Math.hypot(fuse.x - x, fuse.y - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = fuse;
      }
    }
    if (!best) return null;
    return { ...best, kind: "fuse", inRange: true, distance: bestDistance };
  }

  fuseInReach(x, y) {
    for (const fuse of this.fuses) {
      if (fuse.done) continue;
      if (Math.hypot(fuse.x - x, fuse.y - y) < FUSE_REACH) return fuse;
    }
    return null;
  }

  pull(fuse) {
    fuse.done = true;
    fuse.mesh.userData.lever.rotation.x = -0.5;
    fuse.mesh.userData.indicator.material.color.setHex(0x74e08a);
    fuse.mesh.userData.glow.color.setHex(0x74e08a);
    fuse.mesh.userData.glow.intensity = 0.9;
    if (this.fuses.every((f) => f.done)) {
      this.exit.open = true;
      this.exit.mesh.visible = true;
      return true;
    }
    return false;
  }

  // Put the exit near the player, now. Called when the last fuse is pulled:
  // wherever it was placed at the start of the run may be hundreds of metres
  // behind them by then, and the last leg is meant to be a sprint through the
  // dark, not a second expedition.
  moveExitNear(px, py, { maxDistance, minDistance, avoid }) {
    const spot =
      this.level.spotAround(px, py, { min: minDistance, max: maxDistance, avoid, random: this.rng }) ||
      // Nothing open in the band (vanishingly unlikely in this level): take
      // the nearest open spot to a point just inside it rather than leave the
      // exit where it was.
      this.level.findOpenSpot(Math.round((px + minDistance) / TILE), Math.round(py / TILE));
    this.exit.x = spot.x;
    this.exit.y = spot.y;
    this.exit.mesh.position.set(spot.x * U, 0, spot.y * U);
  }

  atExit(x, y) {
    return Boolean(this.exit?.open) && Math.hypot(this.exit.x - x, this.exit.y - y) < FUSE_REACH;
  }

  update(time) {
    for (const fuse of this.fuses) {
      if (fuse.done) continue;
      // A slow pulse on the indicator so an unpulled box catches the eye.
      fuse.mesh.userData.glow.intensity = 1.3 + Math.sin(time * 2.6 + fuse.id) * 0.5;
    }
    if (this.exit?.open) {
      this.exit.mesh.userData.glow.intensity = 2 + Math.sin(time * 1.8) * 0.6;
      this.exit.mesh.rotation.y = Math.sin(time * 0.25) * 0.12;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
  }
}
