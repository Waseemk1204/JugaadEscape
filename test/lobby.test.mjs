// Tests for the solo mode's endless level.
//
// The failure that matters here is the one that cannot be seen from a
// screenshot: a maze that quietly seals the player — or an objective — inside a
// pocket with no way out. Everything below is really one question asked four
// ways: can you always walk from where you are to where the game wants you to
// go?

import test from "node:test";
import assert from "node:assert/strict";
import {
  TILE,
  CHUNK,
  PLAYER_RADIUS,
  generateChunk,
  LobbyMaze,
} from "../shared/lobby.js";

const SEEDS = [1, 7, 42, 1337, 90210, 2 ** 30 - 1, -12345];

// Flood fill at half-tile resolution over a window of chunks, starting from a
// point, returning the set of reachable tiles. Half a tile is deliberate: a gap
// that a tile-resolution check calls open can still be too narrow for a body
// with a radius, which is exactly the bug the school had.
function reachableTiles(maze, startX, startY, halfSpanTiles) {
  const step = TILE / 2;
  const startKey = `${Math.round(startX / step)},${Math.round(startY / step)}`;
  const seen = new Set([startKey]);
  const queue = [[Math.round(startX / step), Math.round(startY / step)]];
  const limitX = Math.abs(startX) + halfSpanTiles * TILE;
  const limitY = Math.abs(startY) + halfSpanTiles * TILE;
  const tiles = new Set();

  while (queue.length) {
    const [gx, gy] = queue.pop();
    const x = gx * step;
    const y = gy * step;
    tiles.add(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx;
      const ny = gy + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      const px = nx * step;
      const py = ny * step;
      if (Math.abs(px) > limitX || Math.abs(py) > limitY) continue;
      if (maze.isBlocked(px, py, PLAYER_RADIUS)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return tiles;
}

test("generation is a pure function of seed and chunk", () => {
  for (const seed of SEEDS) {
    const a = generateChunk(seed, 3, -5);
    const b = generateChunk(seed, 3, -5);
    assert.deepEqual(a, b, "the same chunk must regenerate identically");
  }
  assert.notDeepEqual(
    generateChunk(1, 0, 0),
    generateChunk(2, 0, 0),
    "different seeds must produce different chunks",
  );
  assert.notDeepEqual(
    generateChunk(1, 0, 0),
    generateChunk(1, 1, 0),
    "neighbouring chunks must differ",
  );
});

test("every chunk keeps its central cross clear", () => {
  const mid = CHUNK >> 1;
  for (const seed of SEEDS) {
    for (let cx = -2; cx <= 2; cx += 1) {
      for (let cy = -2; cy <= 2; cy += 1) {
        const cells = generateChunk(seed, cx, cy);
        for (let i = 0; i < CHUNK; i += 1) {
          assert.equal(cells[mid][i], ".", `seed ${seed} chunk ${cx},${cy} row blocked at ${i}`);
          assert.equal(cells[i][mid], ".", `seed ${seed} chunk ${cx},${cy} column blocked at ${i}`);
        }
      }
    }
  }
});

test("a body can walk out of every chunk in every direction", () => {
  for (const seed of SEEDS) {
    const maze = new LobbyMaze(seed);
    const spawn = maze.findOpenSpot(0, 0);
    // Two chunks out in each direction: 5x5 chunks of level around the player.
    const tiles = reachableTiles(maze, spawn.x, spawn.y, CHUNK * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const target = maze.findOpenSpot(dx * CHUNK * 2, dy * CHUNK * 2);
      const key = `${Math.floor(target.x / TILE)},${Math.floor(target.y / TILE)}`;
      assert.ok(
        tiles.has(key),
        `seed ${seed}: nothing reachable two chunks toward ${dx},${dy} — the level sealed itself`,
      );
    }
  }
});

test("findOpenSpot never lands somewhere the player cannot stand", () => {
  for (const seed of SEEDS) {
    const maze = new LobbyMaze(seed);
    for (let i = 0; i < 120; i += 1) {
      const tx = ((i * 37) % 64) - 32;
      const ty = ((i * 53) % 64) - 32;
      const spot = maze.findOpenSpot(tx, ty);
      assert.equal(
        maze.isBlocked(spot.x, spot.y, PLAYER_RADIUS),
        false,
        `seed ${seed}: findOpenSpot(${tx}, ${ty}) returned a blocked spot`,
      );
    }
  }
});

test("objectives are always reachable from the spawn", () => {
  // Mirrors how SoloProps lays fuse boxes out: three spread bearings, 26–44
  // tiles from spawn, each snapped to the nearest standable tile.
  for (const seed of SEEDS) {
    const maze = new LobbyMaze(seed);
    const spawn = maze.findOpenSpot(0, 0);
    const tiles = reachableTiles(maze, spawn.x, spawn.y, 56);
    for (let i = 0; i < 3; i += 1) {
      for (const distance of [26, 35, 44]) {
        const angle = (i / 3) * Math.PI * 2;
        const spot = maze.findOpenSpot(
          Math.round((spawn.x + Math.cos(angle) * distance * TILE) / TILE),
          Math.round((spawn.y + Math.sin(angle) * distance * TILE) / TILE),
        );
        const key = `${Math.floor(spot.x / TILE)},${Math.floor(spot.y / TILE)}`;
        assert.ok(
          tiles.has(key),
          `seed ${seed}: an objective at bearing ${i}, ${distance} tiles out is walled off`,
        );
      }
    }
  }
});

test("line of sight is blocked by walls and clear along the cross", () => {
  const maze = new LobbyMaze(99);
  const mid = CHUNK >> 1;
  // The guaranteed central corridor of a chunk is clear end to end.
  const y = mid * TILE + TILE / 2;
  assert.equal(maze.hasLineOfSight(TILE / 2, y, (CHUNK - 1) * TILE + TILE / 2, y), true);
  // Find any wall and confirm it actually stops sight through it.
  let blockedSomewhere = false;
  for (let tx = 0; tx < CHUNK && !blockedSomewhere; tx += 1) {
    for (let ty = 0; ty < CHUNK; ty += 1) {
      if (!maze.isWallTile(tx, ty)) continue;
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      if (!maze.hasLineOfSight(cx - TILE * 2, cy, cx + TILE * 2, cy)) {
        blockedSomewhere = true;
        break;
      }
    }
  }
  assert.ok(blockedSomewhere, "no wall anywhere blocked line of sight");
});

test("the exit always lands within 50m of wherever the player is", () => {
  // The last fuse can be pulled anywhere in an endless level, so the exit is
  // placed at that moment, around the player. The cap is a promise, so it is
  // checked after snapping to an open tile, across many seeds and places.
  const MAX = 50 * 32;
  const MIN = 28 * 32;
  for (const seed of SEEDS) {
    const maze = new LobbyMaze(seed);
    for (let i = 0; i < 25; i += 1) {
      const here = maze.findOpenSpot(((i * 97) % 400) - 200, ((i * 53) % 400) - 200);
      const spot = maze.spotAround(here.x, here.y, { min: MIN, max: MAX, random: () => ((i * 7 + 3) % 10) / 10 });
      assert.ok(spot, `seed ${seed}: nowhere to put the exit near ${here.x},${here.y}`);
      const distance = Math.hypot(spot.x - here.x, spot.y - here.y);
      assert.ok(distance <= MAX, `seed ${seed}: exit ${Math.round(distance / 32)}m away`);
      assert.ok(distance >= MIN * 0.8, `seed ${seed}: exit only ${Math.round(distance / 32)}m away`);
      assert.equal(maze.isBlocked(spot.x, spot.y, PLAYER_RADIUS), false, "exit placed inside a wall");
    }
  }
});

test("the exit prefers the side of the player the monster is not on", () => {
  const maze = new LobbyMaze(77);
  const here = maze.findOpenSpot(0, 0);
  // Put the monster due east; the exit should end up west of the player.
  const monster = { x: here.x + 40 * 32, y: here.y };
  for (let i = 0; i < 10; i += 1) {
    const spot = maze.spotAround(here.x, here.y, { min: 28 * 32, max: 50 * 32, avoid: monster });
    assert.ok(spot.x < here.x, "the exit was placed on the monster's side of the player");
  }
});
