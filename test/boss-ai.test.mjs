// Motu Sir's routine is the level. If it drifts — a round that never comes,
// a washroom break that does not empty the cabin, a desk check that catches
// someone sitting in their chair — the game stops being learnable. These pin
// the promises the game makes out loud.

import test from "node:test";
import assert from "node:assert/strict";
import { BankMap, SPOTS, TILE } from "../shared/bank-map.js";
import { BossBrain, BOSS } from "../shared/boss-ai.js";

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seated = { ...SPOTS.playerChair, seated: true, crouching: false, running: false, moving: false };

function run(brain, seconds, player = seated, world = {}, dt = 1 / 30) {
  const log = [];
  for (let t = 0; t < seconds; t += dt) {
    const r = brain.update(dt, player, world);
    for (const e of r.events) log.push({ t, ...e });
  }
  return log;
}

test("he sits for a minute, walks a round, then goes to the washroom next time", () => {
  const brain = new BossBrain(new BankMap(), seeded(3));
  run(brain, BOSS.OUTING_EVERY_S - 1);
  assert.equal(brain.mode, "cabin");
  run(brain, 2);
  assert.equal(brain.mode, "round");
  // The round ends back in the chair.
  let t = 0;
  while (brain.mode !== "cabin" && t < 120) {
    run(brain, 1);
    t += 1;
  }
  assert.equal(brain.mode, "cabin", "never got back from his round");
  run(brain, brain.outingIn + 0.5);
  assert.equal(brain.mode, "washroom");
  // At some point on this trip he is at the urinal, blind, for half a minute.
  let peed = 0;
  for (let i = 0; i < 180 * 30 && brain.mode !== "cabin"; i += 1) {
    brain.update(1 / 30, seated, {});
    if (brain.peeing) peed += 1 / 30;
  }
  assert.ok(Math.abs(peed - BOSS.PEE_S) < 1.5, `peed for ${peed.toFixed(1)}s`);
});

test("someone sitting at their desk is never caught, over several cycles", () => {
  const brain = new BossBrain(new BankMap(), seeded(9));
  const log = run(brain, 400);
  assert.ok(!log.some((e) => e.type === "caught"));
  assert.ok(!log.some((e) => e.type === "emptyDesk"));
});

test("a noise in the office gets him up after 10 to 15 seconds", () => {
  for (const loudness of [0.4, 0.65, 0.9]) {
    const brain = new BossBrain(new BankMap(), seeded(1));
    assert.ok(brain.hearNoise(19.9 * TILE, 18 * TILE, loudness), `did not hear a ${loudness} noise`);
    assert.equal(brain.mode, "alerted");
    const log = run(brain, 16);
    const up = log.find((e) => e.type === "standUp");
    assert.ok(up, "never stood up");
    assert.ok(up.t >= BOSS.ALERT_MIN_S - 0.1 && up.t <= BOSS.ALERT_MAX_S + 0.1, `stood up after ${up.t.toFixed(1)}s`);
    assert.equal(brain.mode, "investigate");
  }
});

test("a whisper on the far side of the building goes unheard", () => {
  const brain = new BossBrain(new BankMap(), seeded(1));
  assert.equal(brain.hearNoise(16.9 * TILE, 1 * TILE, 0.05), false);
  assert.equal(brain.mode, "cabin");
});

test("an empty chair on his desk check starts a search", () => {
  const brain = new BossBrain(new BankMap(), seeded(4));
  const away = { x: 5 * TILE, y: 35.5 * TILE, seated: false, crouching: true, running: false, moving: false };
  assert.ok(brain.hearNoise(12 * TILE, 22.8 * TILE, 0.8));
  const log = run(brain, 60, away);
  assert.ok(log.some((e) => e.type === "emptyDesk"), "walked past an empty desk without noticing");
});

test("standing in plain view in front of his glass gets you caught, if not instantly", () => {
  const brain = new BossBrain(new BankMap(), seeded(2));
  const exposed = { x: 20.5 * TILE, y: 22 * TILE, seated: false, crouching: false, running: false, moving: true };
  const first = brain.update(0.5, exposed, {});
  assert.notEqual(first.mode, "confront", "caught in half a second");
  const log = run(brain, 20, exposed);
  assert.ok(log.some((e) => e.type === "caught"));
});

test("a phone call keeps him in his chair and all but blind", () => {
  const brain = new BossBrain(new BankMap(), seeded(5));
  assert.equal(brain.phoneCall(), true);
  const exposed = { x: 14 * TILE, y: 22.8 * TILE, seated: false, crouching: false, running: false, moving: true };
  const log = run(brain, BOSS.PHONE_S - 1, exposed);
  assert.ok(!log.some((e) => e.type === "caught"));
  assert.equal(brain.mode, "phone");
});

test("his keys are only on the desk while he is in the washroom", () => {
  const brain = new BossBrain(new BankMap(), seeded(6));
  assert.equal(brain.away, false);
  brain.nextOuting = "washroom";
  brain.outingIn = 0.01;
  run(brain, 0.1);
  assert.equal(brain.away, true);
});

test("the loud jugaads at the front doors are heard from his chair", () => {
  // Smashing a padlock, sliding the dry gate, heaving the dry shutter.
  for (const [x, y, loudness] of [[16.9, 4.5, 1], [16.9, 4.5, 0.85], [16.9, 0.55, 1], [13.8, 0.55, 1]]) {
    const brain = new BossBrain(new BankMap(), seeded(8));
    assert.ok(brain.hearNoise(x * TILE, y * TILE, loudness), `did not hear ${loudness} at ${x},${y}`);
    assert.equal(brain.mode, "alerted");
  }
  // Quietly opening the wooden doors is not.
  const brain = new BossBrain(new BankMap(), seeded(8));
  assert.equal(brain.hearNoise(16.9 * TILE, 7.5 * TILE, 0.22), false);
});

test("a door he sees standing open, he walks over and locks himself", () => {
  const map = new BankMap();
  map.setDoorOpen("wooden", true);
  const brain = new BossBrain(map, seeded(9));
  // Out on the floor, looking up the hall at the open wooden doors.
  brain.mode = "round";
  brain.plan = [{ x: 16.9 * TILE, y: 12 * TILE }];
  brain.x = 16.9 * TILE;
  brain.y = 12 * TILE;
  brain.angle = -Math.PI / 2;
  const door = { id: "wooden", x: 16.9 * TILE, y: 7.5 * TILE, tampered: true };
  const first = run(brain, 0.1, seated, { doors: [door] });
  // Not locked at a glance: he is on his way.
  assert.ok(first.some((e) => e.type === "spottedDoor"));
  assert.ok(!first.some((e) => e.type === "relock"));
  assert.equal(brain.mode, "relock");
  // As in the game: once he has locked it, it is no longer open.
  const log = [];
  for (let t = 0; t < 10; t += 1 / 30) {
    for (const e of brain.update(1 / 30, seated, { doors: [door] }).events) {
      log.push({ t, ...e });
      if (e.type === "relock") door.tampered = false;
    }
  }
  const lock = log.find((e) => e.type === "relock");
  assert.ok(lock, "never locked it");
  assert.ok(lock.t > BOSS.LOCK_S - 0.1, "locked before spending time at the door");
  assert.equal(log.filter((e) => e.type === "relock").length, 1);
  // Then he goes looking for whoever opened it.
  assert.equal(brain.mode, "search");
});

test("a door shut in his face on the way leaves nothing to lock", () => {
  const map = new BankMap();
  map.setDoorOpen("wooden", true);
  const brain = new BossBrain(map, seeded(10));
  brain.x = 16.9 * TILE;
  brain.y = 12 * TILE;
  brain.startRelock("gate");
  map.setDoorOpen("wooden", false);
  const log = run(brain, 12);
  assert.ok(!log.some((e) => e.type === "relock"));
  assert.equal(brain.mode, "search");
});

test("for his first seconds in the loo he hears nothing, however loud; then he does", () => {
  const brain = new BossBrain(new BankMap(), seeded(12));
  brain.nextOuting = "washroom";
  brain.outingIn = 0.01;
  for (let t = 0; t < 60 && !brain.peeing; t += 1 / 30) brain.update(1 / 30, seated);
  assert.ok(brain.peeing, "never got to the loo");
  // A padlock smashed at the front doors, and a shout right outside.
  assert.equal(brain.hearNoise(16.9 * TILE, 4.5 * TILE, 1), false);
  assert.equal(brain.hearNoise(27 * TILE, 31 * TILE, 0.9), false);
  assert.equal(brain.mode, "washroom");
  assert.ok(brain.peeing);
  // Past the deaf spell, still in the loo: a loud noise has him out.
  for (let t = 0; t < BOSS.DEAF_S + 0.2; t += 1 / 30) brain.update(1 / 30, seated);
  assert.ok(brain.peeing, "left the loo too soon");
  assert.equal(brain.hearNoise(16.9 * TILE, 4.5 * TILE, 1), true);
  assert.equal(brain.mode, "alerted");
});
