// The geometry of "The Lobby": an endless Backrooms level generated in chunks
// from a seed.
//
// This file knows nothing about three.js or the DOM, for the same reason
// shared/map.js does not: the part of a level that can strand a player in a
// sealed box has to be testable in Node, not only by walking around in it.

export const TILE = 48; // map pixels, matching the rest of the game
export const U = 1 / 32; // metres per map pixel
export const CHUNK = 16; // tiles per chunk side
export const WALL_H = 2.7; // low ceilings are part of the dread
export const PLAYER_RADIUS = 13;

// Cheap deterministic hash. Same inputs, same room, every time.
export function hash(seed, x, y) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A chunk is a grid of tiles: '#' wall, '.' floor. The layout is open bays
// broken by pillars and stub walls rather than a solved maze — dead ends that
// look like progress are what makes it disorienting.
export function generateChunk(seed, cx, cy) {
  const cells = Array.from({ length: CHUNK }, () => Array.from({ length: CHUNK }, () => "."));

  const put = (x, y, ch) => {
    if (x >= 0 && y >= 0 && x < CHUNK && y < CHUNK) cells[y][x] = ch;
  };

  // Pillars on a loose lattice, jittered per chunk.
  const pillarStep = 3 + Math.floor(hash(seed, cx, cy) * 2);
  for (let y = 1; y < CHUNK; y += pillarStep) {
    for (let x = 1; x < CHUNK; x += pillarStep) {
      if (hash(seed ^ 0x9e37, cx * CHUNK + x, cy * CHUNK + y) < 0.6) put(x, y, "#");
    }
  }

  // Stub walls: short runs that break sight-lines without sealing anything.
  const stubs = 5 + Math.floor(hash(seed ^ 0x51ed, cx, cy) * 6);
  for (let i = 0; i < stubs; i += 1) {
    const r1 = hash(seed ^ 0x2545, cx * 31 + i, cy * 17 + i);
    const r2 = hash(seed ^ 0x7f4a, cx * 13 + i, cy * 29 + i);
    const r3 = hash(seed ^ 0x1b87, cx * 7 + i, cy * 11 + i);
    const horizontal = r3 < 0.5;
    const length = 3 + Math.floor(r3 * 7);
    const sx = Math.floor(r1 * (CHUNK - 2)) + 1;
    const sy = Math.floor(r2 * (CHUNK - 2)) + 1;
    for (let k = 0; k < length; k += 1) {
      put(horizontal ? sx + k : sx, horizontal ? sy : sy + k, "#");
    }
  }

  // A guaranteed clear cross through the middle, reaching both edges. Every
  // chunk therefore touches its four neighbours' crosses, which makes the whole
  // infinite plane one connected space no matter how the stubs fall. Without
  // it a run of unlucky stubs can seal a chunk off, and a sealed box is not
  // eerie, just broken.
  const mid = CHUNK >> 1;
  for (let i = 0; i < CHUNK; i += 1) {
    put(i, mid, ".");
    put(i, mid - 1, ".");
    put(mid, i, ".");
    put(mid - 1, i, ".");
  }

  return cells;
}

// The level as the game queries it: infinite, cached, and answering the same
// isBlocked / hasLineOfSight questions the school does.
export class LobbyMaze {
  constructor(seed = 1) {
    this.seed = seed | 0;
    this.cellCache = new Map();
  }

  key(cx, cy) {
    return `${cx},${cy}`;
  }

  cellsFor(cx, cy) {
    const key = this.key(cx, cy);
    let cells = this.cellCache.get(key);
    if (!cells) {
      cells = generateChunk(this.seed, cx, cy);
      // Bounded: walking a long way in one direction would otherwise keep
      // every chunk ever touched alive.
      if (this.cellCache.size > 400) this.cellCache.clear();
      this.cellCache.set(key, cells);
    }
    return cells;
  }

  isWallTile(tx, ty) {
    const cx = Math.floor(tx / CHUNK);
    const cy = Math.floor(ty / CHUNK);
    return this.cellsFor(cx, cy)[ty - cy * CHUNK][tx - cx * CHUNK] === "#";
  }

  // Collision in map-pixel space, matching the rest of the game's convention.
  isBlocked(x, y, radius = PLAYER_RADIUS) {
    const minCol = Math.floor((x - radius) / TILE);
    const maxCol = Math.floor((x + radius) / TILE);
    const minRow = Math.floor((y - radius) / TILE);
    const maxRow = Math.floor((y + radius) / TILE);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        if (!this.isWallTile(col, row)) continue;
        const bx = col * TILE;
        const by = row * TILE;
        const cx = Math.max(bx, Math.min(x, bx + TILE));
        const cy = Math.max(by, Math.min(y, by + TILE));
        if (Math.hypot(x - cx, y - cy) < radius) return true;
      }
    }
    return false;
  }

  hasLineOfSight(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (TILE * 0.4));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (this.isWallTile(Math.floor((ax + (bx - ax) * t) / TILE), Math.floor((ay + (by - ay) * t) / TILE))) {
        return false;
      }
    }
    return true;
  }

  // Somewhere the player can stand, between `min` and `max` map pixels from
  // them in a straight line, preferring whichever candidate sits furthest from
  // `avoid` (the monster). Used to place the exit the moment the lights go
  // out: close enough that the run to it is a sprint rather than a trek, and
  // on the side of you it is not on, so the escape is a race rather than a
  // run straight into it. Returns null only if nothing in range is open.
  spotAround(px, py, { min, max, avoid = null, random = Math.random, tries = 24 }) {
    let best = null;
    let bestScore = -Infinity;
    const base = random() * Math.PI * 2;
    for (let i = 0; i < tries; i += 1) {
      const angle = base + (i / tries) * Math.PI * 2;
      const reach = min + random() * (max - min);
      const spot = this.findOpenSpot(
        Math.round((px + Math.cos(angle) * reach) / TILE),
        Math.round((py + Math.sin(angle) * reach) / TILE),
      );
      // Snapping to an open tile can push a spot outside the band; the cap is
      // a promise to the player, so it is checked after the snap, not before.
      const distance = Math.hypot(spot.x - px, spot.y - py);
      if (distance < min * 0.8 || distance > max) continue;
      if (this.isBlocked(spot.x, spot.y, PLAYER_RADIUS)) continue;
      const score = avoid ? Math.hypot(spot.x - avoid.x, spot.y - avoid.y) : random();
      if (score > bestScore) {
        bestScore = score;
        best = spot;
      }
    }
    return best;
  }

  // A spot the player actually fits in, near a tile, searched outwards in
  // rings. Objectives are placed through this, so none can land inside a wall.
  findOpenSpot(tx, ty) {
    for (let ring = 0; ring < 30; ring += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const x = (tx + dx) * TILE + TILE / 2;
          const y = (ty + dy) * TILE + TILE / 2;
          if (!this.isBlocked(x, y, PLAYER_RADIUS + 3)) return { x, y };
        }
      }
    }
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }
}
