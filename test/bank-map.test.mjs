// The branch's floor plan. The failures worth catching here are the ones that
// silently strand a run: a drawer you can see but never stand close enough to
// open, a door step behind a desk, a boss who cannot walk to the washroom.

import test from "node:test";
import assert from "node:assert/strict";
import { BankMap, SPOTS, ROUTES, TILE, PLAYER_RADIUS, cellPoint, roomAt } from "../shared/bank-map.js";
import { CONTAINERS, DOORS } from "../shared/jugaad.js";
import { BOSS } from "../shared/boss-ai.js";

const REACH = 1.7 * 32; // must match the game's interaction reach

// Every point a player can stand on, flood-filled from their chair.
function standable(map) {
  const step = 6;
  const seen = new Set();
  const out = [];
  const start = { x: SPOTS.playerChair.x, y: SPOTS.playerChair.y };
  const queue = [start];
  const key = (p) => `${Math.round(p.x / step)},${Math.round(p.y / step)}`;
  seen.add(key(start));
  while (queue.length) {
    const p = queue.shift();
    out.push(p);
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      const k = key(q);
      if (seen.has(k)) continue;
      seen.add(k);
      if (map.isBlocked(q.x, q.y, PLAYER_RADIUS)) continue;
      queue.push(q);
    }
  }
  return out;
}

test("the player's chair is somewhere a player fits", () => {
  const map = new BankMap();
  assert.equal(map.isBlocked(SPOTS.playerChair.x, SPOTS.playerChair.y, PLAYER_RADIUS), false);
});

test("every hiding place can be reached from the office floor", () => {
  const map = new BankMap();
  const spots = standable(map);
  for (const container of CONTAINERS) {
    const at = cellPoint(container.at);
    const near = spots.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < REACH * 0.85);
    assert.ok(near, `${container.id} cannot be reached`);
  }
});

test("each door step can be reached once the doors before it are open", () => {
  const map = new BankMap();
  for (const door of DOORS) {
    const spots = standable(map);
    for (const step of door.steps) {
      const at = cellPoint(step.at);
      const near = spots.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < REACH * 0.85);
      assert.ok(near, `${door.id}/${step.id} cannot be reached`);
    }
    map.setDoorOpen(door.id, true);
  }
  // With everything open, the street is reachable.
  const spots = standable(map);
  assert.ok(spots.some((p) => roomAt(p.x, p.y) === "street" || p.y < TILE * 0.2), "cannot get out under the shutter");
});

test("closed doors keep you in", () => {
  const map = new BankMap();
  const spots = standable(map);
  assert.ok(!spots.some((p) => p.y < 7 * TILE), "walked through the wooden doors while they were shut");
  map.setDoorOpen("wooden", true);
  const past = standable(map);
  assert.ok(past.some((p) => p.y < 7 * TILE && p.y > 4 * TILE), "wooden doors open but the landing is unreachable");
  assert.ok(!past.some((p) => p.y < 4 * TILE), "walked through the locked gate");
});

test("the boss can walk every route he has", () => {
  const map = new BankMap();
  const legs = [...ROUTES.round, ...ROUTES.washroom, ...ROUTES.search].map((p) => cellPoint(Array.isArray(p) ? p : p.at));
  let from = SPOTS.bossChair;
  for (const to of [...legs, SPOTS.bossChair]) {
    const path = map.findPath(from.x, from.y, to.x, to.y, BOSS.RADIUS);
    const end = path[path.length - 1];
    assert.ok(end && Math.hypot(end.x - to.x, end.y - to.y) < TILE, `no path to ${(to.x / TILE).toFixed(1)},${(to.y / TILE).toFixed(1)}`);
    from = to;
  }
});

test("he can see the office through his glass, but not through a wall", () => {
  const map = new BankMap();
  const chair = SPOTS.bossChair;
  assert.ok(map.hasLineOfSight(chair.x, chair.y, 12 * TILE, 22.8 * TILE), "glass should not block sight");
  // The washroom is behind the cabin's solid back wall.
  assert.ok(!map.hasLineOfSight(chair.x, chair.y, 28 * TILE, 34 * TILE));
});

test("crouching behind a desk hides you; standing does not", () => {
  const map = new BankMap();
  // Boss in the aisle north of row A, player crouched just south of desk A2.
  const boss = { x: 9.7 * TILE, y: 17.6 * TILE };
  const player = { x: 9.7 * TILE, y: 21.9 * TILE };
  assert.ok(map.hasLineOfSight(boss.x, boss.y, player.x, player.y, { crouched: false }));
  assert.ok(!map.hasLineOfSight(boss.x, boss.y, player.x, player.y, { crouched: true }));
});
