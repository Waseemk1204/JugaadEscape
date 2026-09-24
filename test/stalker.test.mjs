// Tests for the solo mode's monster.
//
// Everything here is about fairness in both directions. A monster that catches
// you the instant you see it is a trap; one that wedges itself in a corner for
// the rest of the run is furniture. And the two promises the mode makes to the
// player — "it will usually ignore you" and "if you run far enough it gives
// up" — are exactly the kind of thing that quietly stops being true after a
// tuning pass, so they are pinned down here.

import test from "node:test";
import assert from "node:assert/strict";
import { LobbyMaze, TILE, PLAYER_RADIUS } from "../shared/lobby.js";
import { StalkerBrain, RANGE, TIMING, STALKER_SPEED } from "../shared/stalker-ai.js";

// A fixed sequence so a failure is reproducible rather than "it happened once".
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(seed = 7) {
  const level = new LobbyMaze(seed);
  const brain = new StalkerBrain(level, seededRandom(seed));
  const spawn = level.findOpenSpot(0, 0);
  return { level, brain, spawn };
}

// A level with no walls at all, for isolating one sense at a time.
const openLevel = { isBlocked: () => false, hasLineOfSight: () => true };
const blindLevel = { isBlocked: () => false, hasLineOfSight: () => false };

const player = (x, y, extra = {}) => ({
  x, y, moving: false, running: false, crouching: false, torchOn: false, ...extra,
});

test("it never spawns within sight of the player", () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const { level, brain, spawn } = setup(seed);
    assert.equal(brain.spawn(spawn.x, spawn.y), true, `seed ${seed}: failed to find any spawn`);
    assert.equal(
      level.hasLineOfSight(brain.x, brain.y, spawn.x, spawn.y),
      false,
      `seed ${seed}: it spawned in plain view`,
    );
    assert.equal(level.isBlocked(brain.x, brain.y, PLAYER_RADIUS), false, `seed ${seed}: it spawned inside a wall`);
  }
});

test("it ignores a still player who is outside its vision cone", () => {
  // The core promise of the mode: you can watch it walk past you.
  const brain = new StalkerBrain(openLevel, seededRandom(3));
  brain.x = 0;
  brain.y = 0;
  brain.angle = 0; // looking along +x
  const behind = player(-RANGE.SIGHT * 0.5, 0);
  assert.equal(brain.sense(behind), null, "it noticed someone stood directly behind it");
  const ahead = player(RANGE.SIGHT * 0.5, 0);
  assert.equal(brain.sense(ahead), "seen", "it failed to see someone straight in front of it");
});

test("standing too close gives you away whatever it is looking at", () => {
  const brain = new StalkerBrain(openLevel, seededRandom(4));
  brain.x = 0;
  brain.y = 0;
  brain.angle = Math.PI; // looking away
  assert.equal(brain.sense(player(RANGE.PROXIMITY * 0.5, 0)), "close");
  assert.equal(brain.sense(player(RANGE.PROXIMITY * 2.5, 0)), null);
});

test("sound is the sense that works around corners", () => {
  // Hearing only ever matters when it cannot see you: its sight range is wider
  // than any hearing range, so a clear line of sight always wins.
  const brain = new StalkerBrain(blindLevel, seededRandom(5));
  brain.x = 0;
  brain.y = 0;
  const at = (distance, extra) => player(distance, 0, { moving: true, ...extra });

  assert.equal(brain.sense(at(RANGE.HEAR_WALK * 0.9)), "heard", "a walk inside hearing range went unnoticed");
  assert.equal(brain.sense(at(RANGE.HEAR_WALK * 1.4)), null, "a walk beyond hearing range was still heard");
  assert.equal(brain.sense(at(RANGE.HEAR_WALK * 1.4, { running: true })), "heard", "a sprint was no louder than a walk");
  assert.equal(brain.sense(at(RANGE.HEAR_WALK * 0.9, { crouching: true })), null, "crouching was as loud as walking");
  assert.equal(brain.sense(at(RANGE.HEAR_WALK * 0.9, { moving: false })), null, "it heard someone standing still");
});

test("a lit torch gives you away beyond its normal sight range", () => {
  const brain = new StalkerBrain(openLevel, seededRandom(6));
  brain.x = 0;
  brain.y = 0;
  brain.angle = 0;
  const far = player(RANGE.SIGHT * 1.25, 0);
  assert.equal(brain.sense(far), null, "it saw an unlit, still player beyond its sight range");
  assert.equal(brain.sense({ ...far, torchOn: true }), "seen", "a lit torch did not give the player away");
});

test("it stares before it charges, and the stare is long enough to react to", () => {
  const brain = new StalkerBrain(openLevel, seededRandom(8));
  // A level with no walls can never satisfy spawn()'s "out of sight" rule, so
  // place it by hand.
  brain.active = true;
  brain.x = 0;
  brain.y = 0;
  brain.angle = 0;
  const seen = player(RANGE.SIGHT * 0.4, 0);

  brain.update(1 / 60, seen);
  assert.equal(brain.state, "notice", "it went straight to hunting with no warning");

  const startedAt = { x: brain.x, y: brain.y };
  for (let i = 0; i < Math.round(TIMING.NOTICE_S * 60) - 4; i += 1) brain.update(1 / 60, seen);
  assert.equal(brain.state, "notice", "the stare was shorter than advertised");
  assert.ok(
    Math.hypot(brain.x - startedAt.x, brain.y - startedAt.y) < 1,
    "it closed distance during the stare, which is the player's only warning",
  );

  for (let i = 0; i < 12; i += 1) brain.update(1 / 60, seen);
  assert.equal(brain.state, "hunt", "it never committed to the chase");

  // And it does not snap to full speed the instant it commits: the first
  // moment of the chase is slower, so the warning is worth something.
  assert.ok(
    brain.speedFor() < STALKER_SPEED.HUNT * 0.75,
    "it hit full chase speed immediately, which makes the stare decorative",
  );
  for (let i = 0; i < 120; i += 1) brain.update(1 / 60, seen);
  assert.equal(brain.speedFor(), STALKER_SPEED.HUNT, "it never reached full chase speed");
});

test("the warning is long enough to get out of its reach", () => {
  // Concretely: from the moment it sees you at the edge of its sight, a player
  // who turns and sprints has to be further away when the chase starts than
  // when it began.
  const brain = new StalkerBrain(openLevel, seededRandom(31));
  brain.active = true;
  brain.x = 0;
  brain.y = 0;
  brain.angle = 0;
  const runner = player(RANGE.SIGHT * 0.5, 0, { moving: true, running: true });
  const startDistance = brain.distanceTo(runner.x, runner.y);
  // Two and a half seconds of sprinting away at the player's run speed.
  for (let i = 0; i < 150; i += 1) {
    runner.x += 178 / 60;
    brain.update(1 / 60, runner);
  }
  assert.ok(
    brain.distanceTo(runner.x, runner.y) > startDistance,
    "reacting instantly and sprinting still lost ground — the warning is too short",
  );
});

// A chase in progress, with it right behind the player, for the give-up tests.
function chasing(level, seed) {
  const brain = new StalkerBrain(level, seededRandom(seed));
  brain.active = true;
  brain.x = 0;
  brain.y = 0;
  brain.angle = 0;
  brain.state = "hunt";
  brain.chaseFor = 0;
  brain.unseenFor = 0;
  return brain;
}

// Run until it stops chasing, or give up waiting. Returns seconds taken.
function secondsUntilWander(brain, playerAt, limitS = 15) {
  let frames = 0;
  while (brain.state !== "wander" && frames < limitS * 60) {
    brain.update(1 / 60, playerAt(frames));
    frames += 1;
  }
  return brain.state === "wander" ? frames / 60 : Infinity;
}

test("staying out of its sight for five seconds makes it leave", () => {
  const brain = chasing(blindLevel, 9);
  // Sprinting, torch on — loud and bright — but behind walls the whole time.
  // Hearing tells it where to go; it does not keep the chase alive.
  const seconds = secondsUntilWander(brain, () =>
    player(RANGE.HEAR_RUN * 0.5, 0, { moving: true, running: true, torchOn: true }),
  );
  assert.ok(
    Math.abs(seconds - TIMING.OUT_OF_SIGHT_S) < 0.2,
    `it took ${seconds.toFixed(1)}s out of sight to give up, not ${TIMING.OUT_OF_SIGHT_S}s`,
  );
});

test("surviving a chase for ten seconds makes it leave, even in plain sight", () => {
  // No walls anywhere, and the player never breaks line of sight: the only way
  // this chase ends is the ten-second ceiling.
  const brain = chasing(openLevel, 10);
  const seconds = secondsUntilWander(brain, () =>
    // Kept just ahead of it the whole way, so it never actually catches up.
    player(brain.x + RANGE.CATCH * 5, brain.y, { moving: true, running: true, torchOn: true }),
  );
  assert.ok(
    Math.abs(seconds - TIMING.CHASE_S) < 0.2,
    `a chase in plain sight lasted ${seconds.toFixed(1)}s instead of ${TIMING.CHASE_S}s`,
  );
});

test("being seen again resets the out-of-sight clock, but never the chase clock", () => {
  // Dip out of sight for two seconds, pop back into view for a moment, then
  // hide again — repeatedly. Each glimpse restarts the three-second clock, so
  // that rule alone would never fire; the ten-second ceiling still has to.
  let visible = true;
  const level = { isBlocked: () => false, hasLineOfSight: () => visible };
  const brain = chasing(level, 12);
  const seconds = secondsUntilWander(brain, (frame) => {
    visible = frame % 150 < 15; // seen for a quarter second in every 2.5
    return player(brain.x + RANGE.CATCH * 5, brain.y, { moving: true, running: true });
  });
  assert.ok(
    Math.abs(seconds - TIMING.CHASE_S) < 0.2,
    `glimpses kept it chasing for ${seconds.toFixed(1)}s — the ceiling is ${TIMING.CHASE_S}s`,
  );
});

test("when it gives up it goes the other way and stays blind for a while", () => {
  const brain = chasing(blindLevel, 14);
  const hidden = player(400 * TILE, 400 * TILE, { crouching: true });
  secondsUntilWander(brain, () => hidden);
  assert.equal(brain.state, "wander");

  const towardPlayer = Math.atan2(hidden.y - brain.y, hidden.x - brain.x);
  const delta = Math.abs(((brain.angle - towardPlayer + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  assert.ok(delta > Math.PI / 2, "it gave up but carried on walking toward the player");
  assert.ok(brain.blindFor > 0, "it could re-notice the player the instant it gave up");
  assert.equal(brain.sense(player(0, 0, { moving: true, running: true })), null, "the blind window does nothing");
});

test("none of that applies once the power is out", () => {
  // The run to the exit is the one chase that does not end.
  const brain = chasing(blindLevel, 16);
  brain.goFinal();
  const seconds = secondsUntilWander(brain, () => player(400 * TILE, 400 * TILE, { crouching: true }), 20);
  assert.equal(seconds, Infinity, `the endgame chase ended after ${seconds.toFixed(1)}s`);
});

test("it patrols inside the distance the player can actually see", () => {
  // This is the bug that made the whole mode feel empty. The player can see
  // about 22m through the fog; the monster patrolled at 14–42m, so it was out
  // of sight almost all the time and the level read as a maze with a noise in
  // it. Wandering has to happen where it can be seen.
  const { brain, spawn } = setup(23);
  brain.spawn(spawn.x, spawn.y);
  assert.ok(
    brain.distanceTo(spawn.x, spawn.y) < 22 * 32,
    "it spawned beyond the fog, so its first appearance is a noise with nothing attached",
  );

  const hidden = player(spawn.x, spawn.y, { crouching: true });
  let inSight = 0;
  const frames = 9000;
  for (let i = 0; i < frames; i += 1) {
    const result = brain.update(1 / 60, hidden);
    // Hold it in wander: this is about where it walks, not what it hunts.
    brain.state = "wander";
    brain.blindFor = 1;
    if (result.distance < 22 * 32) inSight += 1;
  }
  const share = inSight / frames;
  assert.ok(share > 0.75, `it was within sight only ${Math.round(share * 100)}% of the time`);
});

test("after a death it is nowhere near where you wake up", () => {
  const { brain, spawn } = setup(17);
  brain.spawn(spawn.x, spawn.y);
  // The player respawns a long way off; the monster is banished relative to
  // that new position, and cannot sense them while they get their bearings.
  const woke = { x: spawn.x + 70 * 32, y: spawn.y + 40 * 32 };
  assert.equal(brain.banish(woke.x, woke.y, 5), true);
  assert.ok(brain.distanceTo(woke.x, woke.y) > RANGE.SIGHT, "it came back within sight of the respawn");
  assert.equal(
    brain.sense(player(woke.x, woke.y, { moving: true, running: true })),
    null,
    "there was no grace period after respawning",
  );
});

test("it never wedges itself permanently against the level", () => {
  for (let seed = 1; seed <= 8; seed += 1) {
    const { level, brain, spawn } = setup(seed);
    brain.spawn(spawn.x, spawn.y);
    const chased = player(spawn.x, spawn.y, { moving: true, running: true, torchOn: true });
    let stuckFrames = 0;
    let worstStuck = 0;
    for (let i = 0; i < 4000; i += 1) {
      const before = { x: brain.x, y: brain.y };
      // Keep the player just out of reach so the chase never ends.
      chased.x = brain.x + RANGE.CATCH * 4;
      chased.y = brain.y;
      brain.update(1 / 60, chased);
      const moved = Math.hypot(brain.x - before.x, brain.y - before.y);
      // It is allowed to stand still while it stares; that is the design.
      stuckFrames = moved < 0.05 && brain.state !== "notice" ? stuckFrames + 1 : 0;
      worstStuck = Math.max(worstStuck, stuckFrames);
      assert.equal(level.isBlocked(brain.x, brain.y, 1), false, `seed ${seed}: it walked into a wall`);
    }
    assert.ok(worstStuck < 60, `seed ${seed}: it stopped moving for ${worstStuck} frames`);
  }
});

test("it closes on a player it can sense", () => {
  const brain = new StalkerBrain(openLevel, seededRandom(5));
  brain.active = true;
  brain.x = 0;
  brain.y = 0;
  brain.angle = 0;
  const chased = player(RANGE.SIGHT * 0.8, 0, { moving: true, running: true, torchOn: true });
  const start = brain.distanceTo(chased.x, chased.y);
  let closest = start;
  let caught = false;
  for (let i = 0; i < 2400; i += 1) {
    const result = brain.update(1 / 60, chased);
    closest = Math.min(closest, result.distance);
    if (result.caught) {
      caught = true;
      break;
    }
  }
  assert.ok(caught, `it never reached a stationary player: got to ${Math.round(closest)} from ${Math.round(start)}`);
});

test("proximity reads 0 far away and 1 on top of you", () => {
  const { brain, spawn } = setup(2);
  brain.spawn(spawn.x, spawn.y);
  brain.x = spawn.x + RANGE.DREAD * 2;
  brain.y = spawn.y;
  assert.equal(brain.update(0, player(spawn.x, spawn.y)).proximity, 0);
  brain.x = spawn.x;
  brain.y = spawn.y;
  assert.equal(brain.update(0, player(spawn.x, spawn.y)).proximity, 1);
});
